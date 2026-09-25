import { describe, expect, it } from 'vitest'
import { selectFiscalRule, type FiscalRule, type RuleContext } from '../src/rule-selector'

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
