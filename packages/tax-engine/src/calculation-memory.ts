export type CalculationStatus = 'PENDING_RULE' | 'PENDING_DATA' | 'UNSUPPORTED' | 'CALCULATED'

export interface CalculationInput {
  name: string
  value?: string
  source: string
  treatment: 'INCLUDED' | 'EXCLUDED' | 'UNDECIDED'
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
  status: Exclude<CalculationStatus, 'CALCULATED'>,
  reason: string,
  inputs: readonly CalculationInput[] = [],
  declared?: CalculationMemory['declared'],
): CalculationMemory {
  if (!reason.trim()) throw new Error('Uma pendência de cálculo precisa de motivo.')
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
