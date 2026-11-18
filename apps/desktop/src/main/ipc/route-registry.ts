import { IPC_CHANNELS } from '@motor/contracts'
import type { IpcMainInvokeEvent } from 'electron'

type IpcChannel = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS]
type IpcEventChannel = typeof IPC_CHANNELS.AUTH_SESSION_EXPIRED | typeof IPC_CHANNELS.BATCH_PROGRESS

export type IpcRequestChannel = Exclude<IpcChannel, IpcEventChannel>
export type IpcRouteHandler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown
export type RegisterIpcRoute = (channel: IpcRequestChannel, handler: IpcRouteHandler) => void

const eventChannels: ReadonlySet<IpcChannel> = new Set([IPC_CHANNELS.AUTH_SESSION_EXPIRED, IPC_CHANNELS.BATCH_PROGRESS])
const requestChannels = new Set(Object.values(IPC_CHANNELS).filter((channel): channel is IpcRequestChannel => !eventChannels.has(channel)))

/** Registra somente os canais de solicitação declarados no contrato compartilhado. */
export function createIpcRouteRegistry(bind: RegisterIpcRoute) {
  const registered = new Set<IpcRequestChannel>()
  const register: RegisterIpcRoute = (channel, handler) => {
    if (!requestChannels.has(channel)) throw new Error(`Canal IPC de solicitação desconhecido: ${channel}`)
    if (registered.has(channel)) throw new Error(`Canal IPC duplicado: ${channel}`)
    bind(channel, handler)
    registered.add(channel)
  }

  return {
    register,
    assertComplete() {
      const missing = [...requestChannels].filter((channel) => !registered.has(channel))
      if (missing.length) throw new Error(`Canais IPC sem handler: ${missing.join(', ')}`)
    },
  }
}
