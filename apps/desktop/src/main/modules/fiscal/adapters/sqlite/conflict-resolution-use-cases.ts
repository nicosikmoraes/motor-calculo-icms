import { randomUUID } from 'node:crypto'
import { hostname, userInfo } from 'node:os'
import type { DocumentConflictSummary, SaveConflictResolutionInput } from '@motor/contracts'
import { SqliteConflictResolutionRepository, type SqliteDatabase, type NormalizedFiscalDocumentRecord } from '@motor/database'
import { readDocumentaryIndex, type DocumentaryIndex } from './documentary-evidence'
import { conflictDigest, conflictEvidence, conflictKey, selectionProblem, versionsSnapshot } from './conflict-evidence'
import { compareConflictDocuments } from './conflict-comparison'
export function buildDocumentConflict(index: DocumentaryIndex, documents: readonly NormalizedFiscalDocumentRecord[]): DocumentConflictSummary {
  const docs = [...documents].sort((a, b) => index.batches.get(a.batchId)!.receivedAt.localeCompare(index.batches.get(b.batchId)!.receivedAt)
    || a.batchId.localeCompare(b.batchId) || a.id.localeCompare(b.id))
  const first = docs[0]!, evidence = conflictEvidence(index, first)!
  const artifacts = [...index.artifacts.values()].filter(a => a.normalized.accessKey === first.normalized.accessKey && a.normalized.environmentCode === first.normalized.environmentCode)
  const versions = docs.map(d => {
    const batch = index.batches.get(d.batchId)!, occurrence = index.occurrences.get(d.occurrenceId)
    const protocol = artifacts.find(a => a.association === 'ASSOCIATED' && a.documentId === d.id && a.normalized.kind === 'PROTOCOL')
    const problem = selectionProblem(index, d)
    return { id: d.id, batchId: d.batchId, batchName: batch.originalName ?? 'Lote sem nome', fileName: occurrence?.relativePath ?? 'Arquivo não identificado',
      receivedAt: batch.receivedAt, ...(d.companyId ? { companyId: d.companyId } : {}), ...(d.companyId && index.companyNames.get(d.companyId) ? { companyName: index.companyNames.get(d.companyId)! } : {}),
      number: d.normalized.number, series: d.normalized.series, ...(d.normalized.issuedAt ? { issuedAt: d.normalized.issuedAt } : {}), contentHash: d.contentHash,
      canSelect: !problem, ...(problem ? { blockedReason: problem } : {}), itemCount: d.normalized.items.length,
      ...(protocol?.normalized.protocolNumber ? { protocol: protocol.normalized.protocolNumber } : {}),
      ...(protocol?.normalized.statusCode ? { protocolStatus: protocol.normalized.statusCode } : {}) }
  })
  const fields = [...compareConflictDocuments(docs), ...(['protocol', 'protocolStatus'] as const).map(field => {
    const values = versions.map(v => v[field] ?? null)
    return { path: field, label: field === 'protocol' ? 'Autorização · Protocolo associado' : 'Autorização · Código de retorno', values, different: new Set(values).size > 1 }
  })]
  return { accessKey: first.normalized.accessKey, environmentCode: first.normalized.environmentCode ?? 'UNKNOWN', status: evidence.status,
    versions, fields, ...(evidence.chosenDocumentId ? { chosenDocumentId: evidence.chosenDocumentId, chosenContentHash: evidence.chosenContentHash } : {}),
    canReopen: evidence.status === 'RESOLVED', history: evidence.history,
    snapshot: conflictDigest({ documents: docs.map(d => [d.id, d.contentHash, d.eligibleForProcessing, d.pendingReason, selectionProblem(index, d)]),
      artifacts: artifacts.map(a => [a.id, a.contentHash, index.histories.get(a.id)?.[0]?.id]).sort(),
      latest: index.conflictHistories.get(conflictKey(first.normalized.accessKey, first.normalized.environmentCode))?.[0]?.id }) }
}
export function listDocumentConflicts(database: SqliteDatabase): readonly DocumentConflictSummary[] {
  return database.transaction(() => {
    const index = readDocumentaryIndex(database)
    return [...index.documentsByKey.values()].filter(docs => new Set(docs.map(d => d.contentHash)).size > 1)
      .map(docs => buildDocumentConflict(index, docs)).sort((a, b) => a.accessKey.localeCompare(b.accessKey) || a.environmentCode.localeCompare(b.environmentCode))
  })
}
export function validateConflictResolutionInput(raw: unknown): SaveConflictResolutionInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Resolução de conflito inválida.')
  const r = raw as Record<string, unknown>
  if (Object.keys(r).some(k => !['accessKey', 'environmentCode', 'documentId', 'action', 'reason', 'expectedSnapshot', 'requestId'].includes(k))) throw new Error('Campo de resolução não permitido.')
  if (typeof r.accessKey !== 'string' || !/^\d{44}$/.test(r.accessKey) || typeof r.environmentCode !== 'string' || !['1', '2'].includes(r.environmentCode)
    || typeof r.action !== 'string' || !['SELECT', 'REOPEN'].includes(r.action) || typeof r.reason !== 'string' || !r.reason.trim() || r.reason.length > 2000
    || typeof r.expectedSnapshot !== 'string' || !/^[a-f0-9]{64}$/.test(r.expectedSnapshot)) throw new Error('Informe chave, ambiente, ação e justificativa válidos.')
  for (const field of ['documentId', 'requestId'] as const) if (typeof r[field] !== 'string' || !r[field].trim() || r[field].length > 128) throw new Error('Identificador de resolução inválido.')
  return { accessKey: r.accessKey, environmentCode: r.environmentCode, documentId: String(r.documentId).trim(), action: r.action as 'SELECT' | 'REOPEN',
    reason: r.reason.trim(), expectedSnapshot: r.expectedSnapshot, requestId: String(r.requestId).trim() }
}
export function saveConflictResolution(database: SqliteDatabase, raw: unknown): DocumentConflictSummary {
  const input = validateConflictResolutionInput(raw)
  return database.transaction(() => {
    const index = readDocumentaryIndex(database), group = conflictKey(input.accessKey, input.environmentCode)
    const docs = index.documentsByKey.get(group)
    if (!docs || new Set(docs.map(d => d.contentHash)).size < 2) throw new Error('Conflito não encontrado nesta organização.')
    const repository = new SqliteConflictResolutionRepository(database)
    const previous = repository.listByOrganization(index.organizationId).find(r => r.requestId === input.requestId)
    if (previous) {
      if (previous.accessKey !== input.accessKey || previous.environmentCode !== input.environmentCode || previous.documentId !== input.documentId
        || previous.action !== input.action || previous.reason !== input.reason || previous.snapshot !== input.expectedSnapshot) throw new Error('Esta solicitação já foi usada com outra resolução.')
      return buildDocumentConflict(index, docs)
    }
    const conflict = buildDocumentConflict(index, docs)
    if (conflict.snapshot !== input.expectedSnapshot) throw new Error('As versões ou decisões mudaram. Atualize a lista e compare novamente.')
    const candidate = conflict.versions.find(v => v.id === input.documentId)
    if (!candidate) throw new Error('Nota incompatível com a chave, ambiente ou organização do conflito.')
    if (input.action === 'SELECT' && (conflict.status === 'RESOLVED' || !candidate.canSelect)) throw new Error(candidate.blockedReason ?? 'Reabra o conflito antes de escolher outra versão.')
    if (input.action === 'REOPEN' && (!conflict.canReopen || input.documentId !== conflict.chosenDocumentId)) throw new Error('Este conflito não permite reabrir essa decisão.')
    repository.insert({ id: randomUUID(), organizationId: index.organizationId, accessKey: input.accessKey, environmentCode: input.environmentCode,
      documentId: input.documentId, requestId: input.requestId, revision: (conflict.history[0]?.revision ?? 0) + 1, action: input.action,
      reason: input.reason, snapshot: input.expectedSnapshot, versionsSnapshot: versionsSnapshot(docs), computer: hostname(), systemUser: userInfo().username, createdAt: new Date().toISOString() })
    return buildDocumentConflict(readDocumentaryIndex(database), docs)
  })
}
