import { BrowserWindow, ipcMain } from 'electron'
import { IPC_CHANNELS } from '@motor/contracts'
import { activeDatabase, batchOperations } from './main-services'
import { listDocumentReviews, saveDocumentReview } from './document-review-use-cases'

export function registerDocumentReviewHandlers(): void {
  function validateSender(event: Electron.IpcMainInvokeEvent): void {
    if (!BrowserWindow.fromWebContents(event.sender) || event.senderFrame !== event.sender.mainFrame) throw new Error('Solicitação de revisão inválida.')
    if (batchOperations.busy) throw new Error('Aguarde ou pause a importação antes da revisão documental.')
  }
  ipcMain.handle(IPC_CHANNELS.LIST_DOCUMENT_REVIEWS, event => {
    validateSender(event); return listDocumentReviews(activeDatabase())
  })
  ipcMain.handle(IPC_CHANNELS.SAVE_DOCUMENT_REVIEW, (event, raw: unknown) => {
    validateSender(event); return saveDocumentReview(activeDatabase(), raw)
  })
}
