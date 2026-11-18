import { expect, it } from 'vitest'
import type { NormalizedNfe, NormalizedNfeItem } from '@motor/domain'
import { buildItemFiscalReviewContext } from '../src/main/modules/fiscal/domain/item-fiscal-context'

const buyer = '11222333000181'
const source = { format: 'NFE_XML_4_00' as const, xmlPath: 'NFe' }
const item: NormalizedNfeItem = Object.freeze({
  itemNumber: '1', cfop: '6102', ncm: '85163200', productAmount: '100.00', source,
  declaredIcms: { cst: '00', baseMode: '3', rate: '12', amount: '12.00' },
})
const note: NormalizedNfe = Object.freeze({
  kind: 'NFE', layoutVersion: '4.00', model: '55', accessKey: '1'.repeat(44),
  number: '1', series: '1', issuedAt: '2026-08-18T12:00:00-03:00',
  operationDirection: '1', purposeCode: '1', finalConsumerIndicator: '0',
  issuer: { state: 'SP', taxId: '11444777000161', taxIdType: 'CNPJ', taxRegimeCode: '3' },
  recipient: { state: 'PR', taxId: buyer, taxIdType: 'CNPJ', stateRegistrationIndicator: '1' },
  items: [item], declaredTotals: { freightAmount: '10.00', discountAmount: '4.00' }, source,
} satisfies NormalizedNfe)

it('monta sugestões a partir da nota e rateia encargos sem alterar o XML normalizado', () => {
  const context = buildItemFiscalReviewContext(note, item, undefined, undefined, undefined, buyer)

  expect(context.xmlFinalConsumerIndicator).toBe('0')
  expect(context.consumerDifalSuggestions).toMatchObject({ internalRate: '19.5', interstateRate: '12' })
  expect(Number(context.consumerDifalSuggestions?.operationAmount)).toBe(106)
  expect(item.freightAmount).toBeUndefined()
  expect(item.discountAmount).toBeUndefined()
})

it('respeita o bloqueio documental recebido e não oferece cálculo automático', () => {
  const context = buildItemFiscalReviewContext(note, item, undefined, undefined, 'Documento cancelado.', buyer)

  expect(context.blockedReason).toBe('Documento cancelado.')
  expect(context.calculation.status).toBe('UNSUPPORTED')
  expect(context.xmlCalculationAvailable).toBeUndefined()
  expect(context.entryClassificationPreview).toBeUndefined()
})
