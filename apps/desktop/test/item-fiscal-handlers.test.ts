import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '@motor/contracts'
const state=vi.hoisted(()=>({handlers:new Map<string,(...args:any[])=>any>(),save:vi.fn(),db:{}}))
vi.mock('electron',()=>({ipcMain:{handle:(channel:string,handler:(...args:any[])=>any)=>state.handlers.set(channel,handler)}}))
vi.mock('../src/main/main-services',()=>({activeDatabase:()=>state.db,batchOperations:{busy:false},inputRecord:(value:unknown)=>value,requiredInputText:(value:unknown)=>{if(typeof value!=='string'||!value)throw new Error('Texto inválido.');return value}}))
vi.mock('../src/main/item-fiscal-use-cases',()=>({applyReusableFiscalAnswers:vi.fn(),getItemFiscalContext:vi.fn(),saveItemFiscalAnswers:state.save,validateItemFiscalAnswers:(value:unknown)=>value}))
import { registerItemFiscalHandlers } from '../src/main/item-fiscal-handlers'
const input={batchId:'batch',documentId:'document',itemNumber:'1',requestId:'request',answers:{}}
beforeEach(()=>{vi.clearAllMocks();state.handlers.clear();registerItemFiscalHandlers()})
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
