import { readFile, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { dialog, ipcMain } from 'electron'
import { IPC_CHANNELS, type BatchCompanyCandidate, type BatchPreparation, type SelectedSource } from '@motor/contracts'
import { SqliteCompanyRepository, SqliteOrganizationRepository } from '@motor/database'
import { AppError, AppErrorCode, normalizeCnpj, type FiscalEnvironmentCode } from '@motor/domain'
import { PRODUCTION_XML_SECURITY_POLICY, PRODUCTION_ZIP_SECURITY_POLICY,
  parseDocumentArtifactXml, visitSafeZipFileEntries } from '@motor/nfe-parser'
import { activeDatabase, approvedSourcePaths, isCancelled, runBatchOperation,
  validatedSources } from './main-services'

const allowedExtensions = new Set(['.xml', '.zip'])

import { ImportIssueCode, ImportIssueMessage, formatImportIssueMessage } from './import-issues'

/** Seleciona arquivos autorizados e inspeciona suas notas antes da confirmação do lote. */
export function registerBatchInspectionHandlers(): void {
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
    async (event, rawSources: unknown, rawOperationId: unknown): Promise<BatchPreparation> => {
      const sources = validatedSources(rawSources)
      return runBatchOperation(event, rawOperationId, 'INSPECTING', sources.filter((source) => source.kind === 'XML').length, async (session) => {

      const connection = activeDatabase()
      const organization = new SqliteOrganizationRepository(connection).findSingle()
      if (!organization) throw new AppError(AppErrorCode.ORGANIZATION_REQUIRED, { action: 'importar arquivos' })
      const companies = new SqliteCompanyRepository(connection).listByOrganization(organization.id)
      const candidates = new Map<string, {
        cnpj: string
        legalName?: string
        state?: string
        roles: Set<'ISSUER' | 'RECIPIENT'>
        documents: Set<string>
      }>()
      const issues: BatchPreparation['issues'][number][] = []
      const documents: BatchPreparation['documents'][number][] = []
      const artifacts: BatchPreparation['artifacts'][number][] = []
      const environmentCodes = new Set<FiscalEnvironmentCode>()
      let inspectedXmlCount = 0
      let completedEntries = 0
      let totalEntries = sources.filter((source) => source.kind === 'XML').length

      // Extrai apenas os dados necessários para sugerir empresas e detectar problemas.
      const inspectXml = (contents: Buffer, source: string): void => {
        try {
          const parsed = parseDocumentArtifactXml(contents.toString('utf8'))
          if (parsed.kind !== 'NFE') {
            artifacts.push({ source, kind: parsed.kind, accessKey: parsed.artifact.accessKey,
              ...(parsed.artifact.eventType ? { eventType: parsed.artifact.eventType } : {}) })
            if (parsed.artifact.environmentCode === '1' || parsed.artifact.environmentCode === '2') {
              environmentCodes.add(parsed.artifact.environmentCode)
            }
            return
          }
          const normalized = parsed.note
          inspectedXmlCount += 1
          documents.push({
            source,
            accessKey: normalized.accessKey,
            number: normalized.number,
            ...(normalized.issuer.taxIdType === 'CNPJ' && normalized.issuer.taxId ? { issuerCnpj: normalizeCnpj(normalized.issuer.taxId) } : {}),
            ...(normalized.recipient?.taxIdType === 'CNPJ' && normalized.recipient.taxId ? { recipientCnpj: normalizeCnpj(normalized.recipient.taxId) } : {}),
          })
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
            code: ImportIssueCode.XML_NAO_IDENTIFICADO,
            message: cause instanceof Error ? cause.message : ImportIssueMessage.XML_NOT_RECOGNIZED,
          })
        }
      }

      // XMLs diretos e entradas de ZIP seguem a mesma inspeção e política de segurança.
      for (const source of sources) {
        session.throwIfCancelled()
        if (source.kind === 'XML') {
          const metadata = await stat(source.path)
          session.throwIfCancelled()
          if (metadata.size > PRODUCTION_XML_SECURITY_POLICY.maxBytes) {
            issues.push({ source: source.path, code: ImportIssueCode.XML_TOO_LARGE, message: ImportIssueMessage.XML_TOO_LARGE })
          } else {
            const contents = await readFile(source.path)
            session.throwIfCancelled()
            inspectXml(contents, source.path)
          }
          completedEntries += 1
          session.report('INSPECTING', completedEntries, totalEntries, basename(source.path))
          continue
        }

        let zipCompleted = 0
        try {
          const inspection = await visitSafeZipFileEntries(
            source.path,
            PRODUCTION_ZIP_SECURITY_POLICY,
            ({ relativePath, contents }) => {
              if (relativePath.toLowerCase().endsWith('.xml')) {
                inspectXml(contents, `${source.path}#${relativePath}`)
              }
            },
            {
              signal: session.signal,
              onProgress: (completed, total, entryName) => {
                if (completed === 0) totalEntries += total
                zipCompleted = completed
                session.report('INSPECTING', completedEntries + completed, totalEntries,
                  entryName ? `${basename(source.path)}#${entryName}` : basename(source.path))
              },
            },
          )
          completedEntries += inspection.totalEntries
          for (const rejected of inspection.rejectedEntries) {
            issues.push({
              source: `${source.path}#${rejected.entryName}`,
              code: rejected.code,
              message: rejected.message,
            })
          }
        } catch (cause) {
          if (isCancelled(cause)) throw cause
          completedEntries += zipCompleted
          issues.push({
            source: source.path,
            code: ImportIssueCode.ZIP_REJEITADO,
            message: cause instanceof Error ? cause.message : ImportIssueMessage.ZIP_REJECTED,
          })
        }
      }

      const resultCandidates: BatchCompanyCandidate[] = [...candidates.values()]
        .map((candidate) => {
          const matched = companies.find((company) => company.active && company.cnpj === candidate.cnpj)
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
        documents, artifacts,
        inspectedXmlCount,
        totalEntries: completedEntries,
        environmentCodes: [...environmentCodes].sort(),
      }
      })
    },
  )
}
