import { describe, it, expect } from 'vitest'
import type { ItemFiscalContext } from '@motor/contracts'
import { changePurchaseDestination, invalidatePurchaseFactReview, purchaseHoldReason } from '../src/renderer/purchase-review-flow'

const context: ItemFiscalContext = { entryRateDifferenceAvailable: true, answers: {}, questions: [], xmlFacts: [],
  consumerDifalSuggestions: { operationAmount: '150.00', internalRate: '19.5', interstateRate: '12' },
  calculation: { status: 'PENDING_DATA', inputs: [], steps: [] } }

describe('decisões do fluxo de compra', () => {
  it('troca o uso e preenche valores disponíveis sem confirmar incidência ou base', () => {
    const answers = changePurchaseDestination({ destination: 'RESALE', entryMethod: 'ICMS_ST', stBuyerLiabilityConfirmed: 'true', stApplicableConfirmed: 'true', entryBaseConfirmed: 'true', entryApplicationConfirmed: 'true' }, 'OWN_USE', context)
    expect(answers).toMatchObject({ destination: 'OWN_USE', destinationBasis: 'CONFIRMED', entryMethod: 'CONSUMER_DIFAL', entryBaseAmount: '150.00', entryInternalRate: '19.5', entryInterstateRate: '12' })
    expect(answers.stApplicableConfirmed).toBeUndefined()
    expect(answers.stBuyerLiabilityConfirmed).toBeUndefined()
    expect(answers.entryApplicationConfirmed).toBeUndefined()
    expect(answers.entryBaseConfirmed).toBeUndefined()
  })
  it('não converte destinação desconhecida em revenda ou obrigação fiscal', () => {
    const answers = changePurchaseDestination({ destination: 'OWN_USE', destinationBasis: 'CONFIRMED', entryMethod: 'CONSUMER_DIFAL' }, 'UNKNOWN', context)
    expect(answers.purchaseDestinationUnknown).toBe('true')
    expect(answers.destination).toBeUndefined()
    expect(answers.entryMethod).toBeUndefined()
    expect(purchaseHoldReason(answers)).toContain('comprado')
  })
  it('não escolhe ST só porque a destinação é revenda nem sobre retenção anterior', () => {
    expect(changePurchaseDestination({}, 'RESALE', context).entryMethod).toBeUndefined()
    expect(changePurchaseDestination({}, 'OWN_USE', { ...context, entryAutomationReview: { category: 'PREVIOUS_ST', title: '', reason: '', nextAction: '' } }).entryMethod).toBeUndefined()
  })
  it('identifica descrição duvidosa e referência de pagamento ausente sem aprovar imposto', () => {
    expect(purchaseHoldReason({ destination: 'RESALE', purchaseProductConfirmation: 'DIFFERENT' })).toContain('classificação')
    expect(purchaseHoldReason({ destination: 'RESALE', purchasePaymentStatus: 'UNKNOWN' })).toContain('retenção anterior')
    expect(purchaseHoldReason({ destination: 'RESALE', purchasePaymentStatus: 'HAS_EVIDENCE' })).toContain('comprovante')
    expect(purchaseHoldReason({ destination: 'RESALE', purchasePaymentStatus: 'HAS_EVIDENCE', purchasePaymentReference: 'Guia para conferir' })).toBeUndefined()
  })
  it('exige nova conferência fiscal quando muda a descrição ou a informação de pagamento', () => {
    expect(invalidatePurchaseFactReview({ stClassificationConfirmed: 'true', stApplicableConfirmed: 'true', fcpStApplicableConfirmed: 'true', stInternalRate: '23' }, 'product')).toEqual({ stInternalRate: '23' })
    expect(invalidatePurchaseFactReview({ entryNoDebitConfirmed: 'true', entryNoDebitReason: 'Comprovante anterior', stBuyerLiabilityConfirmed: 'true', entryApplicationConfirmed: 'true' }, 'payment')).toEqual({ entryNoDebitReason: 'Comprovante anterior' })
  })
})
