import { IPC_CHANNELS } from '@motor/contracts'
import { AppError, AppErrorCode } from '@motor/domain'
import type { IpcMainInvokeEvent } from 'electron'
import type { BatchOperationSession } from '../../../modules/batches/application/batch-operation'
import { batchOperations } from '../../../platform/operations/batch-operations'
import { assertDatabaseNotInMaintenance } from '../../../platform/sqlite/database-runtime'
import { requiredInputText } from '../../validation/input'

/** Controla progresso, cancelamento e limpeza de uma operação longa iniciada pela interface. */
export async function runBatchOperation<T>(
  event: IpcMainInvokeEvent,
  rawOperationId: unknown,
  phase: 'INSPECTING' | 'PROCESSING',
  total: number,
  operation: (session: BatchOperationSession) => Promise<T>,
): Promise<T> {
  assertDatabaseNotInMaintenance()
  const operationId = requiredInputText(rawOperationId, 'Identificador da operação')
  if (!Number.isSafeInteger(total) || total < 0) throw new AppError(AppErrorCode.INVALID_PROGRESS_TOTAL)
  const session = batchOperations.start(operationId, event.sender.id, phase, total, (progress) => {
    if (!event.sender.isDestroyed()) event.sender.send(IPC_CHANNELS.BATCH_PROGRESS, progress)
  })
  try {
    return await operation(session)
  } finally {
    batchOperations.finish(operationId)
  }
}
