import { compareDecimals, subtractDecimals, decimalText } from './decimal'

export interface DeclaredComparison {
  component: 'BASE' | 'ICMS'
  calculated: string
  declared?: string
  difference?: string
  tolerance: string
  status: 'MATCH' | 'WITHIN_TOLERANCE' | 'DIFFERENT' | 'NOT_DECLARED' | 'INVALID_DECLARED'
}

/** Diferença = calculado - declarado; tolerância inclusiva, sem alterar nenhum valor. */
export function compareDeclared(component: DeclaredComparison['component'], calculated: string,
  declared?: string, tolerance = '0.01'): DeclaredComparison {
  if (compareDecimals(tolerance, '0') < 0) throw new Error('A tolerância não pode ser negativa.')
  const base = { component, calculated: decimalText(calculated), tolerance: decimalText(tolerance) }
  if (declared === undefined) return { ...base, status: 'NOT_DECLARED' }
  try {
    if (compareDecimals(declared, '0') < 0) return { ...base, declared, status: 'INVALID_DECLARED' }
    const difference = subtractDecimals(calculated, declared)
    const absolute = difference.startsWith('-') ? difference.slice(1) : difference
    return { ...base, declared, difference, status: compareDecimals(absolute, '0') === 0 ? 'MATCH'
      : compareDecimals(absolute, tolerance) <= 0 ? 'WITHIN_TOLERANCE' : 'DIFFERENT' }
  } catch { return { ...base, declared, status: 'INVALID_DECLARED' } }
}
