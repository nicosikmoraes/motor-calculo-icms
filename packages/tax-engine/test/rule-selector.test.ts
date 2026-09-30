import { describe, expect, it } from 'vitest'
import { RuleLevelCode, selectFiscalRule, type FiscalRule, type RuleContext } from '../src/rule-selector'

const context: RuleContext = {
  emissionDate: '2026-09-15',
  companyId: 'empresa-1',
  originState: 'SP',
  destinationState: 'MG',
  ncm: '22021000',
}

function rule(overrides: Partial<FiscalRule>): FiscalRule {
  return {
    id: 'regra-base',
    version: 1,
    name: 'Regra base',
    status: 'APPROVED',
    level: 'NCM',
    priority: 0,
    validFrom: '2026-01-01',
    legalBasis: 'Fundamento homologado',
    conditions: { ncm: '22021000' },
    ...overrides,
  }
}

describe('selectFiscalRule', () => {
  it('escolhe o nível mais forte antes da prioridade manual', () => {
    const result = selectFiscalRule(
      [
        rule({ id: 'ncm', priority: 100 }),
        rule({
          id: 'empresa',
          level: 'COMPANY',
          priority: 0,
          conditions: { companyId: 'empresa-1' },
        }),
      ],
      context,
    )

    expect(result.kind).toBe('SELECTED')
    if (result.kind === 'SELECTED') expect(result.selected.rule.id).toBe('empresa')
  })

  it('escolhe a regra mais específica dentro do mesmo nível', () => {
    const result = selectFiscalRule(
      [
        rule({ id: 'uma-condicao' }),
        rule({ id: 'duas-condicoes', conditions: { ncm: '22021000', destinationState: 'MG' } }),
      ],
      context,
    )

    expect(result.kind).toBe('SELECTED')
    if (result.kind === 'SELECTED') expect(result.selected.rule.id).toBe('duas-condicoes')
  })

  it('não usa regra fora da vigência ou incompatível', () => {
    const result = selectFiscalRule(
      [
        rule({ id: 'expirada', validUntil: '2025-12-31' }),
        rule({ id: 'outra-uf', conditions: { destinationState: 'RJ' } }),
      ],
      context,
    )

    expect(result.kind).toBe('NOT_FOUND')
    expect(result.considered).toEqual([])
    expect(
      result.evaluated.map(({ rule, exclusionReasons, mismatchedConditions }) => ({
        id: rule.id,
        exclusionReasons,
        mismatchedConditions,
      })),
    ).toEqual([
      { id: 'expirada', exclusionReasons: ['EXPIRED'], mismatchedConditions: [] },
      {
        id: 'outra-uf',
        exclusionReasons: ['CONDITION_MISMATCH'],
        mismatchedConditions: ['destinationState'],
      },
    ])
  })

  it('explica todos os motivos de exclusão sem perder a regra selecionada', () => {
    const result = selectFiscalRule(
      [
        rule({ id: 'escolhida' }),
        rule({
          id: 'rascunho',
          status: 'DRAFT',
          validFrom: '2027-01-01',
          conditions: { ncm: '00000000' },
        }),
        rule({ id: 'revogada', status: 'REVOKED' }),
      ],
      context,
    )

    expect(result.kind).toBe('SELECTED')
    if (result.kind === 'SELECTED') expect(result.selected.rule.id).toBe('escolhida')
    expect(
      result.evaluated.map(({ eligible, exclusionReasons, mismatchedConditions }) => ({
        eligible,
        exclusionReasons,
        mismatchedConditions,
      })),
    ).toEqual([
      { eligible: true, exclusionReasons: [], mismatchedConditions: [] },
      {
        eligible: false,
        exclusionReasons: ['NOT_APPROVED', 'NOT_YET_VALID', 'CONDITION_MISMATCH'],
        mismatchedConditions: ['ncm'],
      },
      { eligible: false, exclusionReasons: ['NOT_APPROVED'], mismatchedConditions: [] },
    ])
  })

  it('declara ambiguidade quando todos os critérios permanecem empatados', () => {
    const result = selectFiscalRule(
      [rule({ id: 'a' }), rule({ id: 'b' })],
      context,
    )

    expect(result.kind).toBe('AMBIGUOUS')
    if (result.kind === 'AMBIGUOUS') {
      expect(result.tied.map((candidate) => candidate.rule.id)).toEqual(['a', 'b'])
    }
  })
})

