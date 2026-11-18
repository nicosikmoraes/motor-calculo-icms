import type { AuthSession } from '@motor/contracts'

/**
 * Sessão com a API do ContabiliNico, no processo main.
 *
 * O token mora só aqui, numa variável em memória: nunca vai para o renderer (onde um
 * XSS o leria) nem para disco. Fechar o aplicativo encerra a sessão. É também o único
 * lugar que anexa `Authorization: Bearer` e que reage a um 401 no meio do uso.
 */

export const SESSION_EXPIRED_MESSAGE = 'Sua sessão expirou. Entre de novo.'
export const SIGNED_OUT_MESSAGE = 'Entre na sua conta para continuar.'

export interface ApiResponse {
  status: number
  body: unknown
}

export interface ApiSessionOptions {
  baseUrl: () => URL
  onExpired: () => void
  fetchImpl?: typeof fetch
}

type Envelope = { data?: Record<string, unknown>; error?: { message?: unknown } } | null

export function createApiSession({ baseUrl, onExpired, fetchImpl = fetch }: ApiSessionOptions) {
  let token: string | null = null
  let session: AuthSession | null = null

  async function send(path: string, init: RequestInit, bearer: string | null): Promise<ApiResponse> {
    const headers = new Headers(init.headers)
    if (bearer) headers.set('Authorization', `Bearer ${bearer}`)
    const response = await fetchImpl(new URL(path, baseUrl()), { ...init, headers })
    let body: unknown = null
    try { body = await response.json() } catch { /* Corpo vazio ou não JSON: não propague o texto bruto. */ }
    return { status: response.status, body }
  }

  function clear(): void {
    token = null
    session = null
  }

  /** Toda chamada autenticada passa por aqui. */
  async function request(path: string, init: RequestInit): Promise<ApiResponse> {
    const sentWith = token
    if (!sentWith) throw new Error(SIGNED_OUT_MESSAGE)
    const response = await send(path, init, sentWith)
    if (response.status === 401) {
      // Só derruba a sessão se o token recusado ainda é o atual (um login novo pode ter chegado no meio).
      if (token === sentWith) {
        clear()
        onExpired()
      }
      throw new Error(SESSION_EXPIRED_MESSAGE)
    }
    return response
  }

  function apiMessage(body: unknown, fallback: string): string {
    const message = (body as Envelope)?.error?.message
    return typeof message === 'string' ? message : fallback
  }

  async function signIn(email: string, password: string): Promise<AuthSession> {
    const login = await send('/auth/login', jsonPost({ email, password }), null)
    if (login.status !== 200) throw new Error(login.status === 401 ? apiMessage(login.body, 'E-mail ou senha inválidos')
      : login.status === 400 ? 'Informe um e-mail válido e a senha.' : 'Não foi possível entrar agora. Tente novamente mais tarde.')
    // A API embrulha toda resposta em { data }: o token está lá dentro, não na raiz.
    const accessToken = (login.body as Envelope)?.data?.accessToken
    if (typeof accessToken !== 'string' || !accessToken) throw new Error('Não foi possível entrar agora. Tente novamente mais tarde.')

    // Confirma o token novo antes de adotá-lo: até aqui, a sessão anterior (se houver) continua intacta,
    // e uma falha no meio do login não deixa token de uma pessoa com o nome de outra, nem vira "sessão expirada".
    const me = await send('/auth/me', {}, accessToken)
    const confirmed = (me.body as Envelope)?.data
    const confirmedEmail = confirmed?.email
    const role = confirmed?.role
    if (me.status !== 200 || typeof confirmedEmail !== 'string' || (role !== 'SUPPORTER' && role !== 'ADMIN')) {
      throw new Error('Não foi possível entrar agora. Tente novamente mais tarde.')
    }
    token = accessToken
    session = { email: confirmedEmail, role }
    return { ...session }
  }

  async function register(email: string, password: string): Promise<AuthSession> {
    const created = await send('/auth/register', jsonPost({ email, password }), null)
    if (created.status === 409) throw new Error('Já existe uma conta com este e-mail. Entre com ela.')
    if (created.status === 400) throw new Error('Use um e-mail válido e uma senha de 8 a 72 caracteres (letras acentuadas contam como 2).')
    if (created.status !== 201) throw new Error('Não foi possível criar a conta agora. Tente novamente mais tarde.')
    return signIn(email, password)
  }

  return {
    request,
    signIn,
    register,
    signOut: clear,
    current: (): AuthSession | null => (session ? { ...session } : null),
  }
}

export type ApiSession = ReturnType<typeof createApiSession>

function jsonPost(body: unknown): RequestInit {
  return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}
