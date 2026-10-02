import { describe, expect, it } from 'vitest'
import { normalizeRuleConditions } from '../src/rule-condition-catalog'
import { selectFiscalRule, RuleLevelCode } from '../src/rule-selector'

describe('condições cadastradas', () => {
  it('preserva códigos com zero e seleciona somente contexto compatível', () => {
    const conditions = normalizeRuleConditions({ ncm: ' 01012100 ', cst: '00',
      cfop: '5102', originState: 'PR', operationType: '1' })
    expect(conditions.ncm).toBe('01012100')
    const rule = { id: 'r', version: 1, name: 'Teste', status: 'APPROVED' as const,
      level: RuleLevelCode.NCM, priority: 0, validFrom: '2026-01-01', legalBasis: 'Teste', conditions }
    expect(selectFiscalRule([rule], { emissionDate: '2026-10-01', ...conditions }).kind).toBe('SELECTED')
    expect(selectFiscalRule([rule], { emissionDate: '2026-10-01', ...conditions, cst: '20' }).kind).toBe('NOT_FOUND')
  })
  it.each([
    { ncm: '123' }, { cest: '03.011.00' }, { cfop: '4102' }, { cst: '0' },
    { issuerRegime: '5' }, { originState: 'XX' }, { operationType: 'Saída' },
    { finalConsumer: 'true' }, { purpose: '0' }, { merchandiseOrigin: '9' },
    { rate: '19.5' }, { ncm: 12345678 },
  ])('recusa valores malformados ou campos fora do contrato: %j', (input) => {
    expect(() => normalizeRuleConditions(input)).toThrow()
  })
})
