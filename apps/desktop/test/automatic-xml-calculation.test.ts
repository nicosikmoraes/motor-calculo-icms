import { describe, expect, it } from 'vitest'
import type { NormalizedNfe, NormalizedNfeItem } from '@motor/domain'
import { calculateAutomaticXmlItem, isAutomaticXmlCalculation } from '../src/main/automatic-xml-calculation'

const source = { format: 'NFE_XML_4_00' as const, xmlPath: 'NFe' }
const item: NormalizedNfeItem = { itemNumber: '1', cfop: '6102', productAmount: '100', ipiAmount: '10', source,
  declaredIcms: { cst: '00', baseMode: '3', baseAmount: '100', rate: '4', amount: '4.00' } }
const note: NormalizedNfe = { kind: 'NFE', layoutVersion: '4.00', model: '55', purposeCode: '1',
  issuer: { state: 'SP', taxRegimeCode: '3' }, items: [item], declaredTotals: {}, source }
const calculate = (changes: Partial<NormalizedNfeItem> = {}) => calculateAutomaticXmlItem(note, { ...item, ...changes })

describe('conferência aritmética do XML com IPI', () => {
  it.each([['100', '4.00'], ['110', '4.40']])('usa vBC %s sem decidir se o IPI deve integrá-la', (baseAmount, amount) => {
    const memory = calculate({ declaredIcms: { ...item.declaredIcms!, baseAmount, amount } })!
    expect(memory.status).toBe('CALCULATED')
    expect(memory.result).toMatchObject({ base: baseAmount, rate: '4', amount })
    expect(memory.inputs.find(input => input.name === 'ipiAmount')).toMatchObject({ value: '10', source: 'XML/vIPI', treatment: 'UNDECIDED' })
    expect(memory.inputs.find(input => input.name === 'xmlOwnBaseAmount')).toMatchObject({ value: baseAmount, source: 'XML/vBC' })
    expect(memory.inputs.some(input => input.source.startsWith('USER/') || input.name === 'applicationConfirmed')).toBe(false)
    expect(memory.comparisons).toHaveLength(1)
    expect(memory.comparisons![0]).toMatchObject({ component: 'ICMS', status: 'MATCH' })
  })
  it.each([['492.38', '19.69', '19.70', '0.01'], ['666.60', '26.67', '26.66', '-0.01']])('preserva a diferença de centavo para a base %s', (baseAmount, declared, amount, difference) => {
    const memory = calculate({ declaredIcms: { ...item.declaredIcms!, baseAmount, amount: declared } })!
    expect(memory.result?.amount).toBe(amount)
    expect(memory.comparisons![0]).toMatchObject({ declared, difference, status: 'WITHIN_TOLERANCE' })
    expect(Number(memory.comparisons![0]!.calculated)).toBe(Number(amount))
  })
  it('mantém pendente a falta de vBC e rejeita base e IPI negativos', () => {
    const { baseAmount: _base, ...withoutBase } = item.declaredIcms!
    expect(calculate({ declaredIcms: withoutBase })).toMatchObject({ status: 'PENDING_DATA', reason: expect.stringContaining('vBC') })
    expect(calculate({ declaredIcms: { ...item.declaredIcms!, baseAmount: '-1' } })).toMatchObject({ status: 'PENDING_DATA', reason: expect.stringContaining('negativa') })
    expect(calculate({ ipiAmount: '-1' })).toMatchObject({ status: 'PENDING_DATA', reason: expect.stringContaining('IPI') })
  })
  it('conserva os bloqueios de modalidade, redução e FCP próprio', () => {
    for (const tax of [{ cst: '20' }, { baseMode: '0' }, { baseReductionPercent: '10' }, { fcpAmount: '2' }]) {
      expect(calculate({ declaredIcms: { ...item.declaredIcms!, ...tax } })).toBeUndefined()
    }
  })
  it('sem IPI continua reconstruindo a base para detectar divergência', () => {
    const memory = calculate({ ipiAmount: '0', declaredIcms: { ...item.declaredIcms!, baseAmount: '110' } })!
    expect(memory.result?.base).toBe('100')
    expect(memory.comparisons?.find(comparison => comparison.component === 'BASE')).toMatchObject({ declared: '110', calculated: '100', status: 'DIFFERENT' })
  })
  it('reconhece memórias da versão anterior sem classificá-las como revisão manual', () => {
    expect(isAutomaticXmlCalculation({ inputs: [{ name: 'automaticXmlCalculation', value: 'XML_ARITHMETIC_1' }] })).toBe(true)
  })
})
