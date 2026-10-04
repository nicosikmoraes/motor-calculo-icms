import { Worker } from 'node:worker_threads'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { BatchOperationProgress, CreateBatchInput, CreatedBatchSummary } from '@motor/contracts'
import type { BatchOperationSession } from './batch-operation'

const workers = new Set<Worker>()
export async function stopImportWorkers(): Promise<void> {
  await Promise.all([...workers].map((worker) => worker.terminate()))
}
export function runImportWorker(input: CreateBatchInput, session: BatchOperationSession,
  dataDirectory: string, resumeId?: string): Promise<CreatedBatchSummary> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(join(dirname(fileURLToPath(import.meta.url)), 'batch-import-worker.js'), {
      workerData: { input, dataDirectory, databasePath: join(dataDirectory, 'motor-icms.sqlite'), ...(resumeId ? { resumeId } : {}) },
    })
    workers.add(worker)
    let settled = false
    let completedResult: CreatedBatchSummary | undefined
    const onAbort = () => worker.postMessage({ type: session.paused ? 'PAUSE' : 'CANCEL' })
    session.signal.addEventListener('abort', onAbort, { once: true })
    if (session.cancelled) onAbort()
    const cleanup = () => { session.signal.removeEventListener('abort', onAbort); workers.delete(worker) }
    worker.on('message', (message: { type: string; progress?: BatchOperationProgress; result?: CreatedBatchSummary; message?: string; metrics?: unknown }) => {
      if (message.type === 'PROGRESS' && message.progress) {
        const p = message.progress
        session.report(p.phase, p.completed, p.total, p.currentSource)
      } else if (message.type === 'RESULT' && message.result) {
        settled = true
        console.info('Métricas locais de importação', { batchId: message.result.id, ...message.metrics as object })
        completedResult = message.result
      } else if (message.type === 'ERROR') { settled = true; reject(new Error(message.message ?? 'Falha na importação.')) }
    })
    worker.on('error', (error) => { settled = true; reject(error) })
    worker.on('exit', () => {
      cleanup()
      if (completedResult) resolve(completedResult)
      else if (!settled) reject(new Error('Importação interrompida. O ponto de recuperação foi preservado; retome pelo Histórico.'))
    })
  })
}
