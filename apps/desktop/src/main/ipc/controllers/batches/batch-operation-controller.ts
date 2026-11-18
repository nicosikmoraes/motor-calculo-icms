import { IPC_CHANNELS } from '@motor/contracts'
import { batchOperations } from '../../../platform/operations/batch-operations'
import type { RegisterIpcRoute } from '../../route-registry'
import { requiredInputText } from '../../validation/input'

export function registerBatchOperationRoutes(register: RegisterIpcRoute): void {
  register(IPC_CHANNELS.CANCEL_BATCH_OPERATION,
    (event, rawOperationId: unknown) => batchOperations.cancel(requiredInputText(rawOperationId, 'Identificador da operação'), event.sender.id))
  register(IPC_CHANNELS.PAUSE_BATCH_OPERATION,
    (event, rawId: unknown) => batchOperations.pause(requiredInputText(rawId, 'Operação'), event.sender.id))
}
