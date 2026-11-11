import type { ItemFiscalContext, ItemFiscalAnswers } from '@motor/contracts'
import type { FiscalSelections } from './fiscal-review-validation'

export type PurchaseStep = 'purchase' | 'analysis' | 'apply'
export const PURCHASE_STEPS: readonly { id: PurchaseStep; label: string }[] = [
  { id: 'purchase', label: 'Sobre a compra' }, { id: 'analysis', label: 'Confira a análise' }, { id: 'apply', label: 'Aplicar e calcular' },
]
export const PURCHASE_DESTINATIONS = [
  { value: 'RESALE', label: 'Revender', description: 'Vender este produto a um cliente.' },
  { value: 'OWN_USE', label: 'Usar na empresa', description: 'Material utilizado ou consumido na atividade.' },
  { value: 'FIXED_ASSET', label: 'Equipamento ou bem da empresa', description: 'Um bem que ficará no patrimônio da empresa.' },
  { value: 'INDUSTRIALIZATION', label: 'Usar na fabricação', description: 'Transformar ou utilizar na produção de outro produto.' },
  { value: 'UNKNOWN', label: 'Não sei ainda', description: 'Guardar para decidir depois, sem concluir o imposto.' },
] as const

/** Mudar a destinação invalida as confirmações do tratamento anterior. */
export function changePurchaseDestination(selections: FiscalSelections, value: string, context: ItemFiscalContext): FiscalSelections {
  const next = { ...selections }
  delete next.destination
  delete next.destinationBasis
  delete next.destinationReviewReason
  for (const key of ['entryApplicationConfirmed', 'entryBaseConfirmed', 'entryNoDebitConfirmed', 'entryNoDebitReason',
    'stApplicableConfirmed', 'stBuyerLiabilityConfirmed', 'stMvaFallbackConfirmed', 'stSimpleDeductionConfirmed',
    'stClassificationConfirmed', 'stClassificationReason'] as const) delete next[key]
  next.purchaseReviewPending = 'false'
  delete next.purchaseReviewReason
  next.purchaseDestinationUnknown = String(value === 'UNKNOWN')
  if (value === 'UNKNOWN') { delete next.entryMethod; return next }
  next.destination = value
  next.destinationBasis = 'CONFIRMED'
  if (context.entryRateDifferenceAvailable) {
    if (context.entryAutomationReview?.category === 'PREVIOUS_ST') delete next.entryMethod
    else if (['OWN_USE', 'FIXED_ASSET'].includes(value)) {
      next.entryMethod = 'CONSUMER_DIFAL'
      next.entryBaseAmount = context.consumerDifalSuggestions?.operationAmount ?? ''
      next.entryInternalRate = context.consumerDifalSuggestions?.internalRate ?? ''
      next.entryInterstateRate = context.consumerDifalSuggestions?.interstateRate ?? ''
    } else if (context.entryClassificationPreview || context.stMvaReference?.status === 'FOUND') next.entryMethod = 'ICMS_ST'
    else delete next.entryMethod
  }
  return next
}

export function purchaseHoldReason(selections: FiscalSelections): string | undefined {
  if (selections.purchaseDestinationUnknown === 'true' || !selections.destination) return 'Falta confirmar para que o produto foi comprado.'
  if (selections.purchaseProductConfirmation === 'DIFFERENT') return 'O produto não corresponde à descrição sugerida. Revisar a classificação.'
  if (selections.purchaseProductConfirmation === 'UNKNOWN') return 'Falta conferir a descrição do produto e sua classificação.'
  if (selections.purchasePaymentStatus === 'UNKNOWN') return 'Falta conferir a retenção anterior e os comprovantes de recolhimento.'
  if (selections.purchasePaymentStatus === 'HAS_EVIDENCE' && !selections.purchasePaymentReference?.trim()) return 'Falta identificar o comprovante para a revisão fiscal.'
  return undefined
}

export function invalidatePurchaseFactReview(selections: FiscalSelections, fact: 'product' | 'payment'): FiscalSelections {
  const next = { ...selections }
  const fields = fact === 'product'
    ? ['stClassificationConfirmed', 'stApplicableConfirmed', 'fcpStApplicableConfirmed'] as const
    : ['stBuyerLiabilityConfirmed', 'entryApplicationConfirmed', 'entryNoDebitConfirmed'] as const
  for (const field of fields) delete next[field]
  return next
}

export const isPurchaseQuestion = (field: keyof ItemFiscalAnswers) => ['destination', 'destinationReviewReason'].includes(field)
export const purchaseDestinationLabel = (value?: string) => PURCHASE_DESTINATIONS.find(option => option.value === value)?.label ?? 'Ainda não informada'
