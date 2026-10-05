import type { BatchDetail } from '@motor/contracts'
import { buildBatchConsolidation } from '../src/consolidation'
import { buildReportData } from '../src/report-data'
export function excelFixture() {
  const calculation = { schemaVersion: 1 as const, status: 'CALCULATED' as const, result: { base: '1000.00', rate: '19.5', amount: '120.00' },
    declared: { amount: '119.98' }, deferredAmount: '75.00', inputs: [], steps: [], rule: { id: 'PR_COMMON_195_PARTIAL_DEFERRAL_12', version: 1, legalBasis: 'Fundamento salvo' } }
  const batch: BatchDetail = { batch: { id: 'lote-teste', status: 'COMPLETED', totalFiles: 2, totalDocuments: 1, totalPendencies: 1, receivedAt: '2026-10-04T12:00:00Z' },
    occurrences: [{ id: 'file', originalName: 'nota.xml', relativePath: 'nota.xml', kind: 'XML', origin: 'SELECTED_FILE', contentHash: 'hash', sizeBytes: 100,
      ingestionStatus: 'NORMALIZED', repetition: 'UNIQUE', contentConflict: 'NONE', eligibleForTotals: true }],
    diagnostics: [{ id: 'diag', source: 'outro.xml', code: 'INVALID_XML', message: 'XML inválido.' }], artifacts: [], ruleAssessmentRuns: [],
    documents: [{ id: 'doc', companyId: 'company', companyName: 'Empresa de teste', accessKey: '0'.repeat(44), model: '55', number: '0001', series: '01',
      issuedAt: '2026-09-30T23:30:00-03:00', environmentCode: '1', eligibleForProcessing: true, items: [
        { itemNumber: '1', supplierProductCode: '001', description: 'Produto comum para revenda', ncm: '01012100', cfop: '5102',
          classification: 'CLASSIFICADO', classificationReason: 'PROFILE_ACTIVE', declaredIcmsAmount: '119.98', calculation: { ...calculation, runId: 'run', engineVersion: 'PR_COMMON_2' } },
        { itemNumber: '2', supplierProductCode: '002', description: 'Produto sem destinação informada', ncm: '01012100', cfop: '5102',
          classification: 'PENDENTE', classificationReason: 'PRODUCT_NOT_LINKED', declaredIcmsAmount: '10.00',
          calculation: { status: 'PENDING_DATA', inputs: [], steps: [], reason: 'Defina a destinação.' } },
      ] }] }
  batch.consolidation = buildBatchConsolidation(batch.batch.id, [{ documentId: 'doc', companyId: 'company', companyName: 'Empresa de teste',
    documentNumber: '0001', accessKey: '0'.repeat(44), issuedAt: batch.documents[0]!.issuedAt, perspective: 'PURCHASES', environment: '1',
    authorization: 'UNVERIFIED', runId: 'run', engineVersion: 'PR_COMMON_2', items: [
      { itemNumber: '1', declaredIcms: '119.98', memory: calculation }, { itemNumber: '2', declaredIcms: '10.00', memory: { schemaVersion: 1, status: 'PENDING_DATA', inputs: [], steps: [], reason: 'Defina a destinação.' } },
    ] }])
  return buildReportData(batch, { generatedAt: '2026-10-04T12:00:00Z', appVersion: 'test' })
}
