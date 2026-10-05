import { describe, expect, it } from 'vitest'
import { allocateProportionally, compareDeclared } from '../src'

describe('rateio decimal por maiores restos', () => {
  it('fecha os centavos com desempate numérico, independentemente da ordem do XML', () => {
    expect(allocateProportionally('0.02', ['10', '2', '1'].map(itemNumber => ({ itemNumber, productAmount: '1' }))))
      .toEqual([{ itemNumber: '10', amount: '0.00', source: 'ALLOCATED' },
        { itemNumber: '2', amount: '0.01', source: 'ALLOCATED' }, { itemNumber: '1', amount: '0.01', source: 'ALLOCATED' }])
  })
  it('respeita proporções e pesos decimais exatos', () => {
    expect(allocateProportionally('10', [{ itemNumber: '1', productAmount: '0.1' }, { itemNumber: '2', productAmount: '0.3' }]).map(item => item.amount))
      .toEqual(['2.50', '7.50'])
  })
  it('preserva valores distribuídos, inclusive zero, e rateia só o saldo', () => {
    expect(allocateProportionally('10', [
      { itemNumber: '1', productAmount: '100', declaredAmount: '4' },
      { itemNumber: '2', productAmount: '100', declaredAmount: '0' },
      { itemNumber: '3', productAmount: '50' }, { itemNumber: '4', productAmount: '100' },
    ]).map(item => item.amount)).toEqual(['4.00', '0.00', '2.00', '4.00'])
  })
  it('não inventa total quando ausente e aceita total zero sem pesos', () => {
    expect(allocateProportionally(undefined, [{ itemNumber: '1', declaredAmount: '2' }, { itemNumber: '2' }]).map(item => item.amount)).toEqual(['2.00', '0.00'])
    expect(allocateProportionally('0', [{ itemNumber: '1' }])[0]?.amount).toBe('0.00')
  })
  it.each(['-1', '0.001', '1e3'])('rejeita total inválido %s sem arredondar o declarado', total => {
    expect(() => allocateProportionally(total, [{ itemNumber: '1', productAmount: '1' }])).toThrow()
  })
  it('bloqueia inconsistências, pesos desconhecidos/negativos/zero e números de item duplicados', () => {
    expect(() => allocateProportionally('1', [{ itemNumber: '1', declaredAmount: '2' }])).toThrow(/excede/)
    expect(() => allocateProportionally('2', [{ itemNumber: '1', declaredAmount: '1' }])).toThrow(/não fecham/)
    expect(() => allocateProportionally('1', [{ itemNumber: '1' }])).toThrow(/valor dos produtos/)
    expect(() => allocateProportionally('1', [{ itemNumber: '1', productAmount: '-1' }])).toThrow(/negativo/)
    expect(() => allocateProportionally('1', [{ itemNumber: '1', productAmount: '0' }])).toThrow(/positivo/)
    expect(() => allocateProportionally('1', [{ itemNumber: '1' }, { itemNumber: '1' }])).toThrow(/únicos/)
  })
  it('reconcilia uma distribuição grande sem perda de centavos', () => {
    const items = Array.from({ length: 999 }, (_, index) => ({ itemNumber: String(index + 1), productAmount: '1' }))
    const result = allocateProportionally('10.00', items)
    expect(result.reduce((sum, item) => sum + BigInt(item.amount.replace('.', '')), 0n)).toBe(1000n)
  })
})

describe('conferência do declarado com tolerância inclusiva', () => {
  it.each([
    ['120', 'MATCH', '0'], ['119.99', 'WITHIN_TOLERANCE', '0.01'],
    ['120.01', 'WITHIN_TOLERANCE', '-0.01'], ['119.98', 'DIFFERENT', '0.02'],
  ])('compara 120 com %s', (declared, status, difference) => {
    expect(compareDeclared('ICMS', '120.00', declared)).toMatchObject({ status, difference, tolerance: '0.01' })
  })
  it('distingue ausente de zero e valores inválidos', () => {
    expect(compareDeclared('BASE', '0', undefined).status).toBe('NOT_DECLARED')
    expect(compareDeclared('BASE', '0', '0').status).toBe('MATCH')
    expect(compareDeclared('ICMS', '0', '-1').status).toBe('INVALID_DECLARED')
    expect(compareDeclared('ICMS', '0', 'abc').status).toBe('INVALID_DECLARED')
  })
})
