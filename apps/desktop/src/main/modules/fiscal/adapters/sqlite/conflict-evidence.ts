import { createHash } from 'node:crypto'
import { classifyDocumentIngestion } from '@motor/domain'
import type { DocumentConflictEvidence, ConflictResolutionAudit } from '@motor/contracts'
import type { NormalizedFiscalDocumentRecord } from '@motor/database'
import type { DocumentaryIndex } from './documentary-evidence'
export const conflictKey = (accessKey: string, environment?: string) => JSON.stringify([accessKey, environment])
export const conflictDigest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export function conflictDocuments(index: DocumentaryIndex, document: NormalizedFiscalDocumentRecord) {
  return index.documentsByKey.get(conflictKey(document.normalized.accessKey, document.normalized.environmentCode)) ?? []
}
export function versionsSnapshot(documents: readonly NormalizedFiscalDocumentRecord[]): string {
  return conflictDigest([...new Set(documents.map(d => d.contentHash))].sort())
}
export function conflictEvidence(index: DocumentaryIndex, document: NormalizedFiscalDocumentRecord): DocumentConflictEvidence | undefined {
  const documents = conflictDocuments(index, document)
  if (new Set(documents.map(d => d.contentHash)).size < 2) return undefined
  const records = index.conflictHistories.get(conflictKey(document.normalized.accessKey, document.normalized.environmentCode)) ?? []
  const latest = records[0], chosen = latest && index.documents.get(latest.documentId)
  const resolved = latest?.action === 'SELECT' && latest.versionsSnapshot === versionsSnapshot(documents) && chosen
  const status = resolved ? 'RESOLVED' : latest?.action === 'SELECT' ? 'STALE' : 'PENDING'
  const selected = Boolean(resolved && chosen!.contentHash === document.contentHash)
  return { contentHash: document.contentHash, sourceBatchId: document.batchId, sourceBatchName: index.batches.get(document.batchId)?.originalName ?? 'Lote sem nome',
    sourceFileName: index.occurrences.get(document.occurrenceId)?.relativePath ?? 'Arquivo não identificado', status, selected, ...(resolved ? { chosenDocumentId: chosen!.id, chosenContentHash: chosen!.contentHash } : {}),
    reason: resolved ? selected ? 'Versão escolhida com justificativa. Demais pendências continuam aplicáveis.'
      : `Versão excluída pela resolução do conflito. Referência: lote ${chosen!.batchId}, documento ${chosen!.id}.`
      : status === 'STALE' ? 'Nova versão de conteúdo importada: o conflito exige nova revisão.' : 'Mesma chave e ambiente com conteúdos diferentes. Escolha a versão válida com justificativa.',
    history: records.map(({ id, revision, action, documentId, reason, computer, systemUser, createdAt }): ConflictResolutionAudit =>
      ({ id, revision, action, documentId, reason, computer, systemUser, createdAt })) }
}
/** Somente a restrição de ocorrências é removida da projeção; XML e classificações persistidas ficam intactos. */
export function selectionProblem(index: DocumentaryIndex, document: NormalizedFiscalDocumentRecord): string | undefined {
  const company = document.companyId ? index.companies.get(document.companyId) : undefined
  const batch = index.batches.get(document.batchId), environment = document.normalized.environmentCode
  if (!company || !['1', '2'].includes(environment ?? '') || batch?.environmentCode !== environment) return 'Confira a empresa e o ambiente do lote antes de escolher esta versão.'
  if (!classifyDocumentIngestion(document.normalized, company.cnpj, environment as '1' | '2', true).eligibleForProcessing) return 'A empresa analisada não corresponde à nota ou o ambiente é inválido.'
  if (!document.eligibleForProcessing && document.pendingReason !== 'OCORRENCIA_INELEGIVEL') return document.pendingReason ?? 'Documento não elegível para processamento.'
  const occurrence = index.occurrences.get(document.occurrenceId)
  if (!occurrence || (!occurrence.eligibleForTotalsByOccurrencePolicy && occurrence.contentConflict !== 'CONFLITO_CONTEUDO'
    && occurrence.repetition !== 'REPETIDA')) return 'A ocorrência possui uma restrição diferente de repetição ou conflito.'
  return undefined
}
export function effectiveProcessingDocument(index: DocumentaryIndex, document: NormalizedFiscalDocumentRecord): NormalizedFiscalDocumentRecord {
  const resolution = conflictEvidence(index, document)
  if (!resolution?.selected || selectionProblem(index, document) || document.eligibleForProcessing) return document
  const { pendingReason: _pending, ...source } = document
  return { ...source, eligibleForProcessing: true }
}
