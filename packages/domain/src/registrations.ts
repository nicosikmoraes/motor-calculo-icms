export const BRAZILIAN_STATES = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO',
] as const

export type BrazilianState = (typeof BRAZILIAN_STATES)[number]

export interface Organization {
  id: string
  name: string
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface Company {
  id: string
  organizationId: string
  legalName: string
  tradeName?: string
  cnpj: string
  state: BrazilianState
  active: boolean
  inactivatedAt?: string
  createdAt: string
  updatedAt: string
}

function calculateCnpjDigit(digits: readonly number[], weights: readonly number[]): number {
  const sum = digits.reduce((total, digit, index) => total + digit * (weights[index] ?? 0), 0)
  const remainder = sum % 11
  return remainder < 2 ? 0 : 11 - remainder
}

export function isValidCnpj(value: string): boolean {
  if (!/^\d{14}$/.test(value) || /^(\d)\1{13}$/.test(value)) return false

  const digits = [...value].map(Number)
  const first = calculateCnpjDigit(
    digits.slice(0, 12),
    [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  )
  const second = calculateCnpjDigit(
    [...digits.slice(0, 12), first],
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  )

  return digits[12] === first && digits[13] === second
}

export function normalizeCnpj(input: string): string {
  const normalized = input.trim().replace(/[./-]/g, '')
  if (!isValidCnpj(normalized)) throw new Error('CNPJ inválido.')
  return normalized
}

export function normalizeBrazilianState(input: string): BrazilianState {
  const normalized = input.trim().toUpperCase()
  if (!(BRAZILIAN_STATES as readonly string[]).includes(normalized)) {
    throw new Error(`UF inválida: ${input}.`)
  }
  return normalized as BrazilianState
}

export function assertCanonicalUtcTimestamp(value: string, field = 'data'): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    throw new Error(`${field} deve usar UTC no formato ISO 8601 canônico.`)
  }
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error(`${field} contém uma data inválida.`)
  }
  return value
}
