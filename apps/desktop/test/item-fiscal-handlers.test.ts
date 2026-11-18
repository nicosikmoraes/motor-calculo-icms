import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '@motor/contracts'
const state=vi.hoisted(()=>({handlers:new Map<string,(...args:any[])=>any>(),save:vi.fn(),db:{}}))
vi.mock('electron',()=>({ipcMain:{handle:(channel:string,handler:(...args:any[])=>any)=>state.handlers.set(channel,handler)}}))
vi.mock('../src/main/platform/sqlite/database-runtime', () => ({ activeDatabase: () => state.db }))
vi.mock('../src/main/platform/operations/batch-operations', () => ({ batchOperations: { busy: false } }))
vi.mock('../src/main/modules/fiscal/adapters/sqlite/item-fiscal-use-cases',()=>({applyReusableFiscalAnswers:vi.fn(),getItemFiscalContext:vi.fn(),saveItemFiscalAnswers:state.save}))
import { registerItemFiscalHandlers } from '../src/main/ipc/controllers/fiscal/item-fiscal-controller'
const input={batchId:'batch',documentId:'document',itemNumber:'1',requestId:'request',answers:{}}
beforeEach(()=>{vi.clearAllMocks();state.handlers.clear();registerItemFiscalHandlers(state.handlers.set.bind(state.handlers))})
describe('confirmação final pela ponte do cálculo',()=>{
 it.each([true,false])('encaminha a exigência de conclusão %s ao serviço',requireCalculated=>{
  state.handlers.get(IPC_CHANNELS.SAVE_ITEM_FISCAL_ANSWERS)!({}, {...input,requireCalculated})
  expect(state.save).toHaveBeenCalledWith(state.db,expect.objectContaining({requireCalculated}))
 })
 it('rejeita uma exigência de conclusão que não seja booleana',()=>{
  expect(()=>state.handlers.get(IPC_CHANNELS.SAVE_ITEM_FISCAL_ANSWERS)!({}, {...input,requireCalculated:'true'})).toThrow('Confirmação de cálculo inválida.')
  expect(state.save).not.toHaveBeenCalled()
 })
})
