import { describe, expect, it } from 'vitest'
import { calculateParanaEntryRateDifference } from '../src/parana-entry-rate-difference'

const input = { operationDate: '2026-08-18', issuerState: 'SP', recipientState: 'PR', supplierRegime: '3', merchandiseOrigin: '2',
  baseAmount: '2184.86', interstateRate: '4', internalRate: '12', applicationConfirmed: true, baseConfirmed: true }
describe('antecipação de entrada separada do ICMS próprio', () => {
  it('reproduz a diferença sem usar o ICMS destacado já arredondado como dedução', () => {
    const result = calculateParanaEntryRateDifference(input)
    expect(result.result).toEqual({ component: 'ICMS_ENTRY', base: '2184.86', rate: '12', amount: '174.79' })
    expect(result.steps[0]?.result).toBe('87.3944')
    expect(result.declared).toBeUndefined()
    expect(result.comparisons).toBeUndefined()
  })
  it.each([
    { applicationConfirmed: undefined }, { baseConfirmed: false }, { internalRate: undefined }, { baseAmount: '-1' },
    { internalRate: '101' }, { internalRate: '3' }, { operationDate: '2026-02-30' }, { baseAmount: 'abc' },
  ])('mantém pendente uma premissa ausente ou inválida: %j', patch => {
    expect(calculateParanaEntryRateDifference({ ...input, ...patch }).status).toBe('PENDING_DATA')
  })
  it.each([{ issuerState: 'PR' }, { recipientState: 'SP' }, { interstateRate: '12' }, { supplierRegime: '1' }, { merchandiseOrigin: '0' }, { operationDate: '2026-10-19' }])('não aplica o recorte em outra hipótese: %j', patch => {
    expect(calculateParanaEntryRateDifference({ ...input, ...patch }).status).toBe('UNSUPPORTED')
  })
  it('preserva base e carga zeradas permitidas', () => {
    expect(calculateParanaEntryRateDifference({ ...input, baseAmount: '0', internalRate: '4' }).result?.amount).toBe('0.00')
  })
})
