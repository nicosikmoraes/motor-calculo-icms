import type { NormalizedNfe, NormalizedNfeItem } from '@motor/domain'
import { addDecimals, allocateProportionally, compareDecimals, subtractDecimals, type CalculationMemory } from '@motor/tax-engine'

export function positive(value?: string): boolean { return value !== undefined && compareDecimals(value, '0') > 0 }

export const allocatedFields = ['freightAmount', 'insuranceAmount', 'discountAmount', 'otherAmount'] as const
const allocationLabels = { freightAmount: 'Frete', insuranceAmount: 'Seguro', discountAmount: 'Desconto', otherAmount: 'Outras despesas' }
// Documentos normalizados são fotografias imutáveis; cache evita ratear novamente por item.
const allocationCache = new WeakMap<NormalizedNfe, Map<string, { item: NormalizedNfeItem; steps: CalculationMemory['steps'] }>>()
export function allocatedDocument(nfe: NormalizedNfe) {
  const cached = allocationCache.get(nfe)
  if (cached) return cached
  const included = nfe.items.filter(item => item.includedInDocumentTotal !== false)
  if (included.length !== nfe.items.length && allocatedFields.some(field => positive(nfe.declaredTotals[field]))) {
    throw new Error('A nota contém itens excluídos do total. Confira a composição dos encargos antes do rateio.')
  }
  const result = new Map(nfe.items.map(item => [item.itemNumber, { item: { ...item }, steps: [] as CalculationMemory['steps'] }]))
  for (const field of allocatedFields) {
    const values = allocateProportionally(nfe.declaredTotals[field], included.map(item => ({ itemNumber: item.itemNumber,
      ...(item.productAmount !== undefined ? { productAmount: item.productAmount } : {}),
      ...(item[field] !== undefined ? { declaredAmount: item[field] } : {}),
    })))
    const balance = values.some(value => value.source === 'ALLOCATED')
      ? subtractDecimals(nfe.declaredTotals[field]!, addDecimals(...included.map(item => item[field] ?? '0'))) : '0'
    const weightTotal = values.some(value => value.source === 'ALLOCATED')
      ? addDecimals(...included.filter(item => item[field] === undefined).map(item => item.productAmount!)) : '0'
    for (const value of values) {
      const entry = result.get(value.itemNumber)!
      entry.item[field] = value.amount
      if (value.source === 'ALLOCATED') entry.steps = [...entry.steps, {
        name: `Rateio de ${allocationLabels[field]}`, operation: 'saldo do total proporcional ao valor dos produtos sem distribuição; maiores restos; desempate pelo número do item',
        inputs: { total: nfe.declaredTotals[field]!, productAmount: entry.item.productAmount!, allocatedAmount: value.amount,
          field, balance, weightTotal, method: 'LARGEST_REMAINDER_CENTS' }, result: value.amount, rounding: { scale: 2, mode: 'LARGEST_REMAINDER' },
      }]
    }
  }
  // IPI é tributo específico por produto: divergência não autoriza rateá-lo como despesa.
  if (nfe.declaredTotals.ipiAmount !== undefined && compareDecimals(nfe.declaredTotals.ipiAmount,
    addDecimals(...included.map(item => item.ipiAmount ?? '0'))) !== 0) throw new Error('O IPI total não reconcilia com os itens; revise o tributo antes do cálculo.')
  allocationCache.set(nfe, result)
  return result
}
