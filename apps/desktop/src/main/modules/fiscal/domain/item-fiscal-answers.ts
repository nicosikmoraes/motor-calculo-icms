import type { ItemFiscalAnswers } from '@motor/contracts'
import { compareDecimals, decimalText, type CalculationMemory } from '@motor/tax-engine'

export const FISCAL_ANSWERS_INPUT_NAME = 'fiscalAnswers'

const boolFields = ['recipientIsIcmsTaxpayer', 'constructionCompany', 'petroleumOrFuel', 'ordinaryTaxTreatmentConfirmed', 'stApplicableConfirmed', 'stSupplierNormalConfirmed', 'fcpStApplicableConfirmed', 'stInternalRateIncludesFcp', 'stSpecificRuleConfirmed', 'stFuelArt50OperationBaseConfirmed', 'stFuelMonophaseConfirmed', 'stVehicleNewForResaleConfirmed', 'stVehicleMvaFallbackConfirmed', 'stVehicleImportedConfirmed', 'stVehicleImportPriceFloorConfirmed'] as const
const decimalFields = ['stMvaPercent', 'stInternalRate', 'stOwnOperationRate', 'stSpecificEffectiveRate', 'entryInternalRate', 'entryInterstateRate'] as const
const enums = {
  purchaseProductConfirmation: ['MATCHES', 'DIFFERENT', 'UNKNOWN'],
  purchasePaymentStatus: ['HAS_EVIDENCE', 'UNKNOWN'],
  entryMethod: ['RATE_DIFFERENCE', 'ICMS_ST', 'NO_DEBIT', 'CONSUMER_DIFAL'],
  stMvaMode: ['MANUAL_APPLIED', 'CATALOG_ORIGINAL', 'CATALOG_IMPORT_4', 'CATALOG_INTERSTATE', 'SPECIFIC_RULE'],
  stFuelCategory: ['PETROLEUM_NONINCIDENCE', 'SHALE_OIL', 'OTHER'],
  destination: ['RESALE', 'INDUSTRIALIZATION', 'FIXED_ASSET', 'OWN_USE'],
  destinationBasis: ['ASSUMED_RESALE', 'CONFIRMED'],
  discountTreatment: ['UNCONDITIONAL', 'CONDITIONAL'], ipiTreatment: ['INCLUDED', 'EXCLUDED'],
} as const

export function purchaseReviewRequired(answers: ItemFiscalAnswers): boolean {
  return answers.purchaseReviewPending === true || answers.purchaseDestinationUnknown === true
    || answers.purchasePaymentStatus === 'UNKNOWN' || answers.purchasePaymentStatus === 'HAS_EVIDENCE' && !answers.purchasePaymentReference?.trim()
    || ['DIFFERENT', 'UNKNOWN'].includes(answers.purchaseProductConfirmation ?? '')
}

/** Normaliza as respostas fiscais e valida sua consistência. */
export function validateItemFiscalAnswers(raw: unknown): ItemFiscalAnswers {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Respostas fiscais inválidas.')
  const source = raw as Record<string, unknown>
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(source).sort()) {
    const value = source[key]
    if (value === undefined) continue
    if (key === 'entryBaseAmount') {
      if (typeof value !== 'string') throw new Error('Informe uma base de antecipação válida em reais.')
      let normalized: string
      try { normalized = decimalText(value) } catch { throw new Error('Informe uma base de antecipação válida em reais.') }
      if (compareDecimals(normalized, '0') < 0) throw new Error('A base de antecipação não pode ser negativa.')
      result[key] = normalized; continue
    }
    if (key === 'entryNoDebitReason' || key === 'stClassificationReason' || key === 'destinationReviewReason' || key === 'purchaseReviewReason' || key === 'purchasePaymentReference') {
      if (typeof value !== 'string' || !value.trim() || value.trim().length > 1000) throw new Error('Informe uma justificativa de até 1000 caracteres para a decisão fiscal.')
      result[key] = value.trim(); continue
    }
    if (key === 'stCatalogRowId') {
      if (typeof value !== 'string' || !/^[A-Za-z0-9_.:/-]{1,150}$/.test(value)) throw new Error('Selecione uma referência válida do catálogo.')
      result[key] = value; continue
    }
    if ((boolFields as readonly string[]).includes(key) || ['purchaseReviewPending', 'purchaseDestinationUnknown', 'entryApplicationConfirmed', 'entryBaseConfirmed', 'entryNoDebitConfirmed', 'stBuyerLiabilityConfirmed', 'stMvaFallbackConfirmed', 'stSimpleDeductionConfirmed', 'stClassificationConfirmed'].includes(key)) {
      if (typeof value !== 'boolean') throw new Error('Escolha uma resposta válida.')
    } else if ((decimalFields as readonly string[]).includes(key)) {
      if (typeof value !== 'string') throw new Error('Informe um percentual válido.')
      let normalized: string
      try { normalized = decimalText(value) } catch { throw new Error('Informe um percentual válido.') }
      if (compareDecimals(normalized, '0') < 0 || compareDecimals(normalized, key === 'stMvaPercent' ? '1000' : '100') > 0) {
        throw new Error('O percentual está fora do limite permitido.')
      }
      result[key] = normalized
      continue
    } else if (Object.hasOwn(enums, key)) {
      if (typeof value !== 'string' || !(enums[key as keyof typeof enums] as readonly string[]).includes(value)) throw new Error('Escolha uma resposta válida.')
    } else throw new Error('Campo fiscal não permitido.')
    result[key] = value
  }
  if (result.destinationBasis === 'ASSUMED_RESALE' && result.destination !== 'RESALE') throw new Error('A premissa de revenda exige destinação RESALE.')
  if (result.purchaseDestinationUnknown === true && result.destination !== undefined) throw new Error('A destinação desconhecida não pode conter uma destinação confirmada.')
  return result as ItemFiscalAnswers
}

export function readItemFiscalAnswers(memory?: CalculationMemory): ItemFiscalAnswers {
  const text = memory?.inputs.find(entry => entry.name === FISCAL_ANSWERS_INPUT_NAME)?.value
  return text ? validateItemFiscalAnswers(JSON.parse(text)) : {}
}
