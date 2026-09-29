import Decimal from 'decimal.js'

// Entradas fiscais chegam como texto. Este limite impede números desproporcionais
// e mantém adição e multiplicação exatas dentro da precisão configurada.
const DECIMAL_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/
const MAX_DIGITS = 40
const FiscalDecimal = Decimal.clone({ precision: 100, toExpNeg: -100, toExpPos: 100 })

export type FiscalDecimalText = string

function parse(value: string): Decimal {
  if (!DECIMAL_PATTERN.test(value) || value.replace(/\D/g, '').length > MAX_DIGITS) {
    throw new Error('Valor decimal fiscal inválido ou acima do limite de precisão.')
  }
  return new FiscalDecimal(value)
}

function canonical(value: Decimal): FiscalDecimalText {
  if (!value.isFinite()) throw new Error('Resultado decimal fiscal inválido.')
  const result = value.toFixed()
  if (result.replace(/\D/g, '').length > MAX_DIGITS) {
    throw new Error('Resultado decimal fiscal acima do limite de precisão.')
  }
  return result === '-0' ? '0' : result
}

export function decimalText(value: string): FiscalDecimalText {
  return canonical(parse(value))
}

export function addDecimals(...values: readonly string[]): FiscalDecimalText {
  return canonical(values.reduce<Decimal>((sum, value) => sum.plus(parse(value)), new FiscalDecimal(0)))
}

export function subtractDecimals(left: string, right: string): FiscalDecimalText {
  return canonical(parse(left).minus(parse(right)))
}

export function multiplyDecimals(left: string, right: string): FiscalDecimalText {
  return canonical(parse(left).times(parse(right)))
}
