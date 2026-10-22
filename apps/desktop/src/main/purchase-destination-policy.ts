import type { ItemFiscalAnswers } from '@motor/contracts'
import type { NormalizedNfe } from '@motor/domain'

export const RESALE_DEFAULT_NOTICE = 'Revenda presumida por orientação do usuário quando a destinação não estiver confirmada. A premissa não altera os dados do XML nem confirma o enquadramento tributário.'

/** Política solicitada pelo usuário; uma destinação informada sempre tem precedência. */
export function purchaseDestinationAnswers(nfe: NormalizedNfe, answers: ItemFiscalAnswers, companyCnpj?: string): ItemFiscalAnswers {
  const buyer=nfe.operationDirection === '0' ? nfe.issuer : nfe.recipient
  const supplier=nfe.operationDirection === '0' ? nfe.recipient : nfe.issuer
  const purchase = ['0','1'].includes(nfe.operationDirection ?? '') && buyer?.taxId === companyCnpj
    && Boolean(companyCnpj && supplier && supplier.taxId !== companyCnpj)
  return purchase && nfe.finalConsumerIndicator !== '1' && answers.destination === undefined
    ? Object.fromEntries(Object.entries({ ...answers, destination: 'RESALE', destinationBasis: 'ASSUMED_RESALE' }).sort(([a],[b])=>a<b?-1:a>b?1:0)) as ItemFiscalAnswers : answers
}
