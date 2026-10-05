import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '@motor/contracts'
import { activeDatabase, batchOperations, inputRecord, requiredInputText } from './main-services'
import { applyReusableFiscalAnswers, getItemFiscalContext, saveItemFiscalAnswers, validateItemFiscalAnswers } from './item-fiscal-use-cases'

function text(raw: unknown, label: string): string {
  const value = requiredInputText(raw, label)
  if (value.length > 128) throw new Error(`${label} excede o limite permitido.`)
  return value
}

export function registerItemFiscalHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.APPLY_REUSABLE_FISCAL_ANSWERS, (_event, batchId: unknown) => {
    if (batchOperations.busy) return 0
    return applyReusableFiscalAnswers(activeDatabase(), text(batchId, 'Lote'))
  })
  ipcMain.handle(IPC_CHANNELS.GET_ITEM_FISCAL_CONTEXT, (_event, batchId: unknown, documentId: unknown, itemNumber: unknown) =>
    getItemFiscalContext(activeDatabase(), text(batchId, 'Lote'), text(documentId, 'Documento'), text(itemNumber, 'Item')))
  ipcMain.handle(IPC_CHANNELS.SAVE_ITEM_FISCAL_ANSWERS, (_event, raw: unknown) => {
    if (batchOperations.busy) throw new Error('Aguarde ou pause a importação antes de salvar as respostas.')
    const input = inputRecord(raw)
    return saveItemFiscalAnswers(activeDatabase(), {
      batchId: text(input.batchId, 'Lote'), documentId: text(input.documentId, 'Documento'),
      itemNumber: text(input.itemNumber, 'Item'), requestId: text(input.requestId, 'Solicitação'),
      ...(input.expectedRunId !== undefined ? { expectedRunId: text(input.expectedRunId, 'Execução anterior') } : {}),
      answers: validateItemFiscalAnswers(input.answers),
      ...(input.reuseScope !== undefined ? { reuseScope: (() => {
        if (input.reuseScope !== 'CURRENT_ITEM' && input.reuseScope !== 'FUTURE_NOTES') throw new Error('Alcance das respostas inválido.')
        return input.reuseScope
      })() } : {}),
      ...(input.expectedDefinitionId !== undefined ? { expectedDefinitionId: text(input.expectedDefinitionId, 'Definição anterior') } : {}),
    })
  })
}