/** Matriz da DT-006: cada par de níveis é testado mesmo com vantagem artificial da regra inferior. */
const levelConditions = [
  { level: RuleLevelCode.DEFAULT_OPERATION, conditions: { operationType: '1' } },
  { level: RuleLevelCode.NCM, conditions: { ncm: '22021000' } },
  { level: RuleLevelCode.NCM_CEST, conditions: { ncm: '22021000', cest: '0301100' } },
  { level: RuleLevelCode.FISCAL_PROFILE, conditions: { fiscalProfileId: 'perfil-1' } },
  { level: RuleLevelCode.COMPANY, conditions: { companyId: 'empresa-1' } },
  { level: RuleLevelCode.PRODUCT_COMPANY_EXCEPTION, conditions: { companyId: 'empresa-1', supplierProductId: 'produto-1' } },
] as const
const matrixContext: RuleContext = {
  ...context, operationType: '1', cest: '0301100', fiscalProfileId: 'perfil-1',
  supplierProductId: 'produto-1', originState: 'SP', destinationState: 'MG', cfop: '5102',
}
const levelPairs = levelConditions.flatMap((lower, index) => levelConditions.slice(index + 1)
  .map((higher) => ({ lower, higher })))

describe('matriz de precedência DT-006', () => {
  it.each(levelPairs)('$higher.level vence $lower.level apesar da prioridade e especificidade inferiores', ({ lower, higher }) => {
    const stronger = rule({ id: 'forte', level: higher.level, conditions: higher.conditions, priority: 0 })
    const weaker = rule({ id: 'fraca', level: lower.level, priority: 999,
      conditions: { ...lower.conditions, originState: 'SP', destinationState: 'MG', cfop: '5102' } })
    for (const candidates of [[stronger, weaker], [weaker, stronger]]) {
      const result = selectFiscalRule(candidates, matrixContext)
      expect(result.kind).toBe('SELECTED')
      if (result.kind === 'SELECTED') expect(result.selected.rule.id).toBe('forte')
    }
  })

  it.each([
    { name: 'mais condições prevalecem sobre prioridade', first: { priority: 100, conditions: { ncm: '22021000' } },
      second: { priority: 0, conditions: { ncm: '22021000', destinationState: 'MG' } }, expected: 'segunda' },
    { name: 'prioridade desempata especificidade igual', first: { priority: 2, conditions: { ncm: '22021000' } },
      second: { priority: 3, conditions: { ncm: '22021000' } }, expected: 'segunda' },
    { name: 'empate final permanece ambíguo', first: { priority: 2, conditions: { ncm: '22021000' } },
      second: { priority: 2, conditions: { ncm: '22021000' } }, expected: 'AMBIGUOUS' },
  ])('$name', ({ first, second, expected }) => {
    const result = selectFiscalRule([rule({ id: 'primeira', ...first }), rule({ id: 'segunda', ...second })], context)
    expect(result.kind).toBe(expected === 'AMBIGUOUS' ? 'AMBIGUOUS' : 'SELECTED')
    if (result.kind === 'SELECTED') expect(result.selected.rule.id).toBe(expected)
    if (result.kind === 'AMBIGUOUS') expect(result.tied.map(({ rule }) => rule.id)).toEqual(['primeira', 'segunda'])
  })

  it.each([
    { reason: 'rascunho', override: { status: 'DRAFT' as const }, excludedBy: 'NOT_APPROVED' },
    { reason: 'revogação', override: { status: 'REVOKED' as const }, excludedBy: 'NOT_APPROVED' },
    { reason: 'vigência futura', override: { validFrom: '2027-01-01' }, excludedBy: 'NOT_YET_VALID' },
    { reason: 'vigência encerrada', override: { validUntil: '2025-12-31' }, excludedBy: 'EXPIRED' },
    { reason: 'condição divergente', override: { conditions: { companyId: 'outra-empresa' } }, excludedBy: 'CONDITION_MISMATCH' },
  ])('usa nível inferior elegível quando o superior falha por $reason', ({ override, excludedBy }) => {
    const stronger = rule({ id: 'superior', level: RuleLevelCode.COMPANY,
      conditions: { companyId: 'empresa-1' }, ...override })
    const weaker = rule({ id: 'inferior', level: RuleLevelCode.NCM, conditions: { ncm: '22021000' } })
    const result = selectFiscalRule([stronger, weaker], context)
    expect(result.kind).toBe('SELECTED')
    if (result.kind === 'SELECTED') expect(result.selected.rule.id).toBe('inferior')
    expect(result.evaluated.find(({ rule }) => rule.id === 'superior')?.exclusionReasons).toContain(excludedBy)
  })

  it.each([
    { name: 'vigente no primeiro dia', emissionDate: '2026-01-01', validFrom: '2026-01-01', validUntil: '2026-12-31', eligible: true },
    { name: 'vigente no último dia', emissionDate: '2026-12-31', validFrom: '2026-01-01', validUntil: '2026-12-31', eligible: true },
    { name: 'ainda não vigente', emissionDate: '2025-12-31', validFrom: '2026-01-01', validUntil: '2026-12-31', eligible: false },
    { name: 'expirada', emissionDate: '2027-01-01', validFrom: '2026-01-01', validUntil: '2026-12-31', eligible: false },
  ])('$name', ({ emissionDate, validFrom, validUntil, eligible }) => {
    const result = selectFiscalRule([rule({ validFrom, validUntil })], { ...context, emissionDate })
    expect(result.kind).toBe(eligible ? 'SELECTED' : 'NOT_FOUND')
  })
})
