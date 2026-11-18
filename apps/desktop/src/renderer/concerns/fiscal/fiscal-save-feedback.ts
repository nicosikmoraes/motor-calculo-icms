import { itemCalculationComponents, itemCalculationStatus, type ItemFiscalContext } from '@motor/contracts'

/** Aplicar respostas a um grupo não significa que o imposto foi calculado. */
export function fiscalSaveFeedback(context: ItemFiscalContext, draft = false): string {
  if (itemCalculationStatus(context.calculation) !== 'CALCULATED') {
    const reasons = [...new Set(itemCalculationComponents(context.calculation).filter(component => component.status !== 'CALCULATED' || component.reviewReason)
      .map(component => component.reviewReason ?? component.reason).filter(Boolean))]
    return `${draft ? 'Guardado para revisão.' : 'Cálculo não concluído.'} ${reasons.join(' ') || 'Há dados ou regras pendentes.'}`
  }
  if (context.appliedBatchItems) return `${context.appliedBatchItems} itens equivalentes do lote calculados, cada um com os próprios valores.`
  if (context.appliedItemNumbers && context.appliedItemNumbers.length > 1) return `${context.appliedItemNumbers.length} itens compatíveis desta nota calculados, cada um com os próprios valores.`
  if (context.answers.entryMethod === 'NO_DEBIT') return 'Decisão de entrada sem novo débito salva com justificativa.'
  return 'Cálculo concluído e salvo. O item saiu da lista de itens sem cálculo.'
}
