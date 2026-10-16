/** Recorte de cálculo escolhido pelo usuário, aplicado ao CFOP original de cada item. */
export function isCalculationEligibleCfop(cfop?: string): boolean {
  return cfop?.startsWith('6') === true
}

export const calculationCfopExclusionReason = 'Fora do cálculo: somente itens com CFOP iniciado em 6 são calculados.'
