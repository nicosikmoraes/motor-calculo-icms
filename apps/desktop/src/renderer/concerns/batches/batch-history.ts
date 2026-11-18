import type { CompanySummary, DashboardBatchSummary } from '@motor/contracts'

export interface HistoryFilters { search: string; companyId: string; period: string; status: string }
export interface HistoryStatus {
  label: string
  group: 'attention' | 'complete' | 'processing' | 'stopped' | 'excluded' | 'files'
  tone: 'warning' | 'success' | 'neutral'
}

export function historyMonth(value: string): string {
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` : 'unknown'
}

export function historyMonthLabel(value: string): string {
  if (value === 'unknown') return 'Data não informada'
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(`${value}-15T12:00:00`))
  return label.charAt(0).toLocaleUpperCase('pt-BR') + label.slice(1)
}

/** A importação e a conferência fiscal têm situações diferentes. */
export function historyStatus(batch: DashboardBatchSummary): HistoryStatus {
  if (['RECEBIDO', 'VALIDANDO', 'PROCESSANDO'].includes(batch.status)) {
    return { label: batch.status === 'RECEBIDO' ? 'Recebido' : 'Importando', group: 'processing', tone: 'neutral' }
  }
  if (['INTERROMPIDO', 'CANCELADO', 'FALHOU'].includes(batch.status)) {
    return { label: batch.status === 'FALHOU' ? 'Falha na importação' : batch.status === 'CANCELADO' ? 'Cancelado' : 'Interrompido', group: 'stopped', tone: 'warning' }
  }
  const counts = batch.counts
  if (counts.reviewNotes) return { label: 'Revisão documental', group: 'attention', tone: 'warning' }
  if (counts.pendingItems || counts.pendingNotes) return { label: 'A conferir', group: 'attention', tone: 'warning' }
  if (counts.divergentItems) return { label: 'Divergência', group: 'attention', tone: 'warning' }
  if (batch.totalPendencies) return { label: 'Diagnósticos', group: 'attention', tone: 'warning' }
  if (counts.calculatedNotes) return { label: 'Concluído', group: 'complete', tone: 'success' }
  if (counts.blockedNotes) return { label: 'Fora dos totais', group: 'excluded', tone: 'neutral' }
  if (counts.excludedNotes) return { label: 'Sem CFOP elegível', group: 'excluded', tone: 'neutral' }
  return { label: 'Sem notas', group: 'files', tone: 'neutral' }
}

function searchText(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase('pt-BR')
}

function newestFirst(a: DashboardBatchSummary, b: DashboardBatchSummary): number {
  const left = new Date(a.receivedAt).getTime(), right = new Date(b.receivedAt).getTime()
  const validLeft = Number.isFinite(left), validRight = Number.isFinite(right)
  if (validLeft !== validRight) return validLeft ? -1 : 1
  return (validLeft && validRight ? right - left : 0) || b.id.localeCompare(a.id)
}

/** Filtra os lotes completos; escolher uma empresa não altera os totais do lote. */
export function filterHistory(
  batches: readonly DashboardBatchSummary[], companies: readonly CompanySummary[], filters: HistoryFilters,
): DashboardBatchSummary[] {
  const query = searchText(filters.search.trim())
  const numericQuery = /^[\d.\/\-\s]+$/.test(query) ? query.replace(/\D/g, '') : ''
  const matchedCompanyIds = new Set(companies.filter(company =>
    [company.legalName, company.tradeName ?? '', company.cnpj].some(value => searchText(value).includes(query))
      || Boolean(numericQuery && company.cnpj.includes(numericQuery)),
  ).map(company => company.id))
  return batches.filter(batch => {
    const companyIds = new Set(batch.companies.map(company => company.companyId))
    if (batch.companyId) companyIds.add(batch.companyId)
    const matchesSearch = !query || [batch.originalName ?? '', batch.companyName ?? '', batch.companyCnpj ?? '', batch.id]
      .some(value => searchText(value).includes(query))
      || Boolean(numericQuery && batch.companyCnpj?.includes(numericQuery))
      || [...companyIds].some(id => id && matchedCompanyIds.has(id))
    return matchesSearch && (!filters.companyId || companyIds.has(filters.companyId))
      && (!filters.period || historyMonth(batch.receivedAt) === filters.period)
      && (!filters.status || historyStatus(batch).group === filters.status)
  }).sort(newestFirst)
}

export function groupHistory(batches: readonly DashboardBatchSummary[]) {
  const groups = new Map<string, { key: string; label: string; batches: DashboardBatchSummary[] }>()
  for (const batch of [...batches].sort(newestFirst)) {
    const key = historyMonth(batch.receivedAt)
    let group = groups.get(key)
    if (!group) { group = { key, label: historyMonthLabel(key), batches: [] }; groups.set(key, group) }
    group.batches.push(batch)
  }
  return [...groups.values()]
}

export function summarizeHistory(batches: readonly DashboardBatchSummary[], now = new Date()) {
  const currentMonth = historyMonth(now.toISOString())
  const latest = [...batches].filter(batch => Number.isFinite(new Date(batch.receivedAt).getTime())).sort(newestFirst)[0]
  return {
    total: batches.length,
    thisMonth: batches.filter(batch => historyMonth(batch.receivedAt) === currentMonth).length,
    attention: batches.filter(batch => historyStatus(batch).group === 'attention' || ['INTERROMPIDO', 'FALHOU'].includes(batch.status)).length,
    latest,
  }
}
