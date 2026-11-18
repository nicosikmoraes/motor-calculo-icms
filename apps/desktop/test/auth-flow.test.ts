import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DesktopApi } from '@motor/contracts'
import { createPinia, setActivePinia } from 'pinia'
import { afterSignIn, requireRole, requireSession, sessionExpiredRedirect } from '../src/renderer/concerns/auth/navigation'
import { passwordProblem } from '../src/renderer/concerns/auth/password'
import { useAuthStore } from '../src/renderer/stores/auth'

const api = {
  signIn: vi.fn(), registerAccount: vi.fn(), signOut: vi.fn(), getAuthSession: vi.fn(), onSessionExpired: vi.fn(),
} as unknown as DesktopApi

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
  vi.stubGlobal('window', { desktopApi: api })
})
afterEach(() => vi.unstubAllGlobals())

describe('store de autenticação do renderer', () => {
  it('entra pela ponte e devolve só o e-mail; erros chegam sem o nome técnico do canal', async () => {
    vi.mocked(api.signIn).mockResolvedValueOnce({ email: 'ana@example.test', role: 'SUPPORTER' })
    await expect(useAuthStore().signIn('ana@example.test', 'senha-certa')).resolves.toEqual({ email: 'ana@example.test', role: 'SUPPORTER' })
    expect(api.signIn).toHaveBeenCalledWith({ email: 'ana@example.test', password: 'senha-certa' })

    vi.mocked(api.signIn).mockRejectedValueOnce(new Error("Error invoking remote method 'auth:sign-in': Error: E-mail ou senha inválidos"))
    await expect(useAuthStore().signIn('ana@example.test', 'errada')).rejects.toThrow(/^E-mail ou senha inválidos$/)
  })

  it('sair pede ao processo main para descartar o token', async () => {
    await useAuthStore().signOut()
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
    vi.mocked(api.getAuthSession).mockResolvedValueOnce({ email: 'ana@example.test', role: 'SUPPORTER' })
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

describe('US11: papel na tela', () => {
  it('o estado compartilhado da sessão acompanha entrar, consultar e sair', async () => {
    vi.mocked(api.signIn).mockResolvedValueOnce({ email: 'adm@example.test', role: 'ADMIN' })
    await useAuthStore().signIn('adm@example.test', 'senha-certa')
    expect(useAuthStore().session).toEqual({ email: 'adm@example.test', role: 'ADMIN' })
    await useAuthStore().signOut()
    expect(useAuthStore().session).toBeNull()
    vi.mocked(api.getAuthSession).mockResolvedValueOnce({ email: 'ana@example.test', role: 'SUPPORTER' })
    await useAuthStore().refreshSession()
    expect(useAuthStore().session).toEqual({ email: 'ana@example.test', role: 'SUPPORTER' })
  })

  it('CA9: o item "Doações recebidas" só aparece para ADMIN', async () => {
    const auth = useAuthStore()
    expect(auth.canSeeReceivedDonations).toBe(false)
    vi.mocked(api.getAuthSession).mockResolvedValueOnce({ email: 'adm@example.test', role: 'ADMIN' })
    await auth.refreshSession()
    expect(auth.canSeeReceivedDonations).toBe(true)
    vi.mocked(api.getAuthSession).mockResolvedValueOnce({ email: 'ana@example.test', role: 'SUPPORTER' })
    await auth.refreshSession()
    expect(auth.canSeeReceivedDonations).toBe(false)
  })

  it('descarta uma consulta de sessão que chega após a expiração', async () => {
    const auth = useAuthStore()
    const result = Promise.withResolvers<Awaited<ReturnType<DesktopApi['getAuthSession']>>>()
    vi.mocked(api.getAuthSession).mockReturnValueOnce(result.promise)
    const refresh = auth.refreshSession()
    auth.clearSession()
    result.resolve({ email: 'adm@example.test', role: 'ADMIN' })
    await expect(refresh).resolves.toBeNull()
    expect(auth.canSeeReceivedDonations).toBe(false)
  })

  it('a rota de administrador manda quem não entrou para entrar, e o apoiador para a visão geral', async () => {
    const guard = requireRole('ADMIN')
    vi.mocked(api.getAuthSession).mockResolvedValueOnce(null)
    await expect(guard({ fullPath: '/admin/doacoes' })).resolves.toEqual({ path: '/entrar', query: { voltar: '/admin/doacoes' } })
    vi.mocked(api.getAuthSession).mockResolvedValueOnce({ email: 'ana@example.test', role: 'SUPPORTER' })
    await expect(guard({ fullPath: '/admin/doacoes' })).resolves.toEqual({ path: '/' })
    vi.mocked(api.getAuthSession).mockResolvedValueOnce({ email: 'adm@example.test', role: 'ADMIN' })
    await expect(guard({ fullPath: '/admin/doacoes' })).resolves.toBe(true)
  })
})
