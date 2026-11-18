import { IPC_CHANNELS } from '@motor/contracts'
import { queryBatchDetail, queryBatches } from '../../../modules/batches/queries/batch-queries'
import { queryDashboard } from '../../../modules/batches/queries/dashboard-query'
import { activeDatabase } from '../../../platform/sqlite/database-runtime'
import type { RegisterIpcRoute } from '../../route-registry'
import { requiredInputText } from '../../validation/input'

export function registerBatchQueryHandlers(register: RegisterIpcRoute): void {
  register(IPC_CHANNELS.GET_DASHBOARD, () => queryDashboard(activeDatabase()))
  register(IPC_CHANNELS.LIST_BATCHES, () => queryBatches(activeDatabase()))
  register(IPC_CHANNELS.GET_BATCH_DETAIL, (_event, rawBatchId: unknown, rawRunId: unknown) => {
    const batchId = requiredInputText(rawBatchId, 'Lote')
    const runId = rawRunId === undefined ? undefined : requiredInputText(rawRunId, 'Execução')
    return queryBatchDetail(activeDatabase(), batchId, runId)
  })
}
