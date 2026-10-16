import { expect, it, vi } from 'vitest'
import { IPC_CHANNELS, type DesktopApi } from '@motor/contracts'

const bridge = vi.hoisted(() => ({ api: null as DesktopApi | null, invoke: vi.fn().mockResolvedValue({}) }))
vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: (_name: string, api: DesktopApi) => { bridge.api = api } },
  ipcRenderer: { invoke: bridge.invoke, on: vi.fn(), removeListener: vi.fn() },
}))
import '../src/preload/index'

it.each(['XML', 'AUTOMATIC'] as const)('envia o modo %s pelo preload real, com os dados e a execução anterior preservados', async calculationMode => {
  await bridge.api!.saveItemFiscalAnswers({ batchId: 'batch', documentId: 'document', itemNumber: '1',
    requestId: 'request', expectedRunId: 'previous', calculationMode, answers: {} })
  expect(bridge.invoke).toHaveBeenLastCalledWith(IPC_CHANNELS.SAVE_ITEM_FISCAL_ANSWERS,
    expect.objectContaining({ batchId: 'batch', documentId: 'document', itemNumber: '1', requestId: 'request',
      expectedRunId: 'previous', calculationMode, answers: {} }))
  expect(() => structuredClone(bridge.invoke.mock.lastCall![1])).not.toThrow()
})
