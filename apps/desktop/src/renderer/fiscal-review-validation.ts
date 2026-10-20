import type { ItemFiscalAnswers, ItemFiscalQuestion } from '@motor/contracts'

export type FiscalSelections = Partial<Record<keyof ItemFiscalAnswers, string>>
export function fiscalReviewErrors(questions: readonly ItemFiscalQuestion[], selections: FiscalSelections): Partial<Record<keyof ItemFiscalAnswers, string>> {
  const errors: Partial<Record<keyof ItemFiscalAnswers, string>> = {}
  const labels: Partial<Record<keyof ItemFiscalAnswers, string>> = {
    entryBaseAmount: 'a base legal da antecipação em reais',
    entryInternalRate: 'a carga interna efetiva da entrada',
    stInternalRate: 'a alíquota interna de ICMS', stOwnOperationRate: 'a alíquota da operação própria',
    stMvaPercent: 'a MVA final aplicada', stSpecificEffectiveRate: 'a carga interna efetiva para ajustar a MVA',
  }
  for (const question of questions) {
    const value = selections[question.field]?.trim() ?? ''
    if (!value) {
      errors[question.field] = question.inputType === 'text' ? 'Registre a justificativa e o fundamento desta decisão.' : question.inputType === 'decimal'
        ? `Informe ${labels[question.field] ?? question.label}.${question.suggestedValue !== undefined ? ` Valor lido do XML: ${question.suggestedValue.replace('.', ',')}${question.field === 'entryBaseAmount' ? ' reais' : '%' }.` : ''}`
        : `Escolha uma resposta: ${question.label}`
    } else if (question.inputType === 'decimal') {
      const normalized = value.replace(',', '.')
      if (question.field === 'entryBaseAmount') {
        if (!/^\d+(?:\.\d+)?$/.test(normalized) || !Number.isFinite(Number(normalized))) errors[question.field] = 'Informe uma base em reais maior ou igual a zero, usando vírgula ou ponto para os decimais.'
        continue
      }
      const max = question.field === 'stMvaPercent' ? 1000 : 100
      if (!/^\d+(?:\.\d+)?$/.test(normalized) || !Number.isFinite(Number(normalized)) || Number(normalized) > max) {
        errors[question.field] = `Informe ${labels[question.field] ?? question.label} entre 0 e ${max}%, usando vírgula ou ponto para os decimais.`
      }
    }
  }
  if (selections.fcpStApplicableConfirmed === 'true' && selections.stInternalRateIncludesFcp === 'true'
    && selections.stInternalRate?.trim() && Number(selections.stInternalRate.replace(',', '.')) <= 2) {
    errors.stInternalRate = 'A alíquota total precisa ser maior que 2%, pois inclui os 2 pontos de FECOP. Para usar pICMSST do XML, marque que a alíquota não inclui FECOP.'
  }
  return errors
}
