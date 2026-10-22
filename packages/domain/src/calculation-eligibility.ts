import type { NormalizedNfe } from './normalized-nfe'

/** CFOP válido: o código original é preservado, inclusive o 6 usado pelo fornecedor interestadual. */
export function isCalculationEligibleCfop(cfop?: string): boolean {
  return /^[123567]\d{3}$/.test(cfop ?? '')
}
export const calculationCfopExclusionReason = 'Fora do cálculo: CFOP ausente ou inválido.'

/** Recorte da conferência de entradas da empresa compradora no Paraná. */
export function paranaInterstateEntryExclusionReason(nfe: NormalizedNfe, cfop?: string, companyCnpj?: string): string | undefined {
  if (!isCalculationEligibleCfop(cfop)) return calculationCfopExclusionReason
  const buyer = nfe.operationDirection === '0' ? nfe.issuer : nfe.recipient
  const supplier = nfe.operationDirection === '0' ? nfe.recipient : nfe.issuer
  if (!companyCnpj || companyCnpj !== buyer?.taxId || companyCnpj === supplier?.taxId) return 'Este lote está associado ao fornecedor ou a outra empresa. A apuração de entrada atende a empresa compradora identificada no XML.'
  if (buyer.state !== 'PR' || !supplier?.state || supplier.state === 'PR') return 'Fora da apuração interestadual: esta compra não vem de outro estado para o Paraná.'
  if (!['0', '1'].includes(nfe.operationDirection ?? '') || !(nfe.operationDirection === '0' ? /^2/ : /^6/).test(cfop!)) return 'CFOP e sentido da operação não correspondem à entrada interestadual da empresa no Paraná.'
  return undefined
}
