import type {
  BatchDetail, BatchDiagnosticSummary, BatchOccurrenceSummary, DocumentArtifactSummary,
  FiscalDocumentSummary, FiscalItemSummary, RuleEvaluationSummary,
} from '@motor/contracts'

export interface ReportMetadata {
  generatedAt: string
  appVersion: string
}
export interface ReportItem extends FiscalItemSummary { documentId: string }
export interface ReportRuleEvidence extends RuleEvaluationSummary {
  documentId: string
  itemNumber: string
  packId: string
  packVersion: number
  assessedAt: string
  selected: boolean
}
export interface ReportPendency {
  batchId?: string
  scope: 'DOCUMENT' | 'CLASSIFICATION' | 'RULE_SELECTION' | 'CALCULATION' | 'ARTIFACT'
  code: string
  documentId?: string
  itemNumber?: string
  artifactId?: string
  detail?: string
}
/** Modelo interno de evidências; não define abas, colunas ou totais fiscais. */
export interface ReportData {
  monthly?: { companyId: string; companyName: string; period: string; batches: readonly { id: string; name: string; status: string }[] }

  consolidation?: BatchDetail['consolidation']
  schemaVersion: 1
  metadata: ReportMetadata
  batch: BatchDetail['batch']
  documents: readonly Omit<FiscalDocumentSummary, 'items'>[]
  items: readonly ReportItem[]
  pendencies: readonly ReportPendency[]
  rules: readonly ReportRuleEvidence[]
  diagnostics: readonly (BatchDiagnosticSummary & { batchId?: string })[]
  occurrences: readonly (BatchOccurrenceSummary & { batchId?: string })[]
  artifacts: readonly DocumentArtifactSummary[]
  assessmentHistory: BatchDetail['ruleAssessmentRuns']
  originalAssessmentPack?: BatchDetail['originalAssessmentPack']
  counts: { documents: number; items: number; pendencies: number; artifacts: number; diagnostics: number }
}

function unique(values: readonly string[], entity: string): Set<string> {
  const seen = new Set<string>()
  for (const value of values) {
    if (!value.trim() || seen.has(value)) throw new Error(`Identificador vazio ou repetido: ${entity}.`)
    seen.add(value)
  }
  return seen
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child)
    Object.freeze(value)
  }
  return value
}

/** Não consulta catálogos atuais, não recalcula imposto e não altera o lote de origem. */
export function buildReportData(source: BatchDetail, metadata: ReportMetadata): ReportData {
  if (!metadata.appVersion.trim() || !Number.isFinite(Date.parse(metadata.generatedAt))
    || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(metadata.generatedAt)) {
    throw new Error('Metadados de relatório inválidos.')
  }
  if (!source.batch.id.trim()) throw new Error('Lote sem identificador.')
  const snapshot = structuredClone(source)
  const documentIds = unique(snapshot.documents.map((document) => document.id), 'documento')
  const occurrenceIds = unique(snapshot.occurrences.map((occurrence) => occurrence.id), 'ocorrência')
  unique(snapshot.artifacts.map((artifact) => artifact.id), 'artefato')
  unique(snapshot.diagnostics.map((diagnostic) => diagnostic.id), 'diagnóstico')
  unique(snapshot.ruleAssessmentRuns.map((run) => run.id), 'avaliação')
  const documents: Omit<FiscalDocumentSummary, 'items'>[] = []
  const items: ReportItem[] = []
  const rules: ReportRuleEvidence[] = []
  const pendencies: ReportPendency[] = []
  for (const document of snapshot.documents) {
    unique(document.items.map((item) => item.itemNumber), 'item do documento')
    const { items: documentItems, ...header } = document
    documents.push(header)
    if (document.conflictResolution && (document.conflictResolution.status !== 'RESOLVED' || !document.conflictResolution.selected)) pendencies.push({ scope: 'DOCUMENT', code: 'DOCUMENT_CONFLICT', documentId: document.id, detail: document.conflictResolution.reason })
    if (document.documentaryReason) pendencies.push({ scope: 'DOCUMENT', code: document.documentaryStatus ?? 'DOCUMENTARY_REVIEW',
      documentId: document.id, detail: document.documentaryReason })
    if (!document.eligibleForProcessing || document.pendingReason) {
      pendencies.push({ scope: 'DOCUMENT', code: 'DOCUMENT_PROCESSING_PENDING', documentId: document.id,
        ...(document.pendingReason ? { detail: document.pendingReason } : {}) })
    }
    for (const item of documentItems) {
      const reference = { documentId: document.id, itemNumber: item.itemNumber }
      items.push({ ...item, documentId: document.id })
      if (item.classification !== 'CLASSIFICADO') pendencies.push({ ...reference,
        scope: 'CLASSIFICATION', code: item.classificationReason })
      const assessment = item.ruleAssessment
      if (assessment) {
        for (const code of assessment.pendingCodes ?? []) pendencies.push({ ...reference,
          scope: 'RULE_SELECTION', code, ...(assessment.pendingDetail ? { detail: assessment.pendingDetail } : {}) })
        for (const rule of assessment.evaluated) rules.push({ ...rule, ...reference,
          packId: assessment.packId, packVersion: assessment.packVersion, assessedAt: assessment.assessedAt,
          selected: assessment.kind === 'SELECTED' && assessment.selectedRuleId === rule.ruleId
            && (assessment.selectedRuleVersion === undefined || assessment.selectedRuleVersion === rule.version) })
      }
      if (item.calculation.status !== 'CALCULATED') pendencies.push({ ...reference,
        scope: 'CALCULATION', code: item.calculation.status,
        ...(item.calculation.reason ? { detail: item.calculation.reason } : {}) })
    }
  }
  for (const artifact of snapshot.artifacts) {
    if (!occurrenceIds.has(artifact.occurrenceId) && (!artifact.sourceBatchId || artifact.sourceBatchId === snapshot.batch.id)) throw new Error('Artefato referencia ocorrência ausente.')
    const externalTarget = artifact.targetBatchId && artifact.targetBatchId !== snapshot.batch.id
    if (artifact.association === 'ASSOCIATED' && (!artifact.documentId || (!documentIds.has(artifact.documentId) && !externalTarget))) {
      throw new Error('Artefato associado referencia documento ausente.')
    }
    if (artifact.documentId && !documentIds.has(artifact.documentId) && !externalTarget) throw new Error('Documento do artefato ausente.')
    if (artifact.association !== 'ASSOCIATED') pendencies.push({ scope: 'ARTIFACT',
      code: artifact.association, artifactId: artifact.id })
    if (artifact.responseMatches === false) pendencies.push({ scope: 'ARTIFACT',
      code: 'ARTIFACT_RESPONSE_MISMATCH', artifactId: artifact.id })
  }
  return freeze({ schemaVersion: 1, metadata: { ...metadata }, batch: snapshot.batch,
    ...(snapshot.consolidation ? { consolidation: snapshot.consolidation } : {}),
    documents, items, pendencies, rules, diagnostics: snapshot.diagnostics,
    occurrences: snapshot.occurrences, artifacts: snapshot.artifacts,
    assessmentHistory: snapshot.ruleAssessmentRuns,
    ...(snapshot.originalAssessmentPack ? { originalAssessmentPack: snapshot.originalAssessmentPack } : {}),
    counts: { documents: documents.length, items: items.length, pendencies: pendencies.length,
      artifacts: snapshot.artifacts.length, diagnostics: snapshot.diagnostics.length } })
}
