import { BrowserWindow } from 'electron'
import type { RegisterIpcRoute } from '../../route-registry'
import { IPC_CHANNELS } from '@motor/contracts'
import { activeDatabase } from '../../../platform/sqlite/database-runtime'
import { batchOperations } from '../../../platform/operations/batch-operations'
import { listDocumentConflicts, saveConflictResolution } from '../../../modules/fiscal/adapters/sqlite/conflict-resolution-use-cases'

export function registerConflictResolutionHandlers(register: RegisterIpcRoute): void {
  function validateSender(event: Electron.IpcMainInvokeEvent): void {
    if (!BrowserWindow.fromWebContents(event.sender) || event.senderFrame !== event.sender.mainFrame) throw new Error('Solicitação de resolução inválida.')
    if (batchOperations.busy) throw new Error('Aguarde ou pause a importação antes da resolução de conflitos.')
  }
  register(IPC_CHANNELS.LIST_DOCUMENT_CONFLICTS, event => {
    validateSender(event); return listDocumentConflicts(activeDatabase())
  })
  register(IPC_CHANNELS.SAVE_CONFLICT_RESOLUTION, (event, raw: unknown) => {
    validateSender(event); return saveConflictResolution(activeDatabase(), raw)
  })
}
