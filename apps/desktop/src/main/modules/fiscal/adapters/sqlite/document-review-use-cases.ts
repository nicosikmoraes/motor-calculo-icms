import { randomUUID } from 'node:crypto'
import { hostname, userInfo } from 'node:os'
import type { DocumentReviewSummary, SaveDocumentReviewInput } from '@motor/contracts'
import { SqliteDocumentReviewRepository, type SqliteDatabase } from '@motor/database'
import { buildDocumentReview, readDocumentaryIndex } from './documentary-evidence'

export function validateDocumentReviewInput(raw: unknown): SaveDocumentReviewInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Revisão documental inválida.')
  const r = raw as Record<string, unknown>
  if (Object.keys(r).some(k => !['artifactId', 'documentId', 'action', 'reason', 'expectedSnapshot', 'requestId'].includes(k))) throw new Error('Campo de revisão não permitido.')
  for (const field of ['artifactId', 'documentId', 'requestId'] as const) {
    if (typeof r[field] !== 'string' || !r[field].trim() || r[field].length > 128) throw new Error('Identificador de revisão inválido.')
  }
  if (typeof r.action !== 'string' || !['ASSOCIATE', 'APPROVE_CCE', 'REOPEN_CCE'].includes(r.action) || typeof r.reason !== 'string'
    || !r.reason.trim() || r.reason.length > 2000 || typeof r.expectedSnapshot !== 'string'
    || !/^[a-f0-9]{64}$/.test(r.expectedSnapshot)) throw new Error('Informe uma ação, justificativa e revisão válidas.')
  return { artifactId: String(r.artifactId).trim(), documentId: String(r.documentId).trim(), requestId: String(r.requestId).trim(),
    action: r.action as SaveDocumentReviewInput['action'], reason: r.reason.trim(), expectedSnapshot: r.expectedSnapshot }
}
export function listDocumentReviews(database: SqliteDatabase): readonly DocumentReviewSummary[] {
  return database.transaction(() => {
    const index = readDocumentaryIndex(database)
    return [...index.artifacts.values()].filter(a => a.normalized.kind === 'EVENT').map(a => buildDocumentReview(index, a))
  })
}
/** Associação e revisão são registros novos; nenhum XML ou cálculo é modificado. */
export function saveDocumentReview(database: SqliteDatabase, raw: unknown): DocumentReviewSummary {
  const input = validateDocumentReviewInput(raw)
  return database.transaction(() => {
    const index = readDocumentaryIndex(database)
    const artifact = index.artifacts.get(input.artifactId)
    if (!artifact || artifact.normalized.kind !== 'EVENT') throw new Error('Evento não encontrado nesta organização.')
    const repository = new SqliteDocumentReviewRepository(database)
    const previousRequest = repository.listByOrganization(index.organizationId).find(r => r.requestId === input.requestId)
    if (previousRequest) {
      if (previousRequest.artifactId !== input.artifactId || previousRequest.documentId !== input.documentId
        || previousRequest.action !== input.action || previousRequest.reason !== input.reason || previousRequest.snapshot !== input.expectedSnapshot) throw new Error('Esta solicitação já foi usada com outra revisão.')
      return buildDocumentReview(index, artifact)
    }
    const review = buildDocumentReview(index, artifact)
    if (review.snapshot !== input.expectedSnapshot) throw new Error('Os documentos ou eventos mudaram. Atualize a lista e revise novamente.')
    if (!review.candidates.some(c => c.id === input.documentId)) throw new Error('Nota incompatível com a chave, ambiente ou organização do evento.')
    const permitted = input.action === 'ASSOCIATE' ? review.canAssociate
      : input.action === 'APPROVE_CCE' ? review.canApproveCce : review.canReopenCce
    if (!permitted) throw new Error(review.blockedReason ?? 'Esta ação não está disponível para a situação atual do evento.')
    if (input.action !== 'ASSOCIATE' && input.documentId !== review.documentId) throw new Error('A revisão deve usar a nota já associada.')
    repository.insert({ id: randomUUID(), requestId: input.requestId, artifactId: artifact.id, documentId: input.documentId,
      revision: (review.history[0]?.revision ?? 0) + 1, action: input.action, reason: input.reason,
      snapshot: input.expectedSnapshot, computer: hostname(), systemUser: userInfo().username, createdAt: new Date().toISOString() })
    return buildDocumentReview(readDocumentaryIndex(database), artifact)
  })
}
