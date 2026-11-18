import { AppError, AppErrorCode } from '@motor/domain'

/** Valida o formato básico dos objetos recebidos pela ponte IPC. */
export function inputRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError(AppErrorCode.INVALID_IPC_INPUT)
  }
  return value as Record<string, unknown>
}

/** Rejeita textos obrigatórios vazios antes de chamar os repositórios. */
export function requiredInputText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new AppError(AppErrorCode.REQUIRED_FIELD, { field })
  return value.trim()
}
