import { CalculationError, CalculationErrorCode } from './calculation-error'
export enum CalculationStatusCode {
  PENDING_RULE = 'PENDING_RULE',
  PENDING_DATA = 'PENDING_DATA',
  UNSUPPORTED = 'UNSUPPORTED',
  CALCULATED = 'CALCULATED',
}
export type CalculationStatus = `${CalculationStatusCode}`

export enum CalculationInputTreatmentCode {
  INCLUDED = 'INCLUDED',
  EXCLUDED = 'EXCLUDED',
  UNDECIDED = 'UNDECIDED',
}

export interface CalculationInput {
  name: string
  value?: string
  source: string
  treatment: `${CalculationInputTreatmentCode}`
  reason?: string
}

export interface CalculationStep {
  name: string
  operation: string
  inputs: Readonly<Record<string, string>>
  result: string
  rounding?: { scale: number; mode: string }
}

export interface CalculationMemory {
  comparisons?: readonly import('./declared-comparison').DeclaredComparison[]
  schemaVersion: 1
  status: CalculationStatus
  reason?: string
  rule?: { id: string; version: number; legalBasis: string }
  inputs: readonly CalculationInput[]
  steps: readonly CalculationStep[]
  result?: { base: string; rate: string; amount: string }
  declared?: { base?: string; rate?: string; amount?: string }
}

export function pendingCalculation(
  status: Exclude<CalculationStatus, `${CalculationStatusCode.CALCULATED}`>,
  reason: string,
  inputs: readonly CalculationInput[] = [],
  declared?: CalculationMemory['declared'],
): CalculationMemory {
  if (!reason.trim()) throw new CalculationError(CalculationErrorCode.MISSING_PENDING_REASON)
  return {
    schemaVersion: 1,
    status,
    reason,
    // A pendência preserva o texto original do XML; validação numérica ocorre
    // apenas quando houver uma regra fiscal aprovada para executar o cálculo.
    inputs: inputs.map((input) => ({ ...input })),
    steps: [],
    ...(declared ? { declared: {
      ...(declared.base !== undefined ? { base: declared.base } : {}),
      ...(declared.rate !== undefined ? { rate: declared.rate } : {}),
      ...(declared.amount !== undefined ? { amount: declared.amount } : {}),
    } } : {}),
  }
}
