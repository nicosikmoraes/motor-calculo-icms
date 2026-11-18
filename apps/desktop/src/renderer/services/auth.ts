import type { AuthSession } from '@motor/contracts'
import { desktopErrorMessage } from '../concerns/ipc/error-messages'

/**
 * Camada de serviço da conta. A tela não fala com a API nem vê o token:
 * o token mora no processo main, que o anexa a cada chamada.
 */

async function bridge<T>(call: () => Promise<T>, fallback: string): Promise<T> {
  try { return await call() }
  catch (cause) { throw new Error(desktopErrorMessage(cause, fallback)) }
}

export async function signIn(email: string, password: string): Promise<AuthSession> {
  return bridge(() => window.desktopApi.signIn({ email, password }), 'Não foi possível entrar agora.')
}

export async function registerAccount(email: string, password: string): Promise<AuthSession> {
  return bridge(() => window.desktopApi.registerAccount({ email, password }), 'Não foi possível criar a conta agora.')
}

export async function signOut(): Promise<void> {
  await window.desktopApi.signOut()
}

export async function currentSession(): Promise<AuthSession | null> {
  return window.desktopApi.getAuthSession()
}

export function onSessionExpired(listener: () => void): () => void {
  return window.desktopApi.onSessionExpired(listener)
}
