import { parentPort, workerData } from 'node:worker_threads'
import { performance } from 'node:perf_hooks'
import { SqliteDatabase } from '@motor/database'
import type { CreateBatchInput } from '@motor/contracts'
import { BatchOperationRegistry } from './batch-operation'
import { importBatch } from './import-batch'

const data = workerData as { input: CreateBatchInput; databasePath: string; dataDirectory: string; resumeId?: string }
const registry = new BatchOperationRegistry()
const session = registry.start(data.input.operationId, 0, 'PROCESSING', data.input.totalEntries,
  (progress) => parentPort?.postMessage({ type: 'PROGRESS', progress }))
parentPort?.on('message', (message: { type: 'CANCEL' | 'PAUSE' }) => {
  if (message.type === 'PAUSE') registry.pause(data.input.operationId, 0)
  else if (message.type === 'CANCEL') registry.cancel(data.input.operationId, 0)
})
const started = performance.now()
let peakRss = process.memoryUsage().rss
const sampler = setInterval(() => { peakRss = Math.max(peakRss, process.memoryUsage().rss) }, 100)
const database = new SqliteDatabase(data.databasePath)
try {
  const result = await importBatch(data.input, session, database, data.dataDirectory, data.resumeId)
  parentPort?.postMessage({ type: 'RESULT', result, metrics: { elapsedMs: performance.now() - started, peakRssBytes: Math.max(peakRss, process.memoryUsage().rss) } })
} catch (error) {
  parentPort?.postMessage({ type: 'ERROR', message: error instanceof Error ? error.message : 'Falha na importação.' })
} finally {
  clearInterval(sampler)
  database.close()
  parentPort?.close()
}
