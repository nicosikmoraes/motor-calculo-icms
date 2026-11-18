import { BrowserWindow } from 'electron'
import type { RegisterIpcRoute } from '../../route-registry'
import { IPC_CHANNELS } from '@motor/contracts'
import { activeDatabase } from '../../../platform/sqlite/database-runtime'
import { batchOperations } from '../../../platform/operations/batch-operations'
import { listDocumentReviews, saveDocumentReview } from '../../../modules/fiscal/adapters/sqlite/document-review-use-cases'

export function registerDocumentReviewHandlers(register: RegisterIpcRoute): void {
  function validateSender(event: Electron.IpcMainInvokeEvent): void {
    if (!BrowserWindow.fromWebContents(event.sender) || event.senderFrame !== event.sender.mainFrame) throw new Error('Solicitação de revisão inválida.')
    if (batchOperations.busy) throw new Error('Aguarde ou pause a importação antes da revisão documental.')
  }
  register(IPC_CHANNELS.LIST_DOCUMENT_REVIEWS, event => {
    validateSender(event); return listDocumentReviews(activeDatabase())
  })
  register(IPC_CHANNELS.SAVE_DOCUMENT_REVIEW, (event, raw: unknown) => {
    validateSender(event); return saveDocumentReview(activeDatabase(), raw)
  })
}
