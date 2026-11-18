import { expect, it, vi } from 'vitest'
import { IPC_CHANNELS, type DesktopApi } from '@motor/contracts'

const bridge = vi.hoisted(() => ({
  api: null as DesktopApi | null,
  invoke: vi.fn().mockResolvedValue({ email: 'ana@example.test' }),
  on: vi.fn(),
  removeListener: vi.fn(),
}))
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: (_name: string, api: DesktopApi) => { bridge.api = api } },
  ipcRenderer: { invoke: bridge.invoke, on: bridge.on, removeListener: bridge.removeListener },
}))
import '../src/preload/index'

it('entrar e criar conta mandam só e-mail e senha, em dados clonáveis', async () => {
  const extra = { email: 'ana@example.test', password: 'senha-certa', role: 'ADMIN' } as never
  await bridge.api!.signIn(extra)
  expect(bridge.invoke).toHaveBeenLastCalledWith(IPC_CHANNELS.AUTH_SIGN_IN, { email: 'ana@example.test', password: 'senha-certa' })
  await bridge.api!.registerAccount(extra)
  expect(bridge.invoke).toHaveBeenLastCalledWith(IPC_CHANNELS.AUTH_REGISTER, { email: 'ana@example.test', password: 'senha-certa' })
  expect(() => structuredClone(bridge.invoke.mock.lastCall![1])).not.toThrow()
})

it('o aviso de sessão expirada pode ser assinado e cancelado', () => {
  const listener = vi.fn()
  const unsubscribe = bridge.api!.onSessionExpired(listener)
  const [channel, handler] = bridge.on.mock.lastCall!
  expect(channel).toBe(IPC_CHANNELS.AUTH_SESSION_EXPIRED)
  handler({})
  expect(listener).toHaveBeenCalledTimes(1)
  unsubscribe()
  expect(bridge.removeListener).toHaveBeenCalledWith(IPC_CHANNELS.AUTH_SESSION_EXPIRED, handler)
})
