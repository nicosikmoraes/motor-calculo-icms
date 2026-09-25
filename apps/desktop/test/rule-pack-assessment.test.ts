import { describe, expect, it } from 'vitest'
import type { NormalizedNfe, NormalizedNfeItem } from '@motor/domain'
import { BUILTIN_ICMS_OWN_PACK } from '@motor/tax-engine'
import { assessBuiltinRules } from '../src/main/rule-pack-assessment'

const item: NormalizedNfeItem = {
  itemNumber: '1', cfop: '6102',
  declaredIcms: { cst: '00', originCode: '0' },
  source: { format: 'NFE_XML_4_00', xmlPath: 'NFe.infNFe.det[1]' },
}
const note: NormalizedNfe = {
  kind: 'NFE', layoutVersion: '4.00', model: '55',
  accessKey: '0'.repeat(44), number: '1', series: '1',
  issuedAt: '2026-09-15T12:00:00-03:00',
  operationDirection: '1', purposeCode: '1',
  issuer: { state: 'PR', taxRegimeCode: '3' },
  recipient: { state: 'SP' },
  items: [item], declaredTotals: {},
  source: { format: 'NFE_XML_4_00', xmlPath: 'NFe.infNFe' },
}

describe('pacote embarcado de propostas fiscais', () => {
  it.each([
    { destination: 'PR', cfop: '5102', ruleId: 'pr-interna-cfop-5102-cst-00', rate: '19.50' },
    { destination: 'SP', cfop: '6102', ruleId: 'pr-sp-cfop-6102-cst-00', rate: '12.00' },
    { destination: 'BA', cfop: '6102', ruleId: 'pr-ba-cfop-6102-cst-00', rate: '7.00' },
  ])('identifica $destination como rascunho sem selecioná-lo para cálculo', ({ destination, cfop, ruleId, rate }) => {
    const assessment = assessBuiltinRules(
      { ...note, recipient: { state: destination } },
      { ...item, cfop },
    )
    const candidate = assessment.evaluated.find((evaluation) => evaluation.ruleId === ruleId)

    expect(assessment.kind).toBe('DRAFT_MATCH')
    expect(assessment.selectedRuleId).toBeUndefined()
    expect(candidate).toMatchObject({
      status: 'DRAFT', reviewStage: 'CONDITIONS_AND_RATE_APPROVED',
      proposedRate: rate, exclusionReasons: ['NOT_APPROVED'],
      mismatchedConditions: [],
    })
  })

  it('deixa importados e direção inversa sem proposta compatível', () => {
    const imported = assessBuiltinRules(note, {
      ...item, declaredIcms: { cst: '00', originCode: '1' },
    })
    const reverse = assessBuiltinRules({ ...note, issuer: { state: 'BA', taxRegimeCode: '3' }, recipient: { state: 'PR' } }, item)

    expect(imported.kind).toBe('NO_MATCH')
    expect(imported.evaluated.some((evaluation) => evaluation.mismatchedConditions.includes('merchandiseOrigin'))).toBe(true)
    expect(reverse.kind).toBe('NO_MATCH')
  })

  it('registra a revisão dos recortes sem liberar o cálculo e mantém a fonte', () => {
    expect(BUILTIN_ICMS_OWN_PACK.version).toBe(1)
    expect(new Set(BUILTIN_ICMS_OWN_PACK.rules.map((rule) => rule.id)).size).toBe(BUILTIN_ICMS_OWN_PACK.rules.length)
    expect(BUILTIN_ICMS_OWN_PACK.rules.every((rule) => rule.status === 'DRAFT' && rule.reviewStage === 'CONDITIONS_AND_RATE_APPROVED'
      && rule.reviewedOn === '2026-09-25' && rule.sourceUrl.startsWith('https://'))).toBe(true)
  })
})
