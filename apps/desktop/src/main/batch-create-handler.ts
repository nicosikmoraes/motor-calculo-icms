import { createHash, randomUUID } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { app, ipcMain } from 'electron'
import { IPC_CHANNELS, type CreatedBatchSummary, type CreateBatchInput } from '@motor/contracts'
import { ContentConflictCode, IngestionStatusCode, RepetitionCode, SqliteBatchRepository, SqliteCompanyRepository, SqliteOrganizationRepository, SqliteFiscalCatalogRepository, SqliteVersionedRuleRepository, type NormalizedFiscalDocumentRecord } from '@motor/database'
import { AppError, AppErrorCode, BatchStatusCode, classifyDocumentIngestion, classifyDocumentOccurrences, normalizeCnpj,
  type NormalizedDocumentArtifact, type NormalizedNfe } from '@motor/domain'
import { PRODUCTION_XML_SECURITY_POLICY, PRODUCTION_ZIP_SECURITY_POLICY,
  parseDocumentArtifactXml, visitSafeZipFileEntries } from '@motor/nfe-parser'
import { assessFiscalRules } from './rule-pack-assessment'
import { ImportStaging } from './import-staging'
import { associateDocumentArtifacts } from './document-artifact-association'
import { activeDatabase, hashFile, inputRecord, isCancelled, runBatchOperation,
  validatedSources } from './main-services'

import { ImportIssueCode, ImportIssueMessage, formatImportIssueMessage } from './import-issues'

