import { IPC_CHANNELS } from '@motor/contracts'
import type { createApiSession } from '../../../modules/accounts/adapters/http/api-session'
import { withApiAvailability } from '../../../modules/accounts/adapters/http/api-availability'
import type { RegisterIpcRoute } from '../../route-registry'

function credentials(raw: unknown): { email: string; password: string } {
  const input = (raw && typeof raw === 'object' ? raw : {}) as { email?: unknown; password?: unknown }
  if (typeof input.email !== 'string' || typeof input.password !== 'string' || input.email.length > 254 || input.password.length > 1024) {
    throw new Error('Informe um e-mail válido e a senha.')
  }
  return { email: input.email, password: input.password }
}

export function registerAccountRoutes(register: RegisterIpcRoute,
  session: Pick<ReturnType<typeof createApiSession>, 'register' | 'signIn' | 'signOut' | 'current'>): void {
  register(IPC_CHANNELS.AUTH_REGISTER, (_event, raw: unknown) => {
    const { email, password } = credentials(raw)
    return withApiAvailability(() => session.register(email, password))
  })
  register(IPC_CHANNELS.AUTH_SIGN_IN, (_event, raw: unknown) => {
    const { email, password } = credentials(raw)
    return withApiAvailability(() => session.signIn(email, password))
  })
  register(IPC_CHANNELS.AUTH_SIGN_OUT, () => { session.signOut() })
  register(IPC_CHANNELS.AUTH_GET_SESSION, () => session.current())
}
