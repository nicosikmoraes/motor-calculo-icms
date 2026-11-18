import { randomUUID } from 'node:crypto'
import { chmod, copyFile, lstat, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { CORE_MIGRATIONS, SqliteDatabase, runSqlMigrations } from '@motor/database'
import { assertDatabaseIntegrity, assertRegularFile, hashBackup, validateBackup } from './backup-files'

interface RestoreJournal { version: 1; candidate: string; parked: string; safety: string; safetyHash: string }
export interface PreparedRestore { path: string; createdAt: string; appVersion: string; sha256: string }
const journalName = 'restore-journal.json'
function checkSchema(database: SqliteDatabase): void {
  const rows = database.all<{ version: number; name: string; checksum: string }>('SELECT version, name, checksum FROM schema_migrations ORDER BY version')
  if (!rows.length || rows.some((row, i) => row.version !== i + 1 ||
    CORE_MIGRATIONS[i]?.name !== row.name || CORE_MIGRATIONS[i]?.checksum !== row.checksum)) {
    throw new Error('O banco do backup não é compatível com esta versão do aplicativo.')
  }
}
/** Prepara e migra uma cópia, sem alterar o banco em uso nem o backup original. */
export async function prepareRestore(directory: string, dataDirectory: string, appVersion: string): Promise<PreparedRestore> {
  const manifest = await validateBackup(directory)
  const path = join(dataDirectory, `.restore-candidate-${randomUUID()}.sqlite`)
  await copyFile(join(directory, manifest.database), path)
  await chmod(path, 0o600)
  try {
    if (await hashBackup(path) !== manifest.sha256) throw new Error('O backup mudou durante a leitura.')
    const database = new SqliteDatabase(path)
    try {
      checkSchema(database)
      runSqlMigrations(database, CORE_MIGRATIONS, { appVersion })
      assertDatabaseIntegrity(database)
    } finally { database.close() }
    return { path, createdAt: manifest.createdAt, appVersion: manifest.appVersion, sha256: await hashBackup(path) }
  } catch (error) {
    await disposeCandidate(path)
    throw error
  }
}
export async function disposeCandidate(path: string): Promise<void> {
  for (const suffix of ['', '-wal', '-shm']) await rm(path + suffix, { force: true })
}
/** A cópia do estado atual é validada antes de fechar a conexão e trocar arquivos. */
export async function installRestore(prepared: PreparedRestore, dataDirectory: string, database: SqliteDatabase,
  close: () => void, afterPark?: () => void): Promise<void> {
  await assertRegularFile(prepared.path)
  if (await hashBackup(prepared.path) !== prepared.sha256) throw new Error('A cópia preparada mudou antes da restauração.')
  const backupDirectory = join(dataDirectory, 'backups')
  await mkdir(backupDirectory, { recursive: true })
  const id = randomUUID()
  const safety = `pre-restore-${id}.sqlite`
  await database.backupTo(join(backupDirectory, safety))
  await chmod(join(backupDirectory, safety), 0o600)
  const journal: RestoreJournal = { version: 1, candidate: basename(prepared.path), parked: `.restore-old-${id}.sqlite`,
    safety, safetyHash: await hashBackup(join(backupDirectory, safety)) }
  const temporaryJournal = join(dataDirectory, `${journalName}.${id}.tmp`)
  try {
    await writeFile(temporaryJournal, JSON.stringify(journal), { flag: 'wx', mode: 0o600 })
    await rename(temporaryJournal, join(dataDirectory, journalName))
    close()
    const active = join(dataDirectory, 'motor-icms.sqlite')
    await rename(active, join(dataDirectory, journal.parked))
    afterPark?.() // Hook de falha para exercitar a recuperação entre as duas trocas.
    // Sidecars da conexão encerrada jamais acompanham um banco diferente.
    for (const suffix of ['-wal', '-shm']) await rm(active + suffix, { force: true })
    await rename(prepared.path, active)
    await rm(join(dataDirectory, journalName))
    await disposeCandidate(join(dataDirectory, journal.parked)).catch(() => undefined)
  } finally { await rm(temporaryJournal, { force: true }).catch(() => undefined) }
}
/** Um journal pendente significa troca incompleta: recupera a cópia anterior na abertura. */
export async function recoverInterruptedRestore(dataDirectory: string): Promise<boolean> {
  const path = join(dataDirectory, journalName)
  let json: string
  try {
    await assertRegularFile(path)
    if ((await lstat(path)).size > 4096) throw new Error('Journal de restauração inválido.')
    json = await readFile(path, 'utf8')
  } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error }
  const journal = JSON.parse(json) as RestoreJournal
  if (journal.version !== 1 || !/^\.restore-candidate-[a-f0-9-]{36}\.sqlite$/.test(journal.candidate) ||
    !/^\.restore-old-[a-f0-9-]{36}\.sqlite$/.test(journal.parked) || !/^pre-restore-[a-f0-9-]{36}\.sqlite$/.test(journal.safety) ||
    !/^[a-f0-9]{64}$/.test(journal.safetyHash)) throw new Error('Journal de restauração inválido; os arquivos foram preservados.')
  const safety = join(dataDirectory, 'backups', journal.safety)
  await assertRegularFile(safety)
  if (await hashBackup(safety) !== journal.safetyHash) throw new Error('A cópia de segurança anterior está corrompida. Os arquivos foram preservados.')
  const validation = new SqliteDatabase(safety, { readOnly: true })
  try { assertDatabaseIntegrity(validation) } finally { validation.close() }
  const recovery = join(dataDirectory, `.restore-recovery-${randomUUID()}.sqlite`)
  await copyFile(safety, recovery)
  await chmod(recovery, 0o600)
  const active = join(dataDirectory, 'motor-icms.sqlite')
  for (const suffix of ['-wal', '-shm']) await rm(active + suffix, { force: true })
  await rename(recovery, active)
  await rm(path)
  await disposeCandidate(join(dataDirectory, journal.candidate)).catch(() => undefined)
  await disposeCandidate(join(dataDirectory, journal.parked)).catch(() => undefined)
  return true
}
