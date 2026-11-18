import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '@motor/contracts'
const state = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => any>(), window: {} as unknown,
  busy: false, database: vi.fn(), list: vi.fn(), save: vi.fn() }))
vi.mock('electron', () => ({ BrowserWindow: { fromWebContents: () => state.window },
  ipcMain: { handle: (id: string, fn: (...args: any[]) => any) => state.handlers.set(id, fn) } }))
vi.mock('../src/main/platform/sqlite/database-runtime', () => ({ activeDatabase: state.database }))
vi.mock('../src/main/platform/operations/batch-operations', () => ({ batchOperations: { get busy() { return state.busy } } }))
vi.mock('../src/main/modules/fiscal/adapters/sqlite/conflict-resolution-use-cases', () => ({ listDocumentConflicts: state.list, saveConflictResolution: state.save }))
import { registerConflictResolutionHandlers } from '../src/main/ipc/controllers/fiscal/conflict-resolution-controller'
const sender = { mainFrame: {} }, event = { sender, senderFrame: sender.mainFrame }
beforeEach(() => { vi.clearAllMocks(); state.handlers.clear(); state.window = {}; state.busy = false; registerConflictResolutionHandlers(state.handlers.set.bind(state.handlers)) })
describe('limites da ponte de resolução de conflitos', () => {
  it('rejeita subframes, janela ausente e importação em andamento antes de acessar o banco', () => {
    for (const channel of [IPC_CHANNELS.LIST_DOCUMENT_CONFLICTS, IPC_CHANNELS.SAVE_CONFLICT_RESOLUTION]) {
      const call = state.handlers.get(channel)!
      expect(() => call({ ...event, senderFrame: {} }, {})).toThrow('inválida')
      state.window = null; expect(() => call(event, {})).toThrow('inválida'); state.window = {}
      state.busy = true; expect(() => call(event, {})).toThrow('pause'); state.busy = false
    }
    expect(state.database).not.toHaveBeenCalled(); expect(state.save).not.toHaveBeenCalled()
  })
  it('encaminha solicitações válidas para o serviço de revisão', () => {
    const input = { action: 'ASSOCIATE' }, db = {}; state.database.mockReturnValue(db)
    state.handlers.get(IPC_CHANNELS.LIST_DOCUMENT_CONFLICTS)!(event)
    state.handlers.get(IPC_CHANNELS.SAVE_CONFLICT_RESOLUTION)!(event, input)
    expect(state.list).toHaveBeenCalledWith(db); expect(state.save).toHaveBeenCalledWith(db, input)
  })
})
