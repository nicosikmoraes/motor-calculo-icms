import { join } from 'node:path'
import { app, ipcMain } from 'electron'
import { IPC_CHANNELS, type CreateBatchInput, type CreatedBatchSummary } from '@motor/contracts'
import { SqliteBatchRepository } from '@motor/database'
import { activeDatabase, inputRecord, requiredInputText, runBatchOperation, validatedSources } from './main-services'
import { listRecoveries, readRecovery, removeRecovery } from './import-recovery'
import { runImportWorker } from './import-worker-client'

/** A importação e sua transação SQLite rodam fora do processo que atende a interface. */
export function registerBatchCreateHandler(): void {
  const dataDirectory = app.getPath('userData')
  const root = join(dataDirectory, 'import-recovery')
  ipcMain.handle(IPC_CHANNELS.CREATE_BATCH, async (event, rawInput: unknown): Promise<CreatedBatchSummary> => {
    const input = inputRecord(rawInput) as unknown as CreateBatchInput
    const sources = validatedSources(input.sources)
    return runBatchOperation(event, input.operationId, 'PROCESSING', input.totalEntries,
      (session) => runImportWorker({ ...input, sources }, session, dataDirectory))
  })
  ipcMain.handle(IPC_CHANNELS.LIST_RECOVERABLE_IMPORTS, async () => {
    const batches = new SqliteBatchRepository(activeDatabase())
    const entries = await listRecoveries(root)
    const pending = []
    for (const entry of entries) {
      // Uma queda depois do COMMIT e antes da limpeza não cria um segundo lote.
      if (batches.findById(entry.id)) await removeRecovery(root, entry.id)
      else pending.push(entry)
    }
    return pending
  })
  ipcMain.handle(IPC_CHANNELS.RESUME_IMPORT, async (event, rawId: unknown, rawOperationId: unknown) => {
    const id = requiredInputText(rawId, 'Recuperação')
    const manifest = await readRecovery(root, id)
    const input = { ...manifest.input, operationId: requiredInputText(rawOperationId, 'Operação') }
    const stored = new SqliteBatchRepository(activeDatabase()).findById(id)
    if (stored) {
      await removeRecovery(root, id)
      return { id: stored.id, status: stored.status, totalFiles: stored.totalFiles, totalDocuments: stored.totalDocuments, totalPendencies: stored.totalPendencies }
    }
    return runBatchOperation(event, input.operationId, 'PROCESSING', input.totalEntries,
      (session) => runImportWorker(input, session, dataDirectory, id))
  })
}
