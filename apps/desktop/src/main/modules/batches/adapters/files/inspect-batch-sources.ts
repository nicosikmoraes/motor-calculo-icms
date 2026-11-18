import { readFile, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import type { BatchCompanyCandidate, BatchPreparation, SelectedSource } from '@motor/contracts'
import { normalizeCnpj, type Company, type FiscalEnvironmentCode } from '@motor/domain'
import { PRODUCTION_XML_SECURITY_POLICY, PRODUCTION_ZIP_SECURITY_POLICY, ZipVisitCancelledError,
  parseDocumentArtifactXml, validateDocumentArtifactSchema, visitSafeZipFileEntries } from '@motor/nfe-parser'
import { BatchOperationCancelledError, type BatchOperationSession } from '../../application/batch-operation'
import { ImportIssueCode, ImportIssueMessage, formatImportIssueMessage } from '../../application/import-issues'
import { purchaseStScope } from '../../../fiscal/domain/purchase-st-context'

/** Inspeciona apenas fontes já autorizadas pelo seletor local. */
export async function inspectBatchSources(sources: readonly SelectedSource[], companies: readonly Company[],
  session: BatchOperationSession): Promise<BatchPreparation> {
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
  const inspectXml = async (contents: Buffer, source: string): Promise<void> => {
    try {
      const xml = contents.toString('utf8')
      const parsed = parseDocumentArtifactXml(xml)
      const schemaIssues = await validateDocumentArtifactSchema(xml, parsed)
      issues.push(...schemaIssues.map((diagnostic) => ({ source, ...diagnostic })))
      if (parsed.kind !== 'NFE') {
        artifacts.push({ source, kind: parsed.kind, accessKey: parsed.artifact.accessKey,
          ...(parsed.artifact.eventType ? { eventType: parsed.artifact.eventType } : {}) })
        if (parsed.artifact.environmentCode === '1' || parsed.artifact.environmentCode === '2') {
          environmentCodes.add(parsed.artifact.environmentCode)
        }
        return
      }
      const normalized = parsed.note
      const purchase = normalized.items.map(item => purchaseStScope(normalized, item, {})).find(Boolean)
      inspectedXmlCount += 1
      documents.push({
        source,
        accessKey: normalized.accessKey,
        number: normalized.number,
        ...(purchase?.buyer.taxIdType === 'CNPJ' && purchase.buyer.taxId ? { suggestedCompanyCnpj: normalizeCnpj(purchase.buyer.taxId) } : {}),
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
        await inspectXml(contents, source.path)
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
        async ({ relativePath, contents }) => {
          if (relativePath.toLowerCase().endsWith('.xml')) {
            await inspectXml(contents, `${source.path}#${relativePath}`)
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
      if (cause instanceof ZipVisitCancelledError || cause instanceof BatchOperationCancelledError) throw cause
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
}
