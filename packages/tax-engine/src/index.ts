export * from './calculation-error'
export * from './rule-selector'
export * from './versioned-rule-selection'
export * from './builtin-rule-pack'
export * from './decimal'
export * from './proportional-allocation'
export * from './declared-comparison'
export * from './parana-common-icms'
export * from './calculation-memory'

/**
 * Porta geral do cálculo fiscal. O primeiro cálculo comum PR está disponível
 * em calculateParanaCommonIcms; a integração e os outros tratamentos seguem
 * o escopo registrado em docs/escopo-fiscal-parana.md.
 */
export interface TaxCalculator {
  calculate(input: unknown): Promise<import('./calculation-memory').CalculationMemory>
}

export * from './rule-condition-catalog'
