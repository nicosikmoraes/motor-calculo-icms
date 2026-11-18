import { ref } from 'vue'
import type { AuthSession } from '@motor/contracts'
import { desktopErrorMessage } from '../error-messages'

/**
 * Camada de serviço da conta. A tela não fala com a API nem vê o token:
 * o token mora no processo main, que o anexa a cada chamada.
 */

const DEFAULT_AFTER_SIGN_IN = '/apoio'

/** Quem está conectado, para o menu e as telas reagirem. Só e-mail e papel: o token fica no processo main. */
export const authSession = ref<AuthSession | null>(null)

function remember(session: AuthSession | null): AuthSession | null {
  authSession.value = session ? { email: session.email, role: session.role } : null
  return session
}

async function bridge<T>(call: () => Promise<T>, fallback: string): Promise<T> {
  try { return await call() }
  catch (cause) { throw new Error(desktopErrorMessage(cause, fallback)) }
}

export async function signIn(email: string, password: string): Promise<AuthSession> {
  return remember(await bridge(() => window.desktopApi.signIn({ email, password }), 'Não foi possível entrar agora.')) as AuthSession
}

export async function registerAccount(email: string, password: string): Promise<AuthSession> {
  return remember(await bridge(() => window.desktopApi.registerAccount({ email, password }), 'Não foi possível criar a conta agora.')) as AuthSession
}

export async function signOut(): Promise<void> {
  await window.desktopApi.signOut()
  remember(null)
}

export async function currentSession(): Promise<AuthSession | null> {
  return remember(await window.desktopApi.getAuthSession())
}

/** O que a pessoa não pode fazer, ela não vê. Esconder é conveniência; quem protege é o RolesGuard da API. */
export function canSeeReceivedDonations(session: AuthSession | null): boolean {
  return session?.role === 'ADMIN'
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

/** Guarda das rotas que exigem um papel: sem sessão vai para entrar; com outro papel, para a visão geral. */
export function requireRole(role: AuthSession['role']) {
  return async (to: { fullPath: string }): Promise<true | { path: string; query?: { voltar: string } }> => {
    const session = await currentSession()
    if (!session) return { path: '/entrar', query: { voltar: to.fullPath } }
    return session.role === role ? true : { path: '/' }
  }
}

/** Para onde ir depois de entrar: só caminhos internos, nunca a própria tela de entrar. */
export function afterSignIn(voltar: unknown): string {
  const path = Array.isArray(voltar) ? voltar[0] : voltar
  // O vue-router não diferencia maiúsculas: "/Entrar" também é a tela de entrar.
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.toLowerCase().startsWith('/entrar')) return DEFAULT_AFTER_SIGN_IN
  return path
}

/** Para onde levar a pessoa quando a sessão expira: só sai da tela atual se ela exige sessão. */
export function sessionExpiredRedirect(current: { fullPath: string; matched: ReadonlyArray<{ meta: Record<string, unknown> }> }):
  { path: string; query: { voltar: string; motivo: 'expirada' } } | null {
  if (!current.matched.some((record) => record.meta.requiresSession)) return null
  return { path: '/entrar', query: { voltar: current.fullPath, motivo: 'expirada' } }
}
