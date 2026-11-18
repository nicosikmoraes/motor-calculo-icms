import { IPC_CHANNELS } from '@motor/contracts'
import { reassessBatchRules } from '../../../modules/batches/adapters/sqlite/reassess-batch-rules'
import { activeDatabase } from '../../../platform/sqlite/database-runtime'
import type { RegisterIpcRoute } from '../../route-registry'
import { requiredInputText } from '../../validation/input'

export function registerBatchReassessmentHandler(register: RegisterIpcRoute): void {
  register(IPC_CHANNELS.REASSESS_BATCH_RULES, (_event, rawBatchId: unknown) => {
    const batchId = requiredInputText(rawBatchId, 'Lote')
    return reassessBatchRules(activeDatabase(), batchId)
  })
}
