import { CalculationError, CalculationErrorCode } from './calculation-error'
import Decimal from 'decimal.js'

// Entradas fiscais chegam como texto. Este limite impede números desproporcionais
// e mantém adição e multiplicação exatas dentro da precisão configurada.
const DECIMAL_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/
const MAX_DIGITS = 40
const FiscalDecimal = Decimal.clone({ precision: 100, toExpNeg: -100, toExpPos: 100 })

export type FiscalDecimalText = string

function parse(value: string): Decimal {
  if (!DECIMAL_PATTERN.test(value) || value.replace(/\D/g, '').length > MAX_DIGITS) {
    throw new CalculationError(CalculationErrorCode.INVALID_DECIMAL)
  }
  return new FiscalDecimal(value)
}

function canonical(value: Decimal): FiscalDecimalText {
  if (!value.isFinite()) throw new CalculationError(CalculationErrorCode.INVALID_DECIMAL_RESULT)
  const result = value.toFixed()
  if (result.replace(/\D/g, '').length > MAX_DIGITS) {
    throw new CalculationError(CalculationErrorCode.DECIMAL_PRECISION_EXCEEDED)
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

/** Arredondamento monetário aprovado: por componente/item, HALF_UP. */
export function roundMoney(value: string): FiscalDecimalText {
  return parse(value).toDecimalPlaces(2, FiscalDecimal.ROUND_HALF_UP).toFixed(2)
}

export function compareDecimals(left: string, right: string): number {
  return parse(left).comparedTo(parse(right))
}
