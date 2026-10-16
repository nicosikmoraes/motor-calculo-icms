import { isCalculationEligibleCfop } from '@motor/domain'
import { itemCalculationComponents, itemCalculationStatus, type DashboardBatchSummary, type DashboardCompanyCounts, type DashboardCounts } from '@motor/contracts'
import { type SqliteDatabase } from '@motor/database'
import { getBatchConsolidationDocuments } from './batch-consolidation'
import { documentaryState, readDocumentaryIndex } from './documentary-evidence'

function emptyCounts(): DashboardCounts {
  return { receivedNotes: 0, calculatedNotes: 0, pendingNotes: 0, excludedNotes: 0, blockedNotes: 0, reviewNotes: 0, pendingItems: 0, divergentItems: 0 }
}

/** Consulta somente memórias salvas e a política documental da consolidação. Não recalcula notas. */
export function queryDashboard(connection: SqliteDatabase): readonly DashboardBatchSummary[] {
  const evidence = readDocumentaryIndex(connection)
  return [...evidence.batches.values()].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt) || b.id.localeCompare(a.id)).map(batch => {
    const byCompany = new Map<string, DashboardCompanyCounts>()
    for (const document of getBatchConsolidationDocuments(connection, batch.id, undefined, evidence)) {
      const key = document.companyId ?? ''
      let counts = byCompany.get(key)
      if (!counts) {
        counts = { ...emptyCounts(), ...(document.companyId ? { companyId: document.companyId } : {}) }
        byCompany.set(key, counts)
      }
      counts.receivedNotes++
      const eligible = document.items.filter(item => isCalculationEligibleCfop(item.cfop))
      if (document.exclusionReason) {
        counts.blockedNotes++
        const record = evidence.documents.get(document.documentId)
        if (document.reviewReason && record && !documentaryState(evidence, record).canceled) counts.reviewNotes++
        continue
      }
      if (!eligible.length) { counts.excludedNotes++; continue }
      let complete = true
      for (const item of eligible) {
        const saved = Boolean(document.runId && item.memory && itemCalculationStatus(item.memory) === 'CALCULATED')
        if (!saved) { counts.pendingItems++; complete = false }
        else if (item.memory && itemCalculationComponents(item.memory).some(component => component.comparisons?.some(comparison => comparison.status === 'DIFFERENT'))) {
          counts.divergentItems++
        }
      }
      if (complete) counts.calculatedNotes++
      else counts.pendingNotes++
    }
    // Lotes com apenas eventos/protocolos também pertencem ao histórico da empresa.
    if (!byCompany.size && batch.companyId && evidence.companies.has(batch.companyId)) {
      byCompany.set(batch.companyId, { companyId: batch.companyId, ...emptyCounts() })
    }
    const counts = emptyCounts()
    for (const company of byCompany.values()) {
      for (const field of Object.keys(counts) as (keyof DashboardCounts)[]) counts[field] += company[field]
    }
    const companyIds = [...byCompany.keys()].filter(Boolean)
    const company = byCompany.size === 1 && companyIds.length === 1 ? evidence.companies.get(companyIds[0]!) : undefined
    return {
      id: batch.id, status: batch.status, receivedAt: batch.receivedAt,
      totalFiles: batch.totalFiles, totalDocuments: batch.totalDocuments, totalPendencies: batch.totalPendencies,
      ...(batch.originalName ? { originalName: batch.originalName } : {}),
      ...(batch.environmentCode ? { environmentCode: batch.environmentCode } : {}),
      ...(company ? { companyId: company.id, companyName: company.legalName, companyCnpj: company.cnpj }
        : companyIds.length ? { companyName: `${companyIds.length} empresa(s)${byCompany.has('') ? ' + notas sem empresa' : ''}` } : {}),
      counts, companies: [...byCompany.values()],
    }
  })
}
