import { describe, expect, it } from 'vitest'
import { buildBatchConsolidation, fiscalPeriod, type ConsolidationDocument } from '../src/consolidation'
import type { CalculationMemory } from '@motor/tax-engine'
const memory = (amount = '120.00'): CalculationMemory => ({ schemaVersion: 1, status: 'CALCULATED',
  result: { base: '1000.00', rate: '19.5', amount }, deferredAmount: '75.00', inputs: [], steps: [] })
const doc = (changes: Partial<ConsolidationDocument> = {}): ConsolidationDocument => ({ documentId: 'doc', accessKey: 'key', documentNumber: '1',
  companyId: 'company', companyName: 'Empresa', issuedAt: '2026-09-30T23:30:00-03:00', perspective: 'SALES', environment: '1',
  authorization: 'WITH_PROTOCOL', runId: 'run', engineVersion: 'PR_COMMON_2', items: [{ itemNumber: '1', declaredIcms: '119.98', memory: memory() }], ...changes })
describe('consolidação de conferência', () => {
  it('preserva mês civil e rejeita data inválida', () => {
    expect(fiscalPeriod(doc().issuedAt)).toBe('2026-09')
    expect(fiscalPeriod('2026-02-30T00:00:00Z')).toBeUndefined()
    expect(fiscalPeriod('2024-02-29')).toBe('2024-02')
  })
  it('separa empresa, mês, compras, ambiente e autorização sem gerar crédito', () => {
    const variants: Partial<ConsolidationDocument>[] = [{}, { companyId: 'other' }, { issuedAt: '2026-10-01' },
      { perspective: 'PURCHASES' }, { environment: '2' }, { authorization: 'UNVERIFIED' }]
    const result = buildBatchConsolidation('batch', variants.map((v, i) => doc({ ...v, accessKey: `key${i}`, documentId: `doc${i}` })))
    expect(result.groups).toHaveLength(6)
    expect(result.groups.every(g => g.purchaseCredit === 'NOT_CALCULATED')).toBe(true)
    expect(result.counts).toMatchObject({ documents: 6, calculated: 6, divergentItems: 6 })
  })
  it('não compensa divergências e só compara itens com ambos os valores', () => {
    const result = buildBatchConsolidation('batch', [doc({ items: [
      { itemNumber: '1', declaredIcms: '119.98', memory: memory() },
      { itemNumber: '2', declaredIcms: '120.02', memory: memory() },
      { itemNumber: '3', declaredIcms: '100.00' },
      { itemNumber: '4', memory: memory() },
      { itemNumber: '5', declaredIcms: 'invalid', memory: { schemaVersion: 1, status: 'UNSUPPORTED', reason: 'ST', inputs: [], steps: [] } },
    ] })])
    expect(result.groups[0]?.totals).toMatchObject({ calculatedIcms: '360.00', declaredIcms: '340.00',
      comparedCalculatedIcms: '240.00', comparedDeclaredIcms: '240.00', difference: '0.00', absoluteDifferences: '0.04', deferredIcms: '225.00' })
    expect(result.counts).toMatchObject({ calculated: 3, pending: 1, unsupported: 1, divergentItems: 2, declaredMissing: 1, declaredInvalid: 1 })
  })
  it('exclui cancelados, duplicatas, datas inválidas e orientação desconhecida', () => {
    const result = buildBatchConsolidation('b', [doc(), doc({ documentId: 'duplicate' }), doc({ accessKey: 'cancel', exclusionReason: 'Cancelada' }),
      doc({ accessKey: 'date', issuedAt: 'invalid' }), doc({ accessKey: 'unknown', perspective: 'UNDETERMINED' })])
    expect(result.counts).toMatchObject({ excluded: 5, calculated: 0 })
    expect(result.groups.every(g => g.totals.calculatedIcms === '0.00' && g.totals.declaredIcms === '0.00')).toBe(true)
    expect(result.evidence.every(e => e.reasons.length > 0)).toBe(true)
  })
  it('soma centavos além da precisão de Number e mantém tolerância inclusiva', () => {
    const result = buildBatchConsolidation('b', [doc({ items: [
      { itemNumber: '1', memory: memory('12345678901234567890.01'), declaredIcms: '12345678901234567890.00' },
      { itemNumber: '2', memory: memory('0.01'), declaredIcms: '0.01' },
    ] })])
    expect(result.groups[0]?.totals.calculatedIcms).toBe('12345678901234567890.02')
    expect(result.counts).toMatchObject({ withinToleranceItems: 1, divergentItems: 0 })
  })
  it('conserva diferimento histórico e registra ausência sem inventar valor', () => {
    const old = memory(); delete old.deferredAmount; old.steps = [{ name: 'ICMS diferido', operation: 'subtração', inputs: {}, result: '75.00' }]
    const absent = memory(); delete absent.deferredAmount
    const result = buildBatchConsolidation('b', [doc({ items: [{ itemNumber: '1', memory: old }, { itemNumber: '2', memory: absent }] })])
    expect(result.groups[0]?.totals.deferredIcms).toBe('75.00')
    expect(result.counts.deferredMissing).toBe(1)
  })
  it('não totaliza memória calculada incompleta nem altera ou congela a origem', () => {
    const source = doc({ items: [{ itemNumber: '1', memory: { ...memory(), result: { base: '-1', rate: '19.5', amount: '120' } } }] })
    const result = buildBatchConsolidation('b', [source])
    expect(result.counts.pending).toBe(1)
    expect(Object.isFrozen(result.evidence[0]?.reasons)).toBe(true)
    expect(Object.isFrozen(source)).toBe(false)
    source.items[0]!.memory!.reason = 'alteração posterior'
    expect(result.evidence[0]?.reasons).not.toContain('alteração posterior')
  })
})
