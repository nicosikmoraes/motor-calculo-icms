import type { MonthlyConference, MonthlyConferenceInput } from '@motor/contracts'
import { SqliteBatchRepository, SqliteCompanyRepository, SqliteOrganizationRepository, type SqliteDatabase } from '@motor/database'
import { buildMonthlyConsolidation, fiscalPeriod, buildReportData, type ReportData } from '@motor/reporting'
import { getBatchConsolidationDocuments } from './batch-consolidation'
import { queryBatchDetail } from './batch-query-handlers'
import { readDocumentaryIndex, type DocumentaryIndex } from './documentary-evidence'

export function validateMonthlyInput(raw: unknown): MonthlyConferenceInput {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Seleção mensal inválida.')
  const { companyId, period } = raw as Record<string, unknown>
  if (typeof companyId !== 'string' || !companyId.trim() || companyId.length > 128
    || typeof period !== 'string' || !/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error('Escolha uma empresa e um mês válido.')
  return { companyId: companyId.trim(), period }
}

/** Snapshot curto; nunca mantém a transação durante o diálogo de exportação. */
export function queryMonthlyConference(connection: SqliteDatabase, input: MonthlyConferenceInput): MonthlyConference {
  return connection.transaction(() => readMonthlyConference(connection, validateMonthlyInput(input)))
}

function readMonthlyConference(connection: SqliteDatabase, input: MonthlyConferenceInput, index = readDocumentaryIndex(connection)): MonthlyConference {
  const organization = new SqliteOrganizationRepository(connection).findSingle()
  const company = organization && new SqliteCompanyRepository(connection).listByOrganization(organization.id).find(c => c.id === input.companyId)
  if (!company) throw new Error('Empresa não encontrada nesta organização.')
  const repository = new SqliteBatchRepository(connection)
  const batches = repository.listByOrganization(organization!.id)
  const events = batches.flatMap(batch => repository.listDocumentArtifacts(batch.id).filter(a => a.normalized.kind === 'EVENT'))
  const documents = batches.flatMap(batch => getBatchConsolidationDocuments(connection, batch.id, company.id, index)
    .filter(d => d.companyId === company.id).map(d => ({ ...d, batchId: batch.id, receivedAt: batch.receivedAt })))
  const summary = buildMonthlyConsolidation(company.id, input.period, documents)
  const selectedDocuments = documents.filter(d => fiscalPeriod(d.issuedAt) === input.period)
  const sourceIds = new Set(selectedDocuments.map(d => d.batchId))
  const selectedKeys = new Set(selectedDocuments.map(d => JSON.stringify([d.environment, d.accessKey])))
  for (const doc of documents) if (selectedKeys.has(JSON.stringify([doc.environment, doc.accessKey]))) sourceIds.add(doc.batchId)
  for (const event of events) if (selectedKeys.has(JSON.stringify([event.normalized.environmentCode, event.normalized.accessKey]))) sourceIds.add(event.batchId)
  return { companyId: company.id, companyName: company.legalName, period: input.period, summary,
    documents: selectedDocuments.map(d => ({ id: d.documentId, batchId: d.batchId })),
    batches: batches.filter(b => sourceIds.has(b.id)).map(b => ({ id: b.id, name: b.originalName ?? 'Lote sem nome', status: b.status })) }
}

export function queryMonthlyReport(connection: SqliteDatabase, input: MonthlyConferenceInput, appVersion: string): ReportData {
  return connection.transaction(() => {
    const index = readDocumentaryIndex(connection)
    const monthly = readMonthlyConference(connection, validateMonthlyInput(input), index)
    const ids = new Set(monthly.documents.map(d => d.id))
    const reports = monthly.batches.map(batch => {
      const detail = queryBatchDetail(connection, batch.id, undefined, index)
      const documents = detail.documents.filter(d => ids.has(d.id))
      // Diagnósticos e ocorrências sem documento não são atribuídos artificialmente a uma empresa/mês.
      const repository = new SqliteBatchRepository(connection)
      const occurrenceIds = new Set(repository.listNormalizedDocuments(batch.id).filter(d => ids.has(d.id)).map(d => d.occurrenceId))
      const keys = new Set(documents.map(d => JSON.stringify([d.environmentCode, d.accessKey])))
      const artifacts = detail.artifacts.filter(a => (a.documentId && documents.some(d => d.id === a.documentId))
        || (!a.documentId && keys.has(JSON.stringify([a.environmentCode, a.accessKey]))))
      artifacts.forEach(a => occurrenceIds.add(a.occurrenceId))
      const diagnosticIds = new Set(repository.listDiagnostics(batch.id).filter(d => d.occurrenceId && occurrenceIds.has(d.occurrenceId)).map(d => d.id))
      const { consolidation: _consolidation, ...source } = detail
      return buildReportData({ ...source, documents,
        occurrences: detail.occurrences.filter(o => occurrenceIds.has(o.id)),
        diagnostics: detail.diagnostics.filter(d => diagnosticIds.has(d.id)),
        artifacts },
      { generatedAt: monthly.summary.generatedAt, appVersion })
    })
    const documents = reports.flatMap(r => r.documents), items = reports.flatMap(r => r.items)
    const pendencies = reports.flatMap(r => r.pendencies.map(p => ({ ...p, batchId: r.batch.id }))), diagnostics = reports.flatMap(r => r.diagnostics.map(d => ({ ...d, batchId: r.batch.id })))
    const artifacts = reports.flatMap(r => r.artifacts)
    return { schemaVersion: 1, metadata: { generatedAt: monthly.summary.generatedAt, appVersion },
      monthly: { companyId: monthly.companyId, companyName: monthly.companyName, period: monthly.period, batches: monthly.batches },
      // Identificador interno do snapshot, não representa um lote persistido.
      batch: { id: monthly.summary.batchId, status: 'CONFERENCE_ONLY', receivedAt: monthly.summary.generatedAt,
        totalFiles: 0, totalDocuments: documents.length, totalPendencies: pendencies.length },
      consolidation: monthly.summary, documents, items, pendencies, diagnostics, artifacts,
      rules: reports.flatMap(r => r.rules), occurrences: reports.flatMap(r => r.occurrences.map(o => ({ ...o, batchId: r.batch.id }))), assessmentHistory: reports.flatMap(r => r.assessmentHistory),
      counts: { documents: documents.length, items: items.length, pendencies: pendencies.length, diagnostics: diagnostics.length, artifacts: artifacts.length } }
  })
}
