import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { IPC_CHANNELS } from '@motor/contracts'
import type { IpcMainInvokeEvent } from 'electron'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createIpcRouteRegistry, type IpcRouteHandler } from '../src/main/ipc/route-registry'

const state = vi.hoisted(() => ({ root: '', handlers: new Map<string, IpcRouteHandler>() }))
vi.mock('electron', () => ({
  app: { getPath: () => state.root, getVersion: () => 'test' },
  ipcMain: { handle: (channel: string, handler: IpcRouteHandler) => state.handlers.set(channel, handler) },
  BrowserWindow: {}, dialog: {}, shell: {},
}))

import { registerIpcRoutes } from '../src/main/ipc/routes'
import { stopBackups } from '../src/main/modules/backup/adapters/backup-runtime'
import { closeDatabase, openDatabase } from '../src/main/platform/sqlite/database-runtime'

afterEach(async () => {
  await stopBackups()
  closeDatabase()
  if (state.root) await rm(state.root, { recursive: true, force: true })
  state.root = ''
  state.handlers.clear()
})

describe('registro de rotas IPC', () => {
  it('registra todas as solicitações uma vez e executa o cadastro pela rota até o SQLite', async () => {
    state.root = await mkdtemp(join(tmpdir(), 'contabilinico-ipc-'))
    await openDatabase()
    await registerIpcRoutes(() => undefined)

    const events = [IPC_CHANNELS.AUTH_SESSION_EXPIRED, IPC_CHANNELS.BATCH_PROGRESS]
    const requests = Object.values(IPC_CHANNELS).filter((channel) => !events.some((event) => event === channel))
    expect([...state.handlers.keys()].sort()).toEqual(requests.sort())

    const event = {} as IpcMainInvokeEvent
    state.handlers.get(IPC_CHANNELS.CREATE_ORGANIZATION)!(event, { name: 'Escritório de teste' })
    const company = state.handlers.get(IPC_CHANNELS.CREATE_COMPANY)!(event, {
      legalName: 'Empresa de teste', cnpj: '11222333000181', state: 'PR',
    })
    expect(company).toMatchObject({ legalName: 'Empresa de teste', cnpj: '11222333000181', state: 'PR', active: true })
    expect(state.handlers.get(IPC_CHANNELS.GET_WORKSPACE)!(event)).toMatchObject({ companies: [company] })
  })

  it('rejeita duplicatas e detecta rotas faltantes', () => {
    const registry = createIpcRouteRegistry(vi.fn())
    registry.register(IPC_CHANNELS.APP_VERSION, () => 'test')
    expect(() => registry.register(IPC_CHANNELS.APP_VERSION, () => 'again')).toThrow('Canal IPC duplicado')
    expect(() => registry.assertComplete()).toThrow('Canais IPC sem handler')
  })
})
