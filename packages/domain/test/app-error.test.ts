import { describe, expect, it } from 'vitest'
import { AppError, AppErrorCode, AppErrorMessage, AppTypeError } from '../src/app-error'

describe('erros padronizados', () => {
  it('preserva código estável e substitui parâmetros no texto do enum', () => {
    const error = new AppError(AppErrorCode.REQUIRED_FIELD, { field: 'cnpj' })
    expect(error.code).toBe(AppErrorCode.REQUIRED_FIELD)
    expect(error.message).toBe(AppErrorMessage.REQUIRED_FIELD.replace('{field}', 'cnpj'))
  })

  it('mantém TypeError para limites de segurança inválidos', () => {
    const error = new AppTypeError(AppErrorCode.INVALID_XML_LIMIT, { name: 'maxDepth', value: 0 })
    expect(error).toBeInstanceOf(TypeError)
    expect(error.code).toBe(AppErrorCode.INVALID_XML_LIMIT)
  })
})
