import type { AuthSession } from '@motor/contracts'
import { desktopErrorMessage } from '../error-messages'

/**
 * Camada de serviço da conta. A tela não fala com a API nem vê o token:
 * o token mora no processo main, que o anexa a cada chamada.
 */

const DEFAULT_AFTER_SIGN_IN = '/apoio'

async function bridge<T>(call: () => Promise<T>, fallback: string): Promise<T> {
  try { return await call() }
  catch (cause) { throw new Error(desktopErrorMessage(cause, fallback)) }
}

export function signIn(email: string, password: string): Promise<AuthSession> {
  return bridge(() => window.desktopApi.signIn({ email, password }), 'Não foi possível entrar agora.')
}

export function registerAccount(email: string, password: string): Promise<AuthSession> {
  return bridge(() => window.desktopApi.registerAccount({ email, password }), 'Não foi possível criar a conta agora.')
}

export function signOut(): Promise<void> {
  return window.desktopApi.signOut()
}

export function currentSession(): Promise<AuthSession | null> {
  return window.desktopApi.getAuthSession()
}

export function onSessionExpired(listener: () => void): () => void {
  return window.desktopApi.onSessionExpired(listener)
}

/** Mesma regra da API (8 a 72 bytes em UTF-8), conferida antes de enviar para a mensagem sair na hora. */
export function passwordProblem(password: string): string | null {
  const bytes = new TextEncoder().encode(password).length
  if (bytes < 8) return 'A senha precisa ter pelo menos 8 caracteres.'
  if (bytes > 72) return 'A senha pode ter no máximo 72 caracteres (letras acentuadas contam como 2).'
  return null
}

/** Guarda das rotas que usam a API. Esconder a tela é conveniência; quem protege é o Guard do servidor. */
export async function requireSession(to: { fullPath: string }): Promise<true | { path: string; query: { voltar: string } }> {
  return (await currentSession()) ? true : { path: '/entrar', query: { voltar: to.fullPath } }
}

/** Para onde ir depois de entrar: só caminhos internos, nunca a própria tela de entrar. */
export function afterSignIn(voltar: unknown): string {
  const path = Array.isArray(voltar) ? voltar[0] : voltar
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.startsWith('/entrar')) return DEFAULT_AFTER_SIGN_IN
  return path
}
