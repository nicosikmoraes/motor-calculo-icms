/** Falhas estáveis da validação decimal e da memória de cálculo. */
export enum CalculationErrorCode {
  INVALID_DECIMAL = 'INVALID_DECIMAL',
  INVALID_DECIMAL_RESULT = 'INVALID_DECIMAL_RESULT',
  DECIMAL_PRECISION_EXCEEDED = 'DECIMAL_PRECISION_EXCEEDED',
  MISSING_PENDING_REASON = 'MISSING_PENDING_REASON',
}

/** Texto completo das falhas de cálculo. */
export enum CalculationErrorMessage {
  INVALID_DECIMAL = 'Valor decimal fiscal inválido ou acima do limite de precisão.',
  INVALID_DECIMAL_RESULT = 'Resultado decimal fiscal inválido.',
  DECIMAL_PRECISION_EXCEEDED = 'Resultado decimal fiscal acima do limite de precisão.',
  MISSING_PENDING_REASON = 'Uma pendência de cálculo precisa de motivo.',
}

export class CalculationError extends Error {
  constructor(readonly code: CalculationErrorCode) {
    super(CalculationErrorMessage[code])
    this.name = 'CalculationError'
  }
}
