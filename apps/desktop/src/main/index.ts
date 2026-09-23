import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, stat } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import {
  IPC_CHANNELS,
  type BatchCompanyCandidate,
  type BatchPreparation,
  type BatchDetail,
  type BatchListItem,
  type CreatedBatchSummary,
  type CreateBatchInput,
  type CompanySummary,
  type CreateCompanyInput,
  type CreateOrganizationInput,
  type OrganizationSummary,
  type RenameOrganizationInput,
  type SelectedSource,
  type WorkspaceState,
} from '@motor/contracts'
import {
  CORE_MIGRATIONS,
  SqliteCompanyRepository,
  SqliteBatchRepository,
  SqliteDatabase,
  SqliteOrganizationRepository,
  runSqlMigrationsWithBackup,
} from '@motor/database'
import {
  classifyDocumentIngestion,
  classifyDocumentOccurrences,
  normalizeBrazilianState,
  normalizeCnpj,
  type FiscalEnvironmentCode,
  type NormalizedNfe,
} from '@motor/domain'
import {
  PRODUCTION_XML_SECURITY_POLICY,
  PRODUCTION_ZIP_SECURITY_POLICY,
  normalizeNfeStructure,
  readNfeXmlStructure,
  visitSafeZipFileEntries,
} from '@motor/nfe-parser'

const allowedExtensions = new Set(['.xml', '.zip'])
let database: SqliteDatabase | undefined
const approvedSourcePaths = new Set<string>()

function activeDatabase(): SqliteDatabase {
  if (!database) throw new Error('Banco de dados ainda não está disponível.')
  return database
}

function inputRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Entrada inválida.')
  }
  return value as Record<string, unknown>
}

