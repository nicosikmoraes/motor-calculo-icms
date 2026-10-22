import { describe, expect, it } from 'vitest'
import { isCalculationEligibleCfop } from '../src'

describe('filtro de CFOP para cálculo', () => {
  it.each(['1102', '2102', '3102', '5101', '5102', '5403', '7102'])('permite o CFOP válido %s', cfop => {
    expect(isCalculationEligibleCfop(cfop)).toBe(true)
  })
  it.each(['6101', '6102', '6403', '6910', '6911', '6999'])('preserva o CFOP interestadual %s do fornecedor', cfop => {
    expect(isCalculationEligibleCfop(cfop)).toBe(true)
  })
  it.each([undefined, '', '6', '510', '51022', 'ABC1', '4102', '8102', ' 5102'])('não calcula CFOP ausente ou inválido (%s)', cfop => {
    expect(isCalculationEligibleCfop(cfop)).toBe(false)
  })
})
