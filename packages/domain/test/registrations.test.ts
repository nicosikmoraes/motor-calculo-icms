import { describe, expect, it } from 'vitest'
import {
  assertCanonicalUtcTimestamp,
  isValidCnpj,
  normalizeBrazilianState,
  normalizeCnpj,
} from '../src'

describe('validações cadastrais', () => {
  it('normaliza e valida CNPJ pelos dígitos verificadores', () => {
    expect(normalizeCnpj('11.222.333/0001-81')).toBe('11222333000181')
    expect(isValidCnpj('11222333000181')).toBe(true)
    expect(isValidCnpj('11222333000182')).toBe(false)
    expect(() => normalizeCnpj('00.000.000/0000-00')).toThrow(/CNPJ inválido/)
  })

  it('normaliza somente UFs brasileiras', () => {
    expect(normalizeBrazilianState(' pr ')).toBe('PR')
    expect(() => normalizeBrazilianState('XX')).toThrow(/UF inválida/)
  })

  it('exige timestamp UTC canônico e data existente', () => {
    expect(assertCanonicalUtcTimestamp('2026-09-21T18:00:00.000Z')).toBe(
      '2026-09-21T18:00:00.000Z',
    )
    expect(() => assertCanonicalUtcTimestamp('2026-09-21T15:00:00-03:00')).toThrow(/UTC/)
    expect(() => assertCanonicalUtcTimestamp('2026-02-30T18:00:00.000Z')).toThrow(
      /data inválida/,
    )
  })
})