function requiredInputText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} deve ser informado.`)
  return value.trim()
}

function optionalInputText(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') throw new Error('Campo de texto inválido.')
  return value.trim() || undefined
}

function organizationSummary(organization: { id: string; name: string }): OrganizationSummary {
  return { id: organization.id, name: organization.name }
}

function companySummary(company: {
  id: string
  legalName: string
  tradeName?: string
  cnpj: string
  state: string
  active: boolean
}): CompanySummary {
  return {
    id: company.id,
    legalName: company.legalName,
    ...(company.tradeName ? { tradeName: company.tradeName } : {}),
    cnpj: company.cnpj,
    state: company.state,
    active: company.active,
  }
}

function validatedSources(rawSources: unknown): SelectedSource[] {
  if (!Array.isArray(rawSources)) throw new Error('Lista de arquivos inválida.')
  return rawSources.map((value): SelectedSource => {
    const source = inputRecord(value)
    const path = requiredInputText(source.path, 'Caminho do arquivo')
    const kind = source.kind
    if (kind !== 'XML' && kind !== 'ZIP') throw new Error('Tipo de arquivo inválido.')
    if (!approvedSourcePaths.has(path)) throw new Error('Arquivo não autorizado pelo seletor.')
    return { path, kind }
  })
}

async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer)
  return hash.digest('hex')
}

async function openDatabase(): Promise<void> {
  const dataDirectory = app.getPath('userData')
  const backupDirectory = join(dataDirectory, 'backups')
  await mkdir(backupDirectory, { recursive: true })

  database = new SqliteDatabase(join(dataDirectory, 'motor-icms.sqlite'))
  try {
    await runSqlMigrationsWithBackup(database, CORE_MIGRATIONS, {
      appVersion: app.getVersion(),
      backupPath: join(backupDirectory, `pre-migration-${Date.now()}-${randomUUID()}.sqlite`),
    })
  } catch (error) {
    database.close()
    database = undefined
    throw error
  }
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#f4f1e8',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  window.once('ready-to-show', () => window.show())

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.APP_VERSION, () => app.getVersion())
  ipcMain.handle(IPC_CHANNELS.GET_WORKSPACE, (): WorkspaceState => {
    const connection = activeDatabase()
    const organization = new SqliteOrganizationRepository(connection).findSingle()
    return {
      ...(organization ? { organization: organizationSummary(organization) } : {}),
      companies: organization
        ? new SqliteCompanyRepository(connection)
            .listByOrganization(organization.id)
            .map(companySummary)
        : [],
    }
  })
  ipcMain.handle(
    IPC_CHANNELS.CREATE_ORGANIZATION,
    (_event, rawInput: unknown): OrganizationSummary => {
      const input = inputRecord(rawInput) as unknown as CreateOrganizationInput
      const timestamp = new Date().toISOString()
      const organization = {
        id: randomUUID(),
        name: requiredInputText(input.name, 'Nome do escritório'),
        active: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      new SqliteOrganizationRepository(activeDatabase()).createSingle(organization)
      return organizationSummary(organization)
    },
  )
  ipcMain.handle(
    IPC_CHANNELS.RENAME_ORGANIZATION,
    (_event, rawInput: unknown): OrganizationSummary => {
      const input = inputRecord(rawInput) as unknown as RenameOrganizationInput
      const repository = new SqliteOrganizationRepository(activeDatabase())
      const organization = repository.findSingle()
      if (!organization) throw new Error('Configure a organização antes de renomeá-la.')
      repository.rename(
        organization.id,
        requiredInputText(input.name, 'Nome do escritório'),
        new Date().toISOString(),
      )
      return organizationSummary(repository.findById(organization.id)!)
    },
  )
  ipcMain.handle(
    IPC_CHANNELS.CREATE_COMPANY,
    (_event, rawInput: unknown): CompanySummary => {
      const input = inputRecord(rawInput) as unknown as CreateCompanyInput
      const connection = activeDatabase()
      const organization = new SqliteOrganizationRepository(connection).findSingle()
      if (!organization) throw new Error('Configure o escritório antes de cadastrar empresas.')
      const timestamp = new Date().toISOString()
      const tradeName = optionalInputText(input.tradeName)
      const company = {
        id: randomUUID(),
        organizationId: organization.id,
        legalName: requiredInputText(input.legalName, 'Razão social'),
        ...(tradeName ? { tradeName } : {}),
        cnpj: normalizeCnpj(requiredInputText(input.cnpj, 'CNPJ')),
        state: normalizeBrazilianState(requiredInputText(input.state, 'UF')),
        active: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      new SqliteCompanyRepository(connection).create(company)
      return companySummary(company)
    },
  )
  ipcMain.handle(IPC_CHANNELS.SELECT_SOURCES, async (): Promise<SelectedSource[]> => {
    const result = await dialog.showOpenDialog({
      title: 'Selecionar XMLs ou arquivo ZIP',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Documentos fiscais', extensions: ['xml', 'zip'] },
      ],
    })

    if (result.canceled) return []

    const selected = result.filePaths
      .filter((path) => allowedExtensions.has(path.slice(path.lastIndexOf('.')).toLowerCase()))
      .map<SelectedSource>((path) => ({
        path,
        kind: path.toLowerCase().endsWith('.zip') ? 'ZIP' : 'XML',
      }))
    approvedSourcePaths.clear()
    for (const source of selected) approvedSourcePaths.add(source.path)
    return selected
  })
  ipcMain.handle(
    IPC_CHANNELS.INSPECT_SOURCES,
    async (_event, rawSources: unknown): Promise<BatchPreparation> => {
      const sources = validatedSources(rawSources)

      const connection = activeDatabase()
      const organization = new SqliteOrganizationRepository(connection).findSingle()
      if (!organization) throw new Error('Configure o escritório antes de importar arquivos.')
      const companies = new SqliteCompanyRepository(connection).listByOrganization(organization.id)
      const candidates = new Map<string, {
        cnpj: string
        legalName?: string
        state?: string
        roles: Set<'ISSUER' | 'RECIPIENT'>
        documents: Set<string>
      }>()
      const issues: BatchPreparation['issues'][number][] = []
      const environmentCodes = new Set<FiscalEnvironmentCode>()
      let inspectedXmlCount = 0

      const inspectXml = (contents: Buffer, source: string): void => {
        try {
          const normalized = normalizeNfeStructure(readNfeXmlStructure(contents.toString('utf8')))
          inspectedXmlCount += 1
          if (normalized.environmentCode === '1' || normalized.environmentCode === '2') {
            environmentCodes.add(normalized.environmentCode)
          }
          for (const [party, role] of [
            [normalized.issuer, 'ISSUER'],
            [normalized.recipient, 'RECIPIENT'],
          ] as const) {
            if (party?.taxIdType !== 'CNPJ' || !party.taxId) continue
            const cnpj = normalizeCnpj(party.taxId)
            const current = candidates.get(cnpj) ?? {
              cnpj,
              ...(party.name ? { legalName: party.name } : {}),
              ...(party.state ? { state: party.state } : {}),
              roles: new Set<'ISSUER' | 'RECIPIENT'>(),
              documents: new Set<string>(),
            }
            current.roles.add(role)
            current.documents.add(normalized.accessKey)
            candidates.set(cnpj, current)
          }
        } catch (cause) {
          issues.push({
            source,
            code: 'XML_NAO_IDENTIFICADO',
            message: cause instanceof Error ? cause.message : 'XML não reconhecido.',
          })
        }
      }

      for (const source of sources) {
        if (source.kind === 'XML') {
          const metadata = await stat(source.path)
          if (metadata.size > PRODUCTION_XML_SECURITY_POLICY.maxBytes) {
            issues.push({ source: source.path, code: 'XML_TOO_LARGE', message: 'XML excede 10 MB.' })
            continue
          }
          inspectXml(await readFile(source.path), source.path)
          continue
        }

        try {
          const inspection = await visitSafeZipFileEntries(
            source.path,
            PRODUCTION_ZIP_SECURITY_POLICY,
            ({ relativePath, contents }) => {
              if (relativePath.toLowerCase().endsWith('.xml')) {
                inspectXml(contents, `${source.path}#${relativePath}`)
              }
            },
          )
          for (const rejected of inspection.rejectedEntries) {
            issues.push({
              source: `${source.path}#${rejected.entryName}`,
              code: rejected.code,
              message: rejected.message,
            })
          }
        } catch (cause) {
          issues.push({
            source: source.path,
            code: 'ZIP_REJEITADO',
            message: cause instanceof Error ? cause.message : 'ZIP rejeitado.',
          })
        }
      }

      const resultCandidates: BatchCompanyCandidate[] = [...candidates.values()]
        .map((candidate) => {
          const matched = companies.find((company) => company.cnpj === candidate.cnpj)
          return {
            cnpj: candidate.cnpj,
            ...(candidate.legalName ? { legalName: candidate.legalName } : {}),
            ...(candidate.state ? { state: candidate.state } : {}),
            roles: [...candidate.roles].sort(),
            documentCount: candidate.documents.size,
            ...(matched ? { matchedCompanyId: matched.id } : {}),
          }
        })
        .sort((left, right) => left.cnpj.localeCompare(right.cnpj))

      return {
        candidates: resultCandidates,
        issues,
        inspectedXmlCount,
        environmentCodes: [...environmentCodes].sort(),
      }
    },
  )
  ipcMain.handle(
    IPC_CHANNELS.CREATE_BATCH,
    async (_event, rawInput: unknown): Promise<CreatedBatchSummary> => {
      const input = inputRecord(rawInput) as unknown as CreateBatchInput
      const sources = validatedSources(input.sources)
      if (sources.length === 0) throw new Error('Selecione ao menos um arquivo.')
      if (input.environmentCode !== '1' && input.environmentCode !== '2') {
        throw new Error('Confirme se o lote é de produção ou homologação.')
      }
      const environmentCode = input.environmentCode
      const connection = activeDatabase()
      const organizations = new SqliteOrganizationRepository(connection)
      const organization = organizations.findSingle()
      if (!organization) throw new Error('Configure o escritório antes de criar o lote.')
      const company = new SqliteCompanyRepository(connection).findById(
        requiredInputText(input.companyId, 'Empresa'),
      )
      if (!company || company.organizationId !== organization.id || !company.active) {
        throw new Error('Empresa inválida ou inativa para esta instalação.')
      }

      const batchId = randomUUID()
      const receivedAt = new Date().toISOString()
      type Pending = {
        relativePath: string; originalName: string; kind: 'XML' | 'ZIP';
        origin: 'SELECTED_FILE' | 'ZIP_ENTRY'; containerName?: string;
        hash: string; size: number; accessKey?: string; normalized?: NormalizedNfe;
        issue?: { code: string; message: string }
      }
      const pending: Pending[] = []
      const issues: { source: string; code: string; message: string; occurrenceId?: string }[] = []

      const addXml = (contents: Buffer, relativePath: string, origin: Pending['origin'], containerName?: string): void => {
        let accessKey: string | undefined
        let normalized: NormalizedNfe | undefined
        let issue: Pending['issue']
        try {
          normalized = normalizeNfeStructure(readNfeXmlStructure(contents.toString('utf8')))
          accessKey = normalized.accessKey
        } catch (cause) {
          issue = { code: 'XML_NAO_IDENTIFICADO', message: cause instanceof Error ? cause.message : 'XML inválido.' }
        }
        pending.push({
          relativePath,
          originalName: basename(relativePath),
          kind: 'XML', origin, ...(containerName ? { containerName } : {}),
          hash: createHash('sha256').update(contents).digest('hex'), size: contents.byteLength,
          ...(accessKey ? { accessKey } : {}), ...(normalized ? { normalized } : {}),
          ...(issue ? { issue } : {}),
        })
      }

      for (const source of sources) {
        const metadata = await stat(source.path)
        if (source.kind === 'XML') {
          if (metadata.size > PRODUCTION_XML_SECURITY_POLICY.maxBytes) {
            issues.push({ source: source.path, code: 'XML_TOO_LARGE', message: 'XML excede 10 MB.' })
            continue
          }
          addXml(await readFile(source.path), basename(source.path), 'SELECTED_FILE')
        } else {
          pending.push({
            relativePath: basename(source.path), originalName: basename(source.path), kind: 'ZIP',
            origin: 'SELECTED_FILE', hash: await hashFile(source.path), size: metadata.size,
          })
          try {
            const inspection = await visitSafeZipFileEntries(
              source.path,
              PRODUCTION_ZIP_SECURITY_POLICY,
              ({ relativePath, contents }) => {
                if (relativePath.toLowerCase().endsWith('.xml')) {
                  addXml(contents, relativePath, 'ZIP_ENTRY', basename(source.path))
                }
              },
            )
            for (const rejected of inspection.rejectedEntries) {
              issues.push({ source: `${basename(source.path)}#${rejected.entryName}`, code: rejected.code, message: rejected.message })
            }
          } catch (cause) {
            issues.push({ source: basename(source.path), code: 'ZIP_REJEITADO', message: cause instanceof Error ? cause.message : 'ZIP rejeitado.' })
          }
        }
      }

      pending.sort((left, right) => left.relativePath.localeCompare(right.relativePath) || left.hash.localeCompare(right.hash))
      const baseOccurrences = pending.map((item, index) => ({ item, id: randomUUID(), order: index + 1 }))
      const xmlClassifications = classifyDocumentOccurrences(
        baseOccurrences.filter(({ item }) => item.kind === 'XML').map(({ item, id, order }) => ({
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
          ingestionStatus: item.issue ? 'PENDENTE' as const : 'PROCESSADA' as const,
          repetition: classified?.repetition ?? 'NAO_CLASSIFICAVEL' as const,
          contentConflict: classified?.contentConflict ?? 'NAO_CLASSIFICAVEL' as const,
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
      const documents = baseOccurrences.flatMap(({ item, id }) => {
        if (!item.normalized) return []
        const occurrence = classificationById.get(id)
        const classification = classifyDocumentIngestion(
          item.normalized,
          company.cnpj,
          environmentCode,
          occurrence?.eligibleForTotalsByOccurrencePolicy ?? false,
        )
        for (const reason of classification.pendingReasons) {
          issues.push({
            source: item.relativePath,
            code: reason,
            message: reasonMessages[reason],
            occurrenceId: id,
          })
        }
        return [{
          id: randomUUID(), batchId, occurrenceId: id, contentHash: item.hash,
          normalized: item.normalized,
          eligibleForProcessing: classification.eligibleForProcessing,
          ...(classification.pendingReasons.length > 0
            ? { pendingReason: classification.pendingReasons.join(',') }
            : {}),
          createdAt: receivedAt,
        }]
      })
      if (documents.length === 0) {
        issues.push({
          source: 'lote',
          code: 'LOTE_SEM_DOCUMENTOS',
          message: 'Nenhum XML de NF-e/NFC-e pôde ser normalizado neste lote.',
        })
      }
      const diagnostics = issues.map((issue) => ({
        id: randomUUID(), batchId, source: issue.source, code: issue.code,
        message: issue.message, ...(issue.occurrenceId ? { occurrenceId: issue.occurrenceId } : {}),
        createdAt: receivedAt,
      }))
      const batches = new SqliteBatchRepository(connection)
      batches.createWithOccurrences({
        id: batchId, organizationId: organization.id, companyId: company.id,
        originalName: sources.length === 1 ? basename(sources[0]!.path) : `Lote com ${sources.length} fontes`,
        receivedAt,
        status: diagnostics.length > 0 ? 'CONCLUIDO_COM_PENDENCIAS' : 'CONCLUIDO',
        environmentCode,
        createdAt: receivedAt,
        updatedAt: receivedAt,
      }, occurrences, diagnostics, documents)
      const stored = batches.findById(batchId)!
      return {
        id: stored.id, status: stored.status, totalFiles: stored.totalFiles,
        totalDocuments: stored.totalDocuments, totalPendencies: stored.totalPendencies,
      }
    },
  )
  ipcMain.handle(IPC_CHANNELS.LIST_BATCHES, (): readonly BatchListItem[] => {
    const connection = activeDatabase()
    const organization = new SqliteOrganizationRepository(connection).findSingle()
    if (!organization) return []
    const companies = new Map(
      new SqliteCompanyRepository(connection)
        .listByOrganization(organization.id)
        .map((company) => [company.id, company]),
    )
    return new SqliteBatchRepository(connection).listByOrganization(organization.id).map((batch) => ({
      id: batch.id,
      status: batch.status,
      ...(batch.companyId ? { companyId: batch.companyId } : {}),
      ...(batch.companyId && companies.get(batch.companyId)
        ? { companyName: companies.get(batch.companyId)!.legalName }
        : {}),
      ...(batch.originalName ? { originalName: batch.originalName } : {}),
      receivedAt: batch.receivedAt,
      ...(batch.environmentCode ? { environmentCode: batch.environmentCode } : {}),
      totalFiles: batch.totalFiles,
      totalDocuments: batch.totalDocuments,
      totalPendencies: batch.totalPendencies,
    }))
  })
  ipcMain.handle(
    IPC_CHANNELS.GET_BATCH_DETAIL,
    (_event, rawBatchId: unknown): BatchDetail => {
      const batchId = requiredInputText(rawBatchId, 'Lote')
      const connection = activeDatabase()
      const organization = new SqliteOrganizationRepository(connection).findSingle()
      const batches = new SqliteBatchRepository(connection)
      const batch = batches.findById(batchId)
      if (!organization || !batch || batch.organizationId !== organization.id) {
        throw new Error('Lote não encontrado nesta instalação.')
      }
      const company = batch.companyId
        ? new SqliteCompanyRepository(connection).findById(batch.companyId)
        : undefined
      return {
        batch: {
          id: batch.id,
          status: batch.status,
          ...(batch.companyId ? { companyId: batch.companyId } : {}),
          ...(company ? { companyName: company.legalName } : {}),
          ...(batch.originalName ? { originalName: batch.originalName } : {}),
          receivedAt: batch.receivedAt,
          ...(batch.environmentCode ? { environmentCode: batch.environmentCode } : {}),
          totalFiles: batch.totalFiles,
          totalDocuments: batch.totalDocuments,
          totalPendencies: batch.totalPendencies,
        },
        occurrences: batches.listOccurrences(batchId).map((occurrence) => ({
          id: occurrence.id,
          originalName: occurrence.originalName,
          relativePath: occurrence.relativePath,
          kind: occurrence.detectedKind,
          origin: occurrence.origin,
          contentHash: occurrence.contentHash,
          sizeBytes: occurrence.sizeBytes,
          ...(occurrence.accessKey ? { accessKey: occurrence.accessKey } : {}),
          ingestionStatus: occurrence.ingestionStatus,
          repetition: occurrence.repetition,
          contentConflict: occurrence.contentConflict,
          eligibleForTotals: occurrence.eligibleForTotalsByOccurrencePolicy,
        })),
        diagnostics: batches.listDiagnostics(batchId).map((diagnostic) => ({
          id: diagnostic.id,
          source: diagnostic.source,
          code: diagnostic.code,
          message: diagnostic.message,
        })),
        documents: batches.listNormalizedDocuments(batchId).map(({
          id, normalized, eligibleForProcessing, pendingReason,
        }) => ({
          id,
          accessKey: normalized.accessKey,
          model: normalized.model,
          number: normalized.number,
          series: normalized.series,
          ...(normalized.issuedAt ? { issuedAt: normalized.issuedAt } : {}),
          ...(normalized.environmentCode ? { environmentCode: normalized.environmentCode } : {}),
          eligibleForProcessing,
          ...(pendingReason ? { pendingReason } : {}),
          ...(normalized.issuer.name ? { issuerName: normalized.issuer.name } : {}),
          ...(normalized.issuer.taxId ? { issuerTaxId: normalized.issuer.taxId } : {}),
          ...(normalized.recipient?.name ? { recipientName: normalized.recipient.name } : {}),
          ...(normalized.recipient?.taxId ? { recipientTaxId: normalized.recipient.taxId } : {}),
          items: normalized.items.map((item) => ({
            itemNumber: item.itemNumber,
            ...(item.supplierProductCode ? { supplierProductCode: item.supplierProductCode } : {}),
            ...(item.description ? { description: item.description } : {}),
            ...(item.ncm ? { ncm: item.ncm } : {}),
            ...(item.cfop ? { cfop: item.cfop } : {}),
            ...(item.productAmount ? { productAmount: item.productAmount } : {}),
            ...(item.declaredIcms?.amount ? { declaredIcmsAmount: item.declaredIcms.amount } : {}),
          })),
        })),
      }
    },
  )
}

app.whenReady().then(async () => {
  try {
    await openDatabase()
    registerIpcHandlers()
    createWindow()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha desconhecida.'
    dialog.showErrorBox('Não foi possível abrir o banco de dados', message)
    app.quit()
    return
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  database?.close()
  database = undefined
})
