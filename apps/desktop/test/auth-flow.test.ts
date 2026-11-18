import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DesktopApi } from '@motor/contracts'
import { afterSignIn, passwordProblem, requireSession, sessionExpiredRedirect, signIn, signOut } from '../src/renderer/services/auth'

const api = {
  signIn: vi.fn(), registerAccount: vi.fn(), signOut: vi.fn(), getAuthSession: vi.fn(), onSessionExpired: vi.fn(),
} as unknown as DesktopApi

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('window', { desktopApi: api })
})
afterEach(() => vi.unstubAllGlobals())

describe('camada de serviço de autenticação da tela', () => {
  it('entra pela ponte e devolve só o e-mail; erros chegam sem o nome técnico do canal', async () => {
    vi.mocked(api.signIn).mockResolvedValueOnce({ email: 'ana@example.test' })
    await expect(signIn('ana@example.test', 'senha-certa')).resolves.toEqual({ email: 'ana@example.test' })
    expect(api.signIn).toHaveBeenCalledWith({ email: 'ana@example.test', password: 'senha-certa' })

    vi.mocked(api.signIn).mockRejectedValueOnce(new Error("Error invoking remote method 'auth:sign-in': Error: E-mail ou senha inválidos"))
    await expect(signIn('ana@example.test', 'errada')).rejects.toThrow(/^E-mail ou senha inválidos$/)
  })

  it('sair pede ao processo main para descartar o token', async () => {
    await signOut()
    expect(api.signOut).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['1234567', 'A senha precisa ter pelo menos 8 caracteres.'],
    ['a'.repeat(73), 'A senha pode ter no máximo 72 caracteres (letras acentuadas contam como 2).'],
    ['ç'.repeat(37), 'A senha pode ter no máximo 72 caracteres (letras acentuadas contam como 2).'],
    ['senha-boa', null],
    ['a'.repeat(72), null],
  ])('confere a senha do cadastro antes de enviar (%s)', (password, problem) => {
    expect(passwordProblem(password)).toBe(problem)
  })
})

describe('CA12: "Apoiar o projeto" exige conta; o resto do aplicativo, não', () => {
  it('sem sessão manda para a tela de entrar, guardando para onde voltar', async () => {
    vi.mocked(api.getAuthSession).mockResolvedValueOnce(null)
    await expect(requireSession({ fullPath: '/apoio' })).resolves.toEqual({ path: '/entrar', query: { voltar: '/apoio' } })
  })

  it('com sessão deixa entrar', async () => {
    vi.mocked(api.getAuthSession).mockResolvedValueOnce({ email: 'ana@example.test' })
    await expect(requireSession({ fullPath: '/apoio' })).resolves.toBe(true)
  })

  it('depois de entrar volta só para caminhos internos do aplicativo', () => {
    expect(afterSignIn('/apoio')).toBe('/apoio')
    expect(afterSignIn(undefined)).toBe('/apoio')
    expect(afterSignIn(['/apoio'])).toBe('/apoio')
    expect(afterSignIn('https://exemplo.test')).toBe('/apoio')
    expect(afterSignIn('//exemplo.test')).toBe('/apoio')
    expect(afterSignIn('/entrar')).toBe('/apoio')
    expect(afterSignIn('/Entrar?voltar=/apoio')).toBe('/apoio')
  })
})

describe('CA14: sessão expirada', () => {
  it('em /apoio, volta para entrar com o aviso e o caminho de volta', () => {
    expect(sessionExpiredRedirect({ fullPath: '/apoio', matched: [{ meta: { requiresSession: true } }] }))
      .toEqual({ path: '/entrar', query: { voltar: '/apoio', motivo: 'expirada' } })
  })

  it('numa tela fiscal, não interrompe quem está trabalhando', () => {
    expect(sessionExpiredRedirect({ fullPath: '/empresas', matched: [{ meta: {} }] })).toBeNull()
  })
})
