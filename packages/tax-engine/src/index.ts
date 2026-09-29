export * from './rule-selector'
export * from './builtin-rule-pack'
export * from './decimal'
export * from './calculation-memory'

/**
 * Porta do cálculo fiscal. A implementação depende da aprovação de fórmulas,
 * exceções, precisão e arredondamento descritos em `decisoes-pendentes.md`.
 */
export interface TaxCalculator {
  calculate(input: unknown): Promise<import('./calculation-memory').CalculationMemory>
}
