export * from './rule-selector'

export interface TaxComponentResult {
  base: string
  rate: string
  amount: string
}

export interface CalculationMemoryEntry {
  step: string
  formula: string
  inputs: Readonly<Record<string, string>>
  result: string
}

/**
 * Porta do cálculo numérico. A implementação será criada depois da aprovação das
 * fórmulas, precisão e arredondamento descritos em `decisoes-pendentes.md`.
 */
export interface TaxCalculator {
  calculate(input: unknown): Promise<{
    components: Readonly<Record<string, TaxComponentResult>>
    memory: readonly CalculationMemoryEntry[]
  }>
}
