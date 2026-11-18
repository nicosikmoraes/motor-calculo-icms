import type { AuthSession } from '@motor/contracts'
import { useAuthStore } from '../../stores/auth'

const DEFAULT_AFTER_SIGN_IN = '/apoio'

/** A interface usa a sessão para navegar. A API confere o token e o papel. */
export async function requireSession(to: { fullPath: string }): Promise<true | { path: string; query: { voltar: string } }> {
  return (await useAuthStore().refreshSession()) ? true : { path: '/entrar', query: { voltar: to.fullPath } }
}

export function requireRole(role: AuthSession['role']) {
  return async (to: { fullPath: string }): Promise<true | { path: string; query?: { voltar: string } }> => {
    const session = await useAuthStore().refreshSession()
    if (!session) return { path: '/entrar', query: { voltar: to.fullPath } }
    return session.role === role ? true : { path: '/' }
  }
}

export function afterSignIn(voltar: unknown): string {
  const path = Array.isArray(voltar) ? voltar[0] : voltar
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//') || path.toLowerCase().startsWith('/entrar')) return DEFAULT_AFTER_SIGN_IN
  return path
}

export function sessionExpiredRedirect(current: { fullPath: string; matched: ReadonlyArray<{ meta: Record<string, unknown> }> }):
  { path: string; query: { voltar: string; motivo: 'expirada' } } | null {
  if (!current.matched.some((record) => record.meta.requiresSession)) return null
  return { path: '/entrar', query: { voltar: current.fullPath, motivo: 'expirada' } }
}
