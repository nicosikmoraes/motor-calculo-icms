import { decimalText } from './decimal'

export interface AllocationItem { itemNumber: string; productAmount?: string; declaredAmount?: string }
export interface AllocationResult {
  itemNumber: string
  amount: string
  source: 'XML_ITEM' | 'ALLOCATED' | 'ABSENT'
}

function moneyCents(value: string): bigint {
  const canonical = decimalText(value)
  const [whole = '', fraction = ''] = canonical.split('.')
  if (canonical.startsWith('-') || fraction.length > 2) throw new Error('O rateio exige valores monetários não negativos com até duas casas decimais.')
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
}
function money(value: bigint): string { return `${value / 100n}.${String(value % 100n).padStart(2, '0')}` }

/** Preserva campos explícitos (inclusive zero); distribui somente o saldo entre campos ausentes. */
export function allocateProportionally(total: string | undefined, items: readonly AllocationItem[]): readonly AllocationResult[] {
  if (new Set(items.map(item => item.itemNumber)).size !== items.length || items.some(item => !/^[1-9]\d*$/.test(item.itemNumber))) {
    throw new Error('O rateio exige números de item únicos e positivos.')
  }
  const known = items.map(item => item.declaredAmount === undefined ? undefined : moneyCents(item.declaredAmount))
  if (total === undefined) return items.map((item, index) => ({ itemNumber: item.itemNumber,
    amount: money(known[index] ?? 0n), source: known[index] === undefined ? 'ABSENT' : 'XML_ITEM' }))
  const remaining = moneyCents(total) - known.reduce<bigint>((sum, value) => sum + (value ?? 0n), 0n)
  if (remaining < 0n) throw new Error('A soma dos itens excede o total da nota. Revise os valores antes de ratear.')
  const missing = items.map((item, index) => ({ item, index })).filter(entry => known[entry.index] === undefined)
  if (remaining > 0n && !missing.length) throw new Error('Os valores já distribuídos nos itens não fecham o total da nota.')
  const allocated = new Map<number, bigint>()
  if (remaining > 0n) {
    const decimals = missing.map(({ item }) => {
      if (item.productAmount === undefined) throw new Error('Informe o valor dos produtos antes do rateio.')
      const text = decimalText(item.productAmount)
      if (text.startsWith('-')) throw new Error('Produto com valor negativo impede o rateio.')
      return text.split('.')
    })
    const scale = Math.max(...decimals.map(parts => parts[1]?.length ?? 0))
    const weights = decimals.map(parts => BigInt(parts[0]! + (parts[1] ?? '').padEnd(scale, '0')))
    const sum = weights.reduce((value, weight) => value + weight, 0n)
    if (sum === 0n) throw new Error('Produtos sem valor positivo não permitem rateio proporcional.')
    const remainders = missing.map((entry, index) => {
      const numerator = remaining * weights[index]!
      allocated.set(entry.index, numerator / sum)
      return { ...entry, remainder: numerator % sum }
    }).sort((a, b) => a.remainder === b.remainder
      ? BigInt(a.item.itemNumber) < BigInt(b.item.itemNumber) ? -1 : 1
      : a.remainder > b.remainder ? -1 : 1)
    const cents = remaining - [...allocated.values()].reduce((sum, value) => sum + value, 0n)
    for (let index = 0; BigInt(index) < cents; index++) {
      const entry = remainders[index]!
      allocated.set(entry.index, allocated.get(entry.index)! + 1n)
    }
  }
  return items.map((item, index) => ({ itemNumber: item.itemNumber, amount: money(known[index] ?? allocated.get(index) ?? 0n),
    source: known[index] !== undefined ? 'XML_ITEM' : allocated.has(index) ? 'ALLOCATED' : 'ABSENT' }))
}
