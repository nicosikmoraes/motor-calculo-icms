import { BrowserWindow, ipcMain } from 'electron'
import { IPC_CHANNELS } from '@motor/contracts'
import { activeDatabase, batchOperations } from './main-services'
import { listDocumentConflicts, saveConflictResolution } from './conflict-resolution-use-cases'

export function registerConflictResolutionHandlers(): void {
  function validateSender(event: Electron.IpcMainInvokeEvent): void {
    if (!BrowserWindow.fromWebContents(event.sender) || event.senderFrame !== event.sender.mainFrame) throw new Error('Solicitação de resolução inválida.')
    if (batchOperations.busy) throw new Error('Aguarde ou pause a importação antes da resolução de conflitos.')
  }
  ipcMain.handle(IPC_CHANNELS.LIST_DOCUMENT_CONFLICTS, event => {
    validateSender(event); return listDocumentConflicts(activeDatabase())
  })
  ipcMain.handle(IPC_CHANNELS.SAVE_CONFLICT_RESOLUTION, (event, raw: unknown) => {
    validateSender(event); return saveConflictResolution(activeDatabase(), raw)
  })
}
