import { compareDecimals, decimalText, roundMoney, type CalculationComponentMemory } from '@motor/tax-engine'

/** Mantém a precisão da antecipação até a soma, conforme a planilha de apuração. */
export function exactEntryAmount(memory: CalculationComponentMemory | undefined): string | undefined {
  if (!memory?.result) return undefined
  if (memory.rule?.id !== 'PR_ENTRY_RATE_DIFFERENCE') return memory.result.amount
  const exact = memory.steps.find(step => step.name === 'Diferencial de entrada')?.inputs.exactAmount
  if (exact === undefined) return undefined
  try {
    return compareDecimals(exact, '0') >= 0 && roundMoney(exact) === roundMoney(memory.result.amount) ? decimalText(exact) : undefined
  } catch { return undefined }
}
