import { AppError, AppErrorCode } from './app-error'

/** Identificadores estáveis para os cadastros sujeitos a revisão e auditoria. */
export enum RegistrationEntityCode {
  ORGANIZATION = 'ORGANIZATION',
  COMPANY = 'COMPANY',
  FISCAL_PROFILE = 'FISCAL_PROFILE',
  SUPPLIER_PRODUCT = 'SUPPLIER_PRODUCT',
}

/** Operações que a futura trilha de auditoria registrará após sucesso. */
export enum RegistrationOperationCode {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  INACTIVATE = 'INACTIVATE',
  REACTIVATE = 'REACTIVATE',
}

/** Revisões são inteiros positivos; o banco atribuirá a nova revisão na escrita. */
export type RegistrationRevision = number

export function assertRegistrationRevision(value: unknown): RegistrationRevision {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1) {
    throw new AppError(AppErrorCode.INVALID_REGISTRATION_REVISION)
  }
  return value
}

export function assertExpectedRegistrationRevision(actual: number, expected: unknown): void {
  if (assertRegistrationRevision(actual) !== assertRegistrationRevision(expected)) {
    throw new AppError(AppErrorCode.REGISTRATION_REVISION_CONFLICT)
  }
}
