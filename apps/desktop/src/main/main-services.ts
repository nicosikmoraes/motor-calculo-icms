import { recoverInterruptedRestore } from './backup-restore'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { IPC_CHANNELS, type SelectedSource } from '@motor/contracts'
import { AppError, AppErrorCode } from '@motor/domain'
import { CORE_MIGRATIONS, SqliteDatabase, SqliteRegistrationAuditRepository,
  auditRetentionCutoff, runSqlMigrationsWithBackup } from '@motor/database'
import { BatchOperationCancelledError, BatchOperationRegistry, type BatchOperationSession } from './batch-operation'
import { ZipVisitCancelledError } from '@motor/nfe-parser'

/** Serviços compartilhados pelo processo principal; nenhum módulo de fluxo abre outro banco. */
export const approvedSourcePaths = new Set<string>()
export const batchOperations = new BatchOperationRegistry()
let database: SqliteDatabase | undefined
let databaseMaintenance = false
export function beginDatabaseMaintenance(): SqliteDatabase {
  if (databaseMaintenance || batchOperations.busy) throw new Error('Aguarde ou pause o lote antes de restaurar o backup.')
  const connection = activeDatabase()
  databaseMaintenance = true
  return connection
}
export function endDatabaseMaintenance(): void { databaseMaintenance = false }
let retentionTimer: ReturnType<typeof setInterval> | undefined
let lastRetentionDate: string | undefined

/** Controla progresso, cancelamento e limpeza de uma operação longa iniciada pela interface. */
export async function runBatchOperation<T>(
  event: Electron.IpcMainInvokeEvent,
  rawOperationId: unknown,
  phase: 'INSPECTING' | 'PROCESSING',
  total: number,
  operation: (session: BatchOperationSession) => Promise<T>,
): Promise<T> {
  if (databaseMaintenance) throw new Error('Restauração em andamento. Aguarde o reinício.')
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

/** Distingue um cancelamento solicitado de uma falha de leitura. */
export function isCancelled(cause: unknown): boolean {
  return cause instanceof ZipVisitCancelledError || cause instanceof BatchOperationCancelledError
}

/** Entrega a conexão SQLite já migrada aos handlers. */
export function activeDatabase(): SqliteDatabase {
  if (databaseMaintenance) throw new Error('Restauração em andamento. Aguarde o reinício.')
  if (!database) throw new AppError(AppErrorCode.DATABASE_NOT_READY)
  return database
}

/** Valida o formato básico dos objetos recebidos pela ponte IPC. */
export function inputRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AppError(AppErrorCode.INVALID_IPC_INPUT)
  }
  return value as Record<string, unknown>
}

/** Rejeita textos obrigatórios vazios antes de chamar os repositórios. */
export function requiredInputText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new AppError(AppErrorCode.REQUIRED_FIELD, { field })
  return value.trim()
}

/** Aceita somente os caminhos liberados pelo seletor nativo de arquivos. */
export function validatedSources(rawSources: unknown): SelectedSource[] {
  if (!Array.isArray(rawSources)) throw new AppError(AppErrorCode.INVALID_SOURCE_LIST)
  return rawSources.map((value): SelectedSource => {
    const source = inputRecord(value)
    const path = requiredInputText(source.path, 'Caminho do arquivo')
    const kind = source.kind
    if (kind !== 'XML' && kind !== 'ZIP') throw new AppError(AppErrorCode.INVALID_SOURCE_KIND)
    if (!approvedSourcePaths.has(path)) throw new AppError(AppErrorCode.SOURCE_NOT_APPROVED)
    return { path, kind }
  })
}

/** Calcula o SHA-256 em streaming e respeita o cancelamento do lote. */
export async function hashFile(path: string, session?: BatchOperationSession): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) {
    session?.throwIfCancelled()
    hash.update(chunk as Buffer)
  }
  session?.throwIfCancelled()
  return hash.digest('hex')
}

/** Limpa eventos vencidos; erro gera diagnóstico e a próxima chamada tenta novamente. */
export function runAuditRetention(): void {
  if (!database || databaseMaintenance) return
  const now = new Date()
  const date = now.toISOString().slice(0, 10)
  if (lastRetentionDate === date) return
  try {
    const removed = new SqliteRegistrationAuditRepository(database)
      .purgeBefore(auditRetentionCutoff(now), now.toISOString())
    lastRetentionDate = date
    console.info(`Retenção da auditoria: ${removed} evento(s) removido(s) em ${now.toISOString()}`)
  } catch (error) {
    console.error('Falha na retenção da auditoria; nova tentativa programada.', error)
  }
}

/** Abre o banco local e cria um backup antes de aplicar migrations pendentes. */
export async function openDatabase(): Promise<void> {
  const dataDirectory = app.getPath('userData')
  const backupDirectory = join(dataDirectory, 'backups')
  await recoverInterruptedRestore(dataDirectory)
  // Somente o estágio legado é descartado; import-recovery conserva checkpoints para retomada.
  await rm(join(dataDirectory, 'import-staging'), { recursive: true, force: true })
  await mkdir(backupDirectory, { recursive: true })

  database = new SqliteDatabase(join(dataDirectory, 'motor-icms.sqlite'))
  try {
    await runSqlMigrationsWithBackup(database, CORE_MIGRATIONS, {
      appVersion: app.getVersion(),
      backupPath: join(backupDirectory, `pre-migration-${Date.now()}-${randomUUID()}.sqlite`),
    })
  } catch (error) {
    database.close()
    database = undefined
    throw error
  }
  runAuditRetention()
  retentionTimer = setInterval(runAuditRetention, 60 * 60 * 1000)
}

/** Fecha a conexão quando o Electron termina. */
export function closeDatabase(): void {
  if (retentionTimer) clearInterval(retentionTimer)
  retentionTimer = undefined
  database?.close()
  database = undefined
}
