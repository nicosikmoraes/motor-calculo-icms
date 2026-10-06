import { describe, expect, it } from 'vitest'
import { buildMonthlyConsolidation, type MonthlyDocument } from '../src/monthly-consolidation'
const doc = (changes: Partial<MonthlyDocument> = {}): MonthlyDocument => ({ documentId: 'doc1', batchId: 'batch1', receivedAt: '2026-10-01',
  contentHash: 'hash1', accessKey: 'key1', documentNumber: '001', companyId: 'company', companyName: 'Empresa',
  issuedAt: '2026-09-30T23:30:00-03:00', environment: '1', authorization: 'UNVERIFIED', perspective: 'SALES', runId: 'run',
  items: [{ itemNumber: '1', declaredIcms: '120.00', memory: { schemaVersion: 1, status: 'CALCULATED', inputs: [], steps: [],
    result: { base: '1000.00', rate: '12', amount: '120.00' }, deferredAmount: '0.00' } }], ...changes })

describe('conferência mensal entre lotes', () => {
  it('reúne lotes sem duplicar cópias idênticas, independentemente da ordem de consulta', () => {
    const docs = [doc(), doc({ documentId: 'doc2', batchId: 'batch2', receivedAt: '2026-10-02' }),
      doc({ documentId: 'doc3', accessKey: 'key3', contentHash: 'hash3', batchId: 'batch2' })]
    const a = buildMonthlyConsolidation('company', '2026-09', docs, 'now')
    const b = buildMonthlyConsolidation('company', '2026-09', [...docs].reverse(), 'now')
    expect(a.groups).toEqual(b.groups)
    expect(a.counts).toMatchObject({ documents: 3, calculated: 2, excluded: 1 })
    expect(a.groups[0]?.totals.calculatedIcms).toBe('240.00')
    expect(a.evidence.find(e => e.documentId === 'doc2')).toMatchObject({ status: 'EXCLUDED', batchId: 'batch2' })
    expect(a.evidence.find(e => e.documentId === 'doc2')?.reasons[0]).toContain('batch1')
  })
  it('exclui todos os conteúdos conflitantes, mesmo quando a outra cópia tem emissão em outro mês', () => {
    const result = buildMonthlyConsolidation('company', '2026-09', [doc(), doc({ documentId: 'conflict', contentHash: 'different', issuedAt: '2026-08-01' })])
    expect(result.counts).toMatchObject({ documents: 1, excluded: 1, calculated: 0 })
    expect(result.groups[0]?.totals.declaredIcms).toBe('0.00')
    expect(result.evidence[0]?.reasons[0]).toContain('conteúdos diferentes')
  })
  it('isola empresa, mês civil e ambientes e preserva compras e protocolos separados', () => {
    const result = buildMonthlyConsolidation('company', '2026-09', [doc(), doc({ documentId: 'test', environment: '2' }),
      doc({ documentId: 'purchase', accessKey: 'purchase', perspective: 'PURCHASES', authorization: 'WITH_PROTOCOL' }),
      doc({ documentId: 'other', companyId: 'other', contentHash: 'other' }), doc({ documentId: 'month', issuedAt: '2026-10-01', accessKey: 'month' })])
    expect(result.counts.calculated).toBe(3)
    expect(result.groups).toHaveLength(3)
    expect(result.evidence.every(e => e.period === '2026-09' && e.companyId === 'company')).toBe(true)
  })
  it('não promove uma cópia inelegível e não ignora bloqueio documental em outra ocorrência', () => {
    const repeated = doc({ documentId: 'repeated', batchId: 'batch2', exclusionReason: 'Ocorrência duplicada, conflitante ou inelegível para totalização.' })
    expect(buildMonthlyConsolidation('company', '2026-09', [doc(), repeated]).counts.calculated).toBe(1)
    expect(buildMonthlyConsolidation('company', '2026-09', [repeated]).counts.calculated).toBe(0)
    const blocked = { ...repeated, reviewReason: 'Cancelada', exclusionReason: 'Cancelada' }
    expect(buildMonthlyConsolidation('company', '2026-09', [doc(), blocked]).counts.calculated).toBe(0)
  })
  it('mantém memória e origem intactas e retorna mês vazio sem valores inventados', () => {
    const source = doc()
    const result = buildMonthlyConsolidation('company', '2026-09', [source])
    expect(source.exclusionReason).toBeUndefined()
    expect(Object.isFrozen(source)).toBe(false)
    expect(result.evidence[0]).toMatchObject({ runId: 'run', batchId: 'batch1' })
    expect(buildMonthlyConsolidation('company', '2026-07', [source]).groups).toEqual([])
  })
})