/** Importa o lote: lê arquivos, classifica ocorrências e grava tudo em uma transação. */
export function registerBatchCreateHandler(): void {
  ipcMain.handle(
    IPC_CHANNELS.CREATE_BATCH,
    async (event, rawInput: unknown): Promise<CreatedBatchSummary> => {
      const input = inputRecord(rawInput) as unknown as CreateBatchInput
      return runBatchOperation(event, input.operationId, 'PROCESSING', input.totalEntries, async (session) => {
      const sources = validatedSources(input.sources)
      if (sources.length === 0) throw new AppError(AppErrorCode.MISSING_SOURCE)
      if (input.environmentCode !== '1' && input.environmentCode !== '2') {
        throw new AppError(AppErrorCode.INVALID_ENVIRONMENT)
      }
      const environmentCode = input.environmentCode
      const connection = activeDatabase()
      const organizations = new SqliteOrganizationRepository(connection)
      const organization = organizations.findSingle()
      if (!organization) throw new AppError(AppErrorCode.ORGANIZATION_REQUIRED, { action: 'criar o lote' })
      if (!Array.isArray(input.assignments)) throw new AppError(AppErrorCode.ASSIGNMENTS_REQUIRED)
      const assignmentBySource = new Map(input.assignments.map(({ source, companyId }) => [source, companyId]))
      if (assignmentBySource.size !== input.assignments.length) throw new AppError(AppErrorCode.DUPLICATE_ASSIGNMENT)
      const companies = new Map(new SqliteCompanyRepository(connection)
        .listByOrganization(organization.id).filter(({ active }) => active).map((company) => [company.id, company]))

      const staging = await ImportStaging.create(join(app.getPath('userData'), 'import-staging'))
      try {
      const batchId = randomUUID()
      const receivedAt = new Date().toISOString()
      type Pending = {
        relativePath: string; originalName: string; kind: 'XML' | 'ZIP';
        source?: string;
        origin: 'SELECTED_FILE' | 'ZIP_ENTRY'; containerName?: string;
        hash: string; size: number; accessKey?: string; normalizedPath?: string;
        artifactPath?: string;
        issue?: { code: string; message: string }
      }
      const pending: Pending[] = []
      const issues: { source: string; code: string; message: string; occurrenceId?: string }[] = []
      let completedEntries = 0

      // Guarda cada XML com hash e diagnóstico, inclusive quando a leitura falha.
      const addXml = async (contents: Buffer, relativePath: string, source: string, origin: Pending['origin'], containerName?: string): Promise<void> => {
        let accessKey: string | undefined
        let normalized: NormalizedNfe | undefined
        let artifact: NormalizedDocumentArtifact | undefined
        let issue: Pending['issue']
        try {
          const parsed = parseDocumentArtifactXml(contents.toString('utf8'))
          if (parsed.kind === 'NFE') {
            normalized = parsed.note
            artifact = parsed.embeddedProtocol
            accessKey = normalized.accessKey
          } else {
            artifact = parsed.artifact
            accessKey = artifact.accessKey
          }
        } catch (cause) {
          issue = { code: ImportIssueCode.XML_NAO_IDENTIFICADO, message: cause instanceof Error ? cause.message : ImportIssueMessage.XML_INVALID }
        }
        const normalizedPath = normalized ? await staging.stage(normalized) : undefined
        const artifactPath = artifact ? await staging.stageArtifact(artifact) : undefined
        pending.push({
          relativePath,
          originalName: basename(relativePath),
          source,
          kind: 'XML', origin, ...(containerName ? { containerName } : {}),
          hash: createHash('sha256').update(contents).digest('hex'), size: contents.byteLength,
          ...(accessKey ? { accessKey } : {}), ...(normalizedPath ? { normalizedPath } : {}),
          ...(artifactPath ? { artifactPath } : {}),
          ...(issue ? { issue } : {}),
        })
      }

      // Lê XMLs e ZIPs com os limites de tamanho e cancelamento da importação.
      for (const source of sources) {
        if (session.cancelled) break
        const metadata = await stat(source.path)
        if (session.cancelled) break
        if (source.kind === 'XML') {
          if (metadata.size > PRODUCTION_XML_SECURITY_POLICY.maxBytes) {
            issues.push({ source: source.path, code: ImportIssueCode.XML_TOO_LARGE, message: ImportIssueMessage.XML_TOO_LARGE })
          } else {
            const contents = await readFile(source.path)
            if (session.cancelled) break
            await addXml(contents, basename(source.path), source.path, 'SELECTED_FILE')
          }
          completedEntries += 1
          session.report('PROCESSING', completedEntries, input.totalEntries, basename(source.path))
          continue
        }

        let archiveHash: string
        try {
          archiveHash = await hashFile(source.path, session)
        } catch (cause) {
          if (isCancelled(cause)) break
          throw cause
        }
        pending.push({
          relativePath: basename(source.path), originalName: basename(source.path), kind: 'ZIP',
          origin: 'SELECTED_FILE', hash: archiveHash, size: metadata.size,
        })
        let zipCompleted = 0
        try {
          const inspection = await visitSafeZipFileEntries(
            source.path,
            PRODUCTION_ZIP_SECURITY_POLICY,
            async ({ relativePath, contents }) => {
              if (relativePath.toLowerCase().endsWith('.xml')) {
                await addXml(contents, relativePath, `${source.path}#${relativePath}`, 'ZIP_ENTRY', basename(source.path))
              }
            },
            {
              signal: session.signal,
              onProgress: (completed, total, entryName) => {
                zipCompleted = completed
                session.report('PROCESSING', completedEntries + completed,
                  Math.max(input.totalEntries, completedEntries + total),
                  entryName ? `${basename(source.path)}#${entryName}` : basename(source.path))
              },
              onRejected: (rejected) => {
                issues.push({ source: `${basename(source.path)}#${rejected.entryName}`,
                  code: rejected.code, message: rejected.message })
              },
            },
          )
          completedEntries += inspection.totalEntries

        } catch (cause) {
          completedEntries += zipCompleted
          if (isCancelled(cause)) break
          issues.push({ source: basename(source.path), code: ImportIssueCode.ZIP_REJEITADO, message: cause instanceof Error ? cause.message : ImportIssueMessage.ZIP_REJECTED })
        }
      }

      await new Promise<void>((resolve) => setImmediate(resolve))
      const cancelled = session.cancelled

      const recognized = pending.filter((item) => item.normalizedPath)
      const recognizedSources = new Set(recognized.map((item) => item.source))
      const recognizedArtifacts = pending.filter((item) => item.artifactPath)
      if (recognized.length === 0 && recognizedArtifacts.length === 0 && !cancelled) {
        throw new AppError(AppErrorCode.NO_VALID_DOCUMENT)
      }
      if (recognizedSources.size !== recognized.length) throw new AppError(AppErrorCode.DUPLICATE_XML_PATH)
      if (!cancelled && (assignmentBySource.size !== recognized.length || [...assignmentBySource.keys()].some((source) => !recognizedSources.has(source)))) {
        throw new AppError(AppErrorCode.ASSIGNMENTS_MISMATCH)
      }
      for (const item of recognized) {
        const company = companies.get(assignmentBySource.get(item.source!) ?? '')
        if (!company || !company.active) throw new AppError(AppErrorCode.COMPANY_REQUIRED_FOR_DOCUMENT, { path: item.relativePath })
        const normalized = staging.read(item.normalizedPath!)
        const parties = [normalized.issuer, normalized.recipient]
        if (!parties.some((party) => party?.taxIdType === 'CNPJ' && party.taxId && normalizeCnpj(party.taxId) === company.cnpj)) {
          throw new AppError(AppErrorCode.COMPANY_NOT_IN_DOCUMENT, { path: item.relativePath })
        }
      }
      const firstCompanyId = recognized.length
        ? assignmentBySource.get(recognized[0]!.source!)!
        : input.artifactCompanyId ?? input.assignments[0]?.companyId
      if (!firstCompanyId || !companies.get(firstCompanyId)?.active) throw new AppError(AppErrorCode.INVALID_INITIAL_COMPANY)

      // A ordem estável evita que a escolha da ocorrência original dependa da seleção.
      pending.sort((left, right) => left.relativePath.localeCompare(right.relativePath) || left.hash.localeCompare(right.hash))
      const baseOccurrences = pending.map((item, index) => ({ item, id: randomUUID(), order: index + 1 }))
      const xmlClassifications = classifyDocumentOccurrences(
        baseOccurrences.filter(({ item }) => item.normalizedPath).map(({ item, id, order }) => ({
          occurrenceId: id, batchId, order, contentHash: item.hash,
          ...(item.accessKey ? { accessKey: item.accessKey } : {}),
        })),
      )
      const classificationById = new Map(xmlClassifications.map((value) => [value.occurrenceId, value]))
      const occurrences = baseOccurrences.map(({ item, id, order }) => {
        const classified = classificationById.get(id)
        if (item.issue) issues.push({ source: item.relativePath, ...item.issue })
        return {
          id, batchId, originalName: item.originalName, relativePath: item.relativePath,
          detectedKind: item.kind, origin: item.origin, ...(item.containerName ? { containerName: item.containerName } : {}),
          contentHash: item.hash, sizeBytes: item.size, order,
          ...(item.accessKey ? { accessKey: item.accessKey } : {}),
          ingestionStatus: item.issue ? IngestionStatusCode.PENDENTE : IngestionStatusCode.PROCESSADA,
          repetition: classified?.repetition ?? RepetitionCode.NAO_CLASSIFICAVEL,
          contentConflict: classified?.contentConflict ?? ContentConflictCode.NAO_CLASSIFICAVEL,
          ...(classified?.originalOccurrenceId ? { originalOccurrenceId: classified.originalOccurrenceId } : {}),
          eligibleForTotalsByOccurrencePolicy: classified?.eligibleForTotalsByOccurrencePolicy ?? false,
          receivedAt,
        }
      })
      const reasonMessages = {
        EMPRESA_DIVERGENTE: 'O CNPJ da empresa analisada não consta como emitente nem destinatário.',
        AMBIENTE_NAO_INFORMADO: 'O XML não informa um ambiente fiscal reconhecível.',
        AMBIENTE_DIVERGENTE: 'O ambiente do XML diverge do ambiente confirmado para o lote.',
        OCORRENCIA_INELEGIVEL: 'A ocorrência é repetida ou possui conflito de conteúdo.',
      } as const
      // Uma fotografia das versões é usada para todos os itens desta importação.
      const fiscalCatalog = new SqliteFiscalCatalogRepository(connection)
      const versionedRules = new SqliteVersionedRuleRepository(connection).list(organization.id)
      const profilesByCompany = new Map([...companies.keys()].map((id) => [id, fiscalCatalog.listProfiles(id)] as const))
      const productsByCompany = new Map([...companies.keys()].map((id) => [id, fiscalCatalog.listSupplierProducts(id)] as const))
      // A classificação percorre as notas uma a uma; somente metadados seguem até a transação.
      const documentSeeds: {
        id: string; occurrenceId: string; contentHash: string; companyId: string; accessKey: string;
        normalizedPath: string; eligibleForProcessing: boolean; pendingReason?: string;
      }[] = []
      for (const { item, id } of baseOccurrences) {
        if (!item.normalizedPath) continue
        const normalized = staging.read(item.normalizedPath)
        const company = companies.get(assignmentBySource.get(item.source!)!)!
        const occurrence = classificationById.get(id)
        const classification = classifyDocumentIngestion(
          normalized, company.cnpj, environmentCode,
          occurrence?.eligibleForTotalsByOccurrencePolicy ?? false,
        )
        for (const reason of classification.pendingReasons) {
          issues.push({ source: item.relativePath, code: reason, message: reasonMessages[reason], occurrenceId: id })
        }
        documentSeeds.push({
          id: randomUUID(), occurrenceId: id, contentHash: item.hash, accessKey: normalized.accessKey,
          companyId: company.id, normalizedPath: item.normalizedPath,
          eligibleForProcessing: classification.eligibleForProcessing,
          ...(classification.pendingReasons.length > 0
            ? { pendingReason: classification.pendingReasons.join(',') } : {}),
        })
      }
      if (documentSeeds.length === 0 && recognizedArtifacts.length === 0) {
        issues.push({
          source: 'lote',
          code: ImportIssueCode.LOTE_SEM_DOCUMENTOS,
          message: ImportIssueMessage.BATCH_WITHOUT_DOCUMENTS,
        })
      }
      const association = associateDocumentArtifacts(batchId, receivedAt,
        documentSeeds.map((seed) => ({ id: seed.id, accessKey: seed.accessKey,
          contentConflict: classificationById.get(seed.occurrenceId)?.contentConflict === ContentConflictCode.CONFLITO_CONTEUDO })),
        baseOccurrences.flatMap(({ item, id }) => item.artifactPath
          ? [{ occurrenceId: id, relativePath: item.relativePath, contentHash: item.hash, artifact: staging.readArtifact(item.artifactPath) }]
          : []))
      issues.push(...association.issues)
      for (const artifact of association.artifacts) {
        const artifactEnvironment = artifact.normalized.environmentCode
        if (artifactEnvironment && artifactEnvironment !== environmentCode) {
          const source = baseOccurrences.find(({ id }) => id === artifact.occurrenceId)?.item.relativePath ?? 'lote'
          issues.push({ source, occurrenceId: artifact.occurrenceId,
            code: ImportIssueCode.ARTIFACT_ENVIRONMENT_MISMATCH,
            message: ImportIssueMessage.ARTIFACT_ENVIRONMENT_MISMATCH })
        }
      }
      if (cancelled) {
        issues.push({
          source: 'lote',
          code: ImportIssueCode.IMPORTACAO_CANCELADA,
          message: formatImportIssueMessage(ImportIssueMessage.IMPORT_CANCELLED, { completed: completedEntries, total: session.total }),
        })
      }
      const diagnostics = issues.map((issue) => ({
        id: randomUUID(), batchId, source: issue.source, code: issue.code,
        message: issue.message, ...(issue.occurrenceId ? { occurrenceId: issue.occurrenceId } : {}),
        createdAt: receivedAt,
      }))
      session.report('SAVING', completedEntries, session.total)
      const batches = new SqliteBatchRepository(connection)
      // A transação consome cada nota do estágio e a libera antes de carregar a próxima.
      function* documents(): Generator<NormalizedFiscalDocumentRecord> {
        for (const seed of documentSeeds) {
          const normalized = staging.read(seed.normalizedPath)
          yield {
            id: seed.id, batchId, occurrenceId: seed.occurrenceId, contentHash: seed.contentHash,
            companyId: seed.companyId, normalized,
            ruleAssessments: Object.fromEntries(normalized.items.map((line) => [
              line.itemNumber, assessFiscalRules(normalized, line, versionedRules, seed.companyId,
                profilesByCompany.get(seed.companyId), productsByCompany.get(seed.companyId), receivedAt),
            ])),
            eligibleForProcessing: seed.eligibleForProcessing,
            ...(seed.pendingReason ? { pendingReason: seed.pendingReason } : {}),
            createdAt: receivedAt,
          }
        }
      }
      // O repositório salva lote, ocorrências, diagnósticos e documentos atomicamente.
      batches.createWithOccurrences({
        id: batchId, organizationId: organization.id, companyId: firstCompanyId,
        originalName: sources.length === 1 ? basename(sources[0]!.path) : `Lote com ${sources.length} fontes`,
        receivedAt,
        status: cancelled ? BatchStatusCode.CANCELADO : diagnostics.length > 0 ? BatchStatusCode.CONCLUIDO_COM_PENDENCIAS : BatchStatusCode.CONCLUIDO,
        ...(cancelled ? { lastCanceledAt: receivedAt } : {}),
        environmentCode,
        createdAt: receivedAt,
        updatedAt: receivedAt,
      }, occurrences, diagnostics, documents(), association.artifacts)
      const stored = batches.findById(batchId)!
      return {
        id: stored.id, status: stored.status, totalFiles: stored.totalFiles,
        totalDocuments: stored.totalDocuments, totalPendencies: stored.totalPendencies,
      }
      } finally {
        await staging.dispose()
      }
      })
    },
  )
}
