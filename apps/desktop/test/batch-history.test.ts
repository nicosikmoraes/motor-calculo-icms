import { describe, expect, it } from 'vitest'
import type { CompanySummary, DashboardBatchSummary, DashboardCounts } from '@motor/contracts'
import { filterHistory, groupHistory, historyMonth, historyStatus, summarizeHistory } from '../src/renderer/batch-history'

const companyA: CompanySummary = { id: 'company-a', revision: 1, legalName: 'Comércio Araucária', tradeName: 'Mercado da Praça', cnpj: '11222333000181', state: 'PR', active: false }
const companyB: CompanySummary = { ...companyA, id: 'company-b', legalName: 'Oficina Horizonte', tradeName: 'Horizonte', cnpj: '11444777000161', active: true }
const filters = { search: '', companyId: '', period: '', status: '' }
function batch(id: string, options: Partial<DashboardBatchSummary> = {}, counts: Partial<DashboardCounts> = {}): DashboardBatchSummary {
  const saved = { receivedNotes: 10, calculatedNotes: 10, pendingNotes: 0, excludedNotes: 0, blockedNotes: 0, reviewNotes: 0, pendingItems: 0, divergentItems: 0, ...counts }
  return { id, originalName: `${id}.zip`, status: 'CONCLUIDO', receivedAt: '2026-10-15T14:30:00-03:00', totalFiles: 12, totalDocuments: 10,
    totalPendencies: 0, counts: saved, companies: [{ companyId: companyA.id, ...saved }], ...options }
}

describe('histórico de lotes', () => {
  it('combina busca sem acentos, empresa de lote misto, mês e situação sem mudar os totais do lote', () => {
    const mixed = batch('lote-misto', { companies: [
      { companyId: companyA.id, receivedNotes: 6, calculatedNotes: 6, pendingNotes: 0, excludedNotes: 0, blockedNotes: 0, reviewNotes: 0, pendingItems: 0, divergentItems: 0 },
      { companyId: companyB.id, receivedNotes: 4, calculatedNotes: 3, pendingNotes: 1, excludedNotes: 0, blockedNotes: 0, reviewNotes: 0, pendingItems: 2, divergentItems: 0 },
    ] }, { calculatedNotes: 9, pendingNotes: 1, pendingItems: 2 })
    const result = filterHistory([batch('outro'), mixed], [companyA, companyB], {
      search: 'comercio araucaria', companyId: companyB.id, period: '2026-10', status: 'attention',
    })
    expect(result).toEqual([mixed])
    expect(result[0]?.counts.receivedNotes).toBe(10)
    expect(filterHistory([mixed], [companyA, companyB], { ...filters, status: 'complete' })).toEqual([])
  })

  it('busca nomes de pacote, nome fantasia e CNPJ formatado, incluindo empresa inativa', () => {
    const rows = [batch('entrada-outubro')]
    for (const search of ['entrada-outubro.zip', 'mercado da praca', '11.222.333/0001-81']) {
      expect(filterHistory(rows, [companyA], { ...filters, search })).toEqual(rows)
    }
    expect(filterHistory(rows, [companyA], { ...filters, search: 'sem correspondência' })).toEqual([])
  })

  it('encontra lote sem notas pelo vínculo da empresa e não exige empresa para listar arquivos órfãos', () => {
    const events = batch('eventos', { companyId: companyA.id, companies: [] }, { receivedNotes: 0, calculatedNotes: 0 })
    const orphan = batch('orfaos', { companies: [] }, { receivedNotes: 0, calculatedNotes: 0 })
    expect(filterHistory([events, orphan], [companyA], { ...filters, companyId: companyA.id })).toEqual([events])
    expect(filterHistory([orphan], [], filters)).toEqual([orphan])
    expect(historyStatus(orphan)).toMatchObject({ group: 'files', tone: 'neutral' })
  })

  it('ordena por instante real e agrupa por mês sem modificar a lista recebida', () => {
    const older = batch('antigo', { receivedAt: '2026-09-12T12:00:00-03:00' })
    const first = batch('mais-recente', { receivedAt: '2026-10-15T14:00:00-03:00' })
    const second = batch('anterior', { receivedAt: '2026-10-15T16:30:00Z' })
    const rows = Object.freeze([older, second, first])
    const result = filterHistory(rows, [], filters)
    expect(result.map(row => row.id)).toEqual(['mais-recente', 'anterior', 'antigo'])
    const groups = groupHistory(rows)
    expect(groups.map(group => group.key)).toEqual(['2026-10', '2026-09'])
    expect(groups[0]?.batches.map(row => row.id)).toEqual(['mais-recente', 'anterior'])
    expect(rows[0]).toBe(older)
  })

  it('preserva datas inválidas num grupo separado sem quebrar a formatação ou a última importação', () => {
    const invalid = batch('data-invalida', { receivedAt: 'sem-data' })
    const valid = batch('valido')
    const groups = groupHistory([invalid, valid])
    expect(groups[1]).toMatchObject({ key: 'unknown', label: 'Data não informada', batches: [invalid] })
    expect(summarizeHistory([invalid, valid]).latest).toBe(valid)
    expect(summarizeHistory([invalid]).latest).toBeUndefined()
    expect(historyMonth('sem-data')).toBe('unknown')
  })

  it('prioriza pendências e divergências mesmo quando a importação foi concluída e há cálculo salvo', () => {
    const divergent = batch('divergente', {}, { divergentItems: 2 })
    const pending = batch('pendente', {}, { calculatedNotes: 9, pendingNotes: 1, pendingItems: 4 })
    const review = batch('documental', {}, { blockedNotes: 1, reviewNotes: 1 })
    const diagnostics = batch('diagnosticos', { totalPendencies: 1 })
    for (const row of [divergent, pending, review, diagnostics]) expect(historyStatus(row).group).toBe('attention')
    expect(historyStatus(divergent).label).toBe('Divergência')
    expect(historyStatus(review).label).toBe('Revisão documental')
    expect(summarizeHistory([divergent, pending, review, diagnostics]).attention).toBe(4)
  })

  it('distingue importação em andamento, interrupção, falha e notas fora do cálculo', () => {
    expect(historyStatus(batch('processando', { status: 'PROCESSANDO' })).group).toBe('processing')
    expect(historyStatus(batch('interrompido', { status: 'INTERROMPIDO' })).group).toBe('stopped')
    expect(historyStatus(batch('falhou', { status: 'FALHOU' })).label).toBe('Falha na importação')
    expect(historyStatus(batch('cancelado', { status: 'CANCELADO' })).label).toBe('Cancelado')
    expect(historyStatus(batch('sem-icms', {}, { calculatedNotes: 0, excludedNotes: 10 })).group).toBe('excluded')
    expect(historyStatus(batch('excluido', {}, { calculatedNotes: 0, blockedNotes: 10 })).group).toBe('excluded')
  })

  it('resume todo o histórico pelo mês de importação e trata a instalação vazia', () => {
    const october = batch('outubro')
    const september = batch('setembro', { receivedAt: '2026-09-20T14:00:00-03:00' })
    const stopped = batch('retomar', { status: 'INTERROMPIDO' })
    const now = new Date('2026-10-20T12:00:00-03:00')
    expect(summarizeHistory([september, october, stopped], now)).toMatchObject({ total: 3, thisMonth: 2, attention: 1 })
    expect(summarizeHistory([], now)).toEqual({ total: 0, thisMonth: 0, attention: 0, latest: undefined })
    expect(groupHistory([])).toEqual([])
  })
})
