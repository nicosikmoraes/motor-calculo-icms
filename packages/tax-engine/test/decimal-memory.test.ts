import { describe, expect, it } from 'vitest'
import { addDecimals, decimalText, multiplyDecimals, pendingCalculation, subtractDecimals } from '../src'

describe('decimal fiscal e memória pendente', () => {
  it('opera textos decimais sem erro binário ou notação exponencial', () => {
    expect(addDecimals('0.1', '0.2')).toBe('0.3')
    expect(subtractDecimals('1', '0.9')).toBe('0.1')
    expect(multiplyDecimals('0.19', '0.05')).toBe('0.0095')
    expect(() => decimalText('000.1')).toThrow()
    expect(decimalText('0.00000000000000000001')).toBe('0.00000000000000000001')
  })

  it('rejeita números que excedem o limite e não inventa resultado fiscal', () => {
    expect(() => decimalText('1e3')).toThrow()
    expect(() => multiplyDecimals('9'.repeat(40), '9'.repeat(40))).toThrow(/limite/)
    expect(pendingCalculation('PENDING_RULE', 'Regra em revisão', [], { amount: '19.50' }))
      .toMatchObject({ status: 'PENDING_RULE', declared: { amount: '19.50' }, steps: [] })
  })
})
