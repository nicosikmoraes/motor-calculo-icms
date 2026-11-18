import { randomUUID } from 'node:crypto'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import { AppError, AppErrorCode } from '@motor/domain'
import { CORE_MIGRATIONS, SqliteDatabase, SqliteRegistrationAuditRepository,
  auditRetentionCutoff, runSqlMigrationsWithBackup } from '@motor/database'
import { recoverInterruptedRestore } from '../../modules/backup/adapters/files/backup-restore'
import { batchOperations } from '../operations/batch-operations'

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

export function assertDatabaseNotInMaintenance(): void {
  if (databaseMaintenance) throw new Error('Restauração em andamento. Aguarde o reinício.')
}

/** Entrega a conexão SQLite já migrada aos handlers. */
export function activeDatabase(): SqliteDatabase {
  assertDatabaseNotInMaintenance()
  if (!database) throw new AppError(AppErrorCode.DATABASE_NOT_READY)
  return database
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
