import { createHash } from 'node:crypto'
import type { DocumentaryStatus, DocumentArtifactSummary, DocumentReviewSummary } from '@motor/contracts'
import { SqliteBatchRepository, SqliteCompanyRepository, SqliteDocumentReviewRepository, SqliteOrganizationRepository,
  type DocumentArtifactRecord, type DocumentReviewRecord, type FiscalBatchRecord,
  type NormalizedFiscalDocumentRecord, type SqliteDatabase } from '@motor/database'

const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
const key = (accessKey: string, environment?: string) => JSON.stringify([accessKey, environment])
export interface DocumentaryIndex {
  organizationId: string
  batches: Map<string, FiscalBatchRecord>
  documents: Map<string, NormalizedFiscalDocumentRecord>
  documentsByKey: Map<string, NormalizedFiscalDocumentRecord[]>
  eventsByKey: Map<string, DocumentArtifactRecord[]>
  artifacts: Map<string, DocumentArtifactRecord>
  histories: Map<string, DocumentReviewRecord[]>
  companyNames: Map<string, string>
  invalidOccurrences: Set<string>
}

/** Uma leitura por snapshot. Importações e decisões originais não são reescritas. */
export function readDocumentaryIndex(database: SqliteDatabase): DocumentaryIndex {
  const organizationId = new SqliteOrganizationRepository(database).findSingle()?.id ?? ''
  const repository = new SqliteBatchRepository(database)
  const index: DocumentaryIndex = { organizationId, batches: new Map(), documents: new Map(), documentsByKey: new Map(),
    eventsByKey: new Map(), artifacts: new Map(), histories: new Map(), companyNames: new Map(), invalidOccurrences: new Set() }
  if (!organizationId) return index
  index.companyNames = new Map(new SqliteCompanyRepository(database).listByOrganization(organizationId).map(c => [c.id, c.legalName]))
  for (const batch of repository.listByOrganization(organizationId)) {
    index.batches.set(batch.id, batch)
    for (const diagnostic of repository.listDiagnostics(batch.id)) {
      if (diagnostic.occurrenceId && ['ARTEFATO_XSD_INVALIDO', 'XML_NAO_IDENTIFICADO'].includes(diagnostic.code)) index.invalidOccurrences.add(diagnostic.occurrenceId)
    }
    for (const document of repository.listNormalizedDocuments(batch.id)) {
      index.documents.set(document.id, document)
      const group = key(document.normalized.accessKey, document.normalized.environmentCode)
      index.documentsByKey.set(group, [...(index.documentsByKey.get(group) ?? []), document])
    }
    for (const artifact of repository.listDocumentArtifacts(batch.id)) {
      index.artifacts.set(artifact.id, artifact)
      if (artifact.normalized.kind !== 'EVENT') continue
      const group = key(artifact.normalized.accessKey, artifact.normalized.environmentCode)
      index.eventsByKey.set(group, [...(index.eventsByKey.get(group) ?? []), artifact])
    }
  }
  for (const review of new SqliteDocumentReviewRepository(database).listByOrganization(organizationId)) {
    index.histories.set(review.artifactId, [...(index.histories.get(review.artifactId) ?? []), review])
  }
  return index
}
export function relatedEvents(index: DocumentaryIndex, document: NormalizedFiscalDocumentRecord): readonly DocumentArtifactRecord[] {
  return index.eventsByKey.get(key(document.normalized.accessKey, document.normalized.environmentCode)) ?? []
}
function candidates(index: DocumentaryIndex, artifact: DocumentArtifactRecord): NormalizedFiscalDocumentRecord[] {
  return (index.documentsByKey.get(key(artifact.normalized.accessKey, artifact.normalized.environmentCode)) ?? []).slice()
    .sort((a, b) => (index.batches.get(a.batchId)!.receivedAt.localeCompare(index.batches.get(b.batchId)!.receivedAt))
      || a.batchId.localeCompare(b.batchId) || a.id.localeCompare(b.id))
}
function associatedDocument(index: DocumentaryIndex, artifact: DocumentArtifactRecord): NormalizedFiscalDocumentRecord | undefined {
  const id = index.histories.get(artifact.id)?.[0]?.documentId
    ?? (artifact.association === 'ASSOCIATED' ? artifact.documentId : undefined)
  const document = id ? index.documents.get(id) : undefined
  return document && document.normalized.accessKey === artifact.normalized.accessKey
    && document.normalized.environmentCode === artifact.normalized.environmentCode ? document : undefined
}
export function isLinked(index: DocumentaryIndex, artifact: DocumentArtifactRecord, document: NormalizedFiscalDocumentRecord): boolean {
  const linked = associatedDocument(index, artifact)
  return Boolean(linked && linked.contentHash === document.contentHash)
}
function eventIdentity(artifact: DocumentArtifactRecord): string {
  const a = artifact.normalized
  return JSON.stringify([a.eventType, a.sequence])
}
function conflict(index: DocumentaryIndex, artifact: DocumentArtifactRecord): boolean {
  const events = index.eventsByKey.get(key(artifact.normalized.accessKey, artifact.normalized.environmentCode)) ?? []
  return new Set(events.filter(e => eventIdentity(e) === eventIdentity(artifact)).map(e => digest(e.normalized))).size > 1
}
function validationProblem(index: DocumentaryIndex, artifact: DocumentArtifactRecord): string | undefined {
  const a = artifact.normalized, batch = index.batches.get(artifact.batchId)
  if (index.invalidOccurrences.has(artifact.occurrenceId)) return 'O arquivo do evento possui erro estrutural de XML/XSD. Confira o diagnóstico e importe o arquivo corrigido.'
  if (!['1', '2'].includes(a.environmentCode ?? '') || (batch?.environmentCode && batch.environmentCode !== a.environmentCode)) return 'Ambiente do evento ausente ou incompatível com o lote.'
  if (a.embeddedForAccessKey && a.embeddedForAccessKey !== a.accessKey) return 'A chave do envelope diverge da chave do evento.'
  if (a.envelope !== 'PROC_EVENTO_NFE' || a.responseMatches !== true || !a.protocolNumber
    || !['135', '155'].includes(a.statusCode ?? '') || !/^\d{1,2}$/.test(a.sequence ?? '') || Number(a.sequence) < 1) return 'Falta retorno registrado e consistente do evento (protocolo, chave, ambiente, tipo e sequência).'
  if (conflict(index, artifact)) return 'Há conteúdos diferentes para o mesmo tipo e sequência de evento. Confira os arquivos de origem.'
  return undefined
}
function latestCces(events: readonly DocumentArtifactRecord[]): readonly DocumentArtifactRecord[] {
  const cces = events.filter(e => e.normalized.eventType === '110110')
  const highest = Math.max(0, ...cces.map(e => Number(e.normalized.sequence) || 0))
  return cces.filter(e => Number(e.normalized.sequence) === highest)
}
const pendingEffect = 'Documento fora dos totais até concluir a revisão documental; cálculos salvos permanecem disponíveis.'
export function documentaryState(index: DocumentaryIndex, document: NormalizedFiscalDocumentRecord): {
  status: DocumentaryStatus; reason?: string; canceled: boolean
} {
  const events = relatedEvents(index, document)
  // Conserva o bloqueio já aplicado na ingestão, inclusive em registros antigos.
  const cancellation = events.find(e => isLinked(index, e, document) && e.normalized.responseMatches !== false
    && e.normalized.eventType === '110111' && ['135', '155'].includes(e.normalized.statusCode ?? ''))
  if (cancellation) return { status: 'CANCELED', canceled: true,
    reason: `Documento cancelado: evento ${cancellation.id}, lote ${cancellation.batchId}. Cálculos conservados para auditoria; valores excluídos dos totais.` }
  if (!events.length) return { status: 'CLEAR', canceled: false }
  if (new Set(candidates(index, events[0]!).map(d => d.contentHash)).size > 1) return {
    status: 'CONFLICT', canceled: false, reason: 'Mesma chave e ambiente com conteúdos diferentes entre lotes. Revisão documental bloqueada.' }
  const unlinked = events.find(e => !isLinked(index, e, document))
  if (unlinked) return { status: 'ASSOCIATION_PENDING', canceled: false,
    reason: `Evento desta chave no lote ${unlinked.batchId} aguarda confirmação da associação antes da totalização.` }
  const invalid = events.find(e => validationProblem(index, e))
  if (invalid) return { status: 'REVIEW_PENDING', canceled: false, reason: validationProblem(index, invalid)! }
  const unknown = events.find(e => !['110111', '110110'].includes(e.normalized.eventType ?? ''))
  if (unknown) return { status: 'REVIEW_PENDING', canceled: false,
    reason: `Evento ${unknown.normalized.eventType ?? 'sem tipo'} associado. Seu efeito documental ainda exige revisão específica.` }
  const latest = latestCces(events)
  if (latest.length && latest.some(e => index.histories.get(e.id)?.[0]?.action !== 'APPROVE_CCE')) return {
    status: 'CCE_PENDING', canceled: false, reason: 'CC-e mais recente pendente de revisão. O texto não modifica automaticamente o XML ou o cálculo.' }
  return { status: latest.length ? 'CCE_APPROVED' : 'CLEAR', canceled: false }
}
export function artifactSummary(index: DocumentaryIndex, artifact: DocumentArtifactRecord, target?: NormalizedFiscalDocumentRecord): DocumentArtifactSummary {
  const a = artifact.normalized
  const linked = target ? isLinked(index, artifact, target) : Boolean(associatedDocument(index, artifact))
  const associated = associatedDocument(index, artifact)
  const documentId = target && linked ? target.id : associated?.id
  return { id: artifact.id, occurrenceId: artifact.occurrenceId, sourceBatchId: artifact.batchId,
    sourceBatchName: index.batches.get(artifact.batchId)?.originalName ?? 'Lote sem nome',
    ...(documentId ? { documentId, targetBatchId: target && linked ? target.batchId : associated!.batchId } : {}), association: linked ? 'ASSOCIATED' : artifact.association === 'ASSOCIATED' ? 'ORPHAN' : artifact.association,
    kind: a.kind, envelope: a.envelope, accessKey: a.accessKey, version: a.version,
    ...(a.environmentCode ? { environmentCode: a.environmentCode } : {}), ...(a.eventType ? { eventType: a.eventType } : {}),
    ...(a.sequence ? { sequence: a.sequence } : {}), ...(a.statusCode ? { statusCode: a.statusCode } : {}),
    ...(a.statusReason ? { statusReason: a.statusReason } : {}), ...(a.protocolNumber ? { protocolNumber: a.protocolNumber } : {}),
    ...(a.occurredAt ? { occurredAt: a.occurredAt } : {}), ...(a.responseMatches !== undefined ? { responseMatches: a.responseMatches } : {}),
    ...(a.correctionText ? { correctionText: a.correctionText } : {}), ...(a.justification ? { justification: a.justification } : {}),
    reviewHistory: index.histories.get(artifact.id) ?? [] }
}
export function buildDocumentReview(index: DocumentaryIndex, artifact: DocumentArtifactRecord): DocumentReviewSummary {
  const docs = candidates(index, artifact), history = index.histories.get(artifact.id) ?? []
  const linked = associatedDocument(index, artifact)
  const document = linked ?? docs.find(d => d.eligibleForProcessing) ?? docs[0]
  const events = index.eventsByKey.get(key(artifact.normalized.accessKey, artifact.normalized.environmentCode)) ?? []
  const blockedReason = validationProblem(index, artifact)
    ?? (new Set(docs.map(d => d.contentHash)).size > 1 ? 'Mesma chave e ambiente com conteúdos diferentes entre lotes. Nenhuma ocorrência pode ser escolhida para resolver o conflito.' : undefined)
    ?? (!docs.length ? 'Nenhuma nota com esta chave e ambiente foi localizada nesta organização.' : undefined)
  const state = document ? documentaryState(index, document) : { status: 'UNMATCHED' as const, canceled: false }
  const isLatest = latestCces(events).some(e => e.id === artifact.id)
  const canApprove = Boolean(linked && document && !blockedReason && isLatest && artifact.normalized.correctionText?.trim()
    && state.status === 'CCE_PENDING' && events.every(e => isLinked(index, e, document) && !validationProblem(index, e))
    && events.every(e => e.normalized.eventType === '110110') && history[0]?.action !== 'APPROVE_CCE')
  const status = blockedReason && docs.length && new Set(docs.map(d => d.contentHash)).size > 1 ? 'CONFLICT' : state.status
  return { artifact: artifactSummary(index, artifact), candidates: docs.map(d => ({ id: d.id, batchId: d.batchId,
    batchName: index.batches.get(d.batchId)?.originalName ?? 'Lote sem nome', ...(d.companyId ? { companyId: d.companyId } : {}),
    ...(index.companyNames.get(d.companyId ?? '') ? { companyName: index.companyNames.get(d.companyId!)! } : {}), number: d.normalized.number, series: d.normalized.series,
    ...(d.normalized.issuedAt ? { issuedAt: d.normalized.issuedAt } : {}), contentHash: d.contentHash })), ...(linked ? { documentId: linked.id } : {}),
    status, effect: state.status === 'CANCELED' ? state.reason! : state.status === 'CCE_APPROVED'
      ? 'Revisão da CC-e concluída: uso do XML original autorizado na conferência. Demais pendências fiscais e documentais continuam aplicáveis.' : `${state.reason ?? ''} ${pendingEffect}`.trim(),
    ...(blockedReason ? { blockedReason } : {}), canAssociate: !linked && !blockedReason, canApproveCce: canApprove,
    canReopenCce: Boolean(linked && isLatest && artifact.normalized.eventType === '110110' && history[0]?.action === 'APPROVE_CCE'),
    snapshot: digest({ artifactId: artifact.id, documents: docs.map(d => [d.id, d.contentHash, d.eligibleForProcessing, d.pendingReason]),
      events: events.map(e => [e.id, e.contentHash, e.association, e.documentId, index.histories.get(e.id)?.[0]?.id]).sort() }), history }
}
