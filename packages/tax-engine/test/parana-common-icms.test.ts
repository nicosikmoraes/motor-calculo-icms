import { describe, expect, it } from 'vitest'
import { calculateParanaCommonIcms, roundMoney, type ParanaCommonIcmsInput } from '../src'

const common: ParanaCommonIcmsInput = {
  operationDate: '2026-10-04', issuerState: 'PR', recipientState: 'PR', issuerRegime: 'NORMAL',
  recipientIsIcmsTaxpayer: true, destination: 'RESALE', constructionCompany: false,
  petroleumOrFuel: false, ordinaryTaxTreatmentConfirmed: true, productAmount: '1000',
}

describe('ICMS próprio comum PR e diferimento parcial', () => {
  it('mantém alíquota nominal, carga de 12% e reconcilia o imposto diferido', () => {
    const memory = calculateParanaCommonIcms(common)
    expect(memory.result).toEqual({ base: '1000', rate: '19.5', amount: '120.00' })
    expect(memory.steps.map(step => step.result)).toEqual(['1000', '195.00', '120.00', '75.00'])
    expect(memory.rule?.legalBasis).toContain('arts. 28 e 29')
  })

  it.each(['OWN_USE', 'FIXED_ASSET'] as const)('encerra o diferimento para %s, mesmo com IE', destination => {
    expect(calculateParanaCommonIcms({ ...common, destination }).result?.amount).toBe('195.00')
  })

  it('não difere venda a não contribuinte ou empresa de construção civil', () => {
    expect(calculateParanaCommonIcms({ ...common, recipientIsIcmsTaxpayer: false }).result?.amount).toBe('195.00')
    expect(calculateParanaCommonIcms({ ...common, constructionCompany: true }).result?.amount).toBe('195.00')
  })

  it('compõe a base com os valores do item sem duplicar ICMS e preserva o declarado', () => {
    const declared = { base: '999', rate: '18', amount: '179.82' }
    const memory = calculateParanaCommonIcms({ ...common, productAmount: '100', freightAmount: '10',
      insuranceAmount: '2', otherAmount: '3', discountAmount: '5', discountTreatment: 'UNCONDITIONAL',
      ipiAmount: '10', ipiTreatment: 'EXCLUDED', declared })
    expect(memory.result).toEqual({ base: '110', rate: '19.5', amount: '13.20' })
    expect(memory.declared).toEqual(declared)
    expect(declared.amount).toBe('179.82')
  })

  it('inclui IPI confirmado e não deduz desconto condicional', () => {
    expect(calculateParanaCommonIcms({ ...common, productAmount: '100', ipiAmount: '10', ipiTreatment: 'INCLUDED',
      discountAmount: '5', discountTreatment: 'CONDITIONAL' }).result?.base).toBe('110')
  })

  it('pede classificação de desconto/IPI não nulos sem inventar tratamento', () => {
    expect(calculateParanaCommonIcms({ ...common, discountAmount: '5' }).status).toBe('PENDING_DATA')
    expect(calculateParanaCommonIcms({ ...common, ipiAmount: '10' }).status).toBe('PENDING_DATA')
  })

  it.each(['destination', 'recipientIsIcmsTaxpayer', 'constructionCompany', 'ordinaryTaxTreatmentConfirmed', 'productAmount'] as const)(
    'preserva pendência quando falta %s', field => {
      const memory = calculateParanaCommonIcms({ ...common, [field]: undefined, declared: { amount: '195' } })
      expect(memory.status).toBe('PENDING_DATA')
      expect(memory.result).toBeUndefined()
      expect(memory.declared?.amount).toBe('195')
    })

  it.each([
    { issuerRegime: 'SIMPLES' }, { issuerRegime: 'MEI' }, { recipientState: 'SP' },
    { petroleumOrFuel: true }, { ordinaryTaxTreatmentConfirmed: false }, { operationDate: '2024-03-17' },
  ] satisfies Partial<ParanaCommonIcmsInput>[])('separa operações fora do escopo %j', changes => {
    const memory = calculateParanaCommonIcms({ ...common, ...changes })
    expect(memory.status).toBe('UNSUPPORTED')
    expect(memory.steps).toEqual([])
  })

  it.each(['-1', '1e3', 'abc', '9'.repeat(41)])('preserva para revisão o valor %s', productAmount => {
    expect(calculateParanaCommonIcms({ ...common, productAmount }).status).toBe('PENDING_DATA')
  })

  it('aceita base zero, bloqueia base negativa e data inexistente', () => {
    expect(calculateParanaCommonIcms({ ...common, productAmount: '0' }).result?.amount).toBe('0.00')
    expect(calculateParanaCommonIcms({ ...common, productAmount: '1', discountAmount: '2', discountTreatment: 'UNCONDITIONAL' }).status).toBe('PENDING_DATA')
    expect(calculateParanaCommonIcms({ ...common, operationDate: '2026-02-30' }).status).toBe('PENDING_DATA')
  })

  it('arredonda HALF_UP por parcela e reconcilia centavos sem percentual de diferimento truncado', () => {
    expect(roundMoney('1.005')).toBe('1.01')
    expect(calculateParanaCommonIcms({ ...common, productAmount: '0.1' }).steps.map(step => step.result))
      .toEqual(['0.1', '0.02', '0.01', '0.01'])
  })
})
