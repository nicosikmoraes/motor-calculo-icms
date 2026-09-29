import { describe, expect, it } from 'vitest'
import { AppErrorCode } from '../src/app-error'
import { assertExpectedRegistrationRevision, assertRegistrationRevision } from '../src/registration-operations'

describe('revisão dos cadastros', () => {
  it('aceita somente revisão inteira positiva', () => {
    expect(assertRegistrationRevision(2)).toBe(2)
    for (const value of [0, -1, 1.5, '2', null]) {
      expect(() => assertRegistrationRevision(value)).toThrowError(
        expect.objectContaining({ code: AppErrorCode.INVALID_REGISTRATION_REVISION }),
      )
    }
  })

  it('distingue versão desatualizada de entrada inválida', () => {
    expect(() => assertExpectedRegistrationRevision(3, 2)).toThrowError(
      expect.objectContaining({ code: AppErrorCode.REGISTRATION_REVISION_CONFLICT }),
    )
  })
})
