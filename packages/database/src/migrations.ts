import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { SqliteDatabase } from './sqlite-database'

const MIGRATION_FILE_PATTERN = /^(\d{4})_([a-z0-9][a-z0-9_-]*)\.sql$/i
const CHECKSUM_PATTERN = /^[a-f0-9]{64}$/
const TRANSACTION_CONTROL_PATTERN = /^\s*(?:BEGIN(?:\s+(?:DEFERRED|IMMEDIATE|EXCLUSIVE|TRANSACTION))?|COMMIT|ROLLBACK|SAVEPOINT\s+\w+|RELEASE\s+\w+)\s*;/im

export interface SqlMigration {
  version: number
  name: string
  fileName: string
  sql: string
  checksum: string
}

export interface AppliedMigration {
  version: number
  name: string
  checksum: string
  appliedAt: string
  appVersion: string
}

export interface MigrationResult {
  applied: readonly AppliedMigration[]
  alreadyApplied: readonly AppliedMigration[]
}

export interface MigrationRunnerOptions {
  appVersion: string
  now?: () => Date
}

export interface MigrationBackupOptions extends MigrationRunnerOptions {
  backupPath: string
}

interface MigrationRow extends Record<string, unknown> {
  version: number
  name: string
  checksum: string
  applied_at: string
  app_version: string
}

function requiredText(value: string, field: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${field} deve ser informado.`)
  return normalized
}

function checksum(sql: string): string {
  return createHash('sha256').update(sql, 'utf8').digest('hex')
}

export function createSqlMigration(values: {
  version: number
  name: string
  sql: string
  fileName?: string
}): SqlMigration {
  if (!Number.isSafeInteger(values.version) || values.version < 1) {
    throw new Error('A versão da migration deve ser um inteiro positivo.')
  }

  const name = requiredText(values.name, 'name')
  const sql = requiredText(values.sql, 'sql')
  const fileName = values.fileName ?? `${String(values.version).padStart(4, '0')}_${name}.sql`

  return {
    version: values.version,
    name,
    fileName,
    sql,
    checksum: checksum(sql),
  }
}

function validateMigrationSet(migrations: readonly SqlMigration[]): readonly SqlMigration[] {
  const versions = new Set<number>()
  const names = new Set<string>()
  const sorted = [...migrations].sort(
    (left, right) =>
      left.version - right.version || (left.name < right.name ? -1 : left.name > right.name ? 1 : 0),
  )

  for (const [index, migration] of sorted.entries()) {
    if (!Number.isSafeInteger(migration.version) || migration.version < 1) {
      throw new Error(`Versão inválida na migration ${migration.fileName}.`)
    }
    if (versions.has(migration.version)) {
      throw new Error(`Versão de migration duplicada: ${migration.version}.`)
    }
    if (names.has(migration.name)) {
      throw new Error(`Nome de migration duplicado: ${migration.name}.`)
    }
    if (migration.version !== index + 1) {
      throw new Error(
        `Sequência de migrations inválida: esperada versão ${index + 1}, encontrada ${migration.version}.`,
      )
    }
    if (!CHECKSUM_PATTERN.test(migration.checksum) || migration.checksum !== checksum(migration.sql)) {
      throw new Error(`Checksum inválido na migration ${migration.fileName}.`)
    }
    if (TRANSACTION_CONTROL_PATTERN.test(migration.sql)) {
      throw new Error(
        `A migration ${migration.fileName} contém controle de transação; o executor controla BEGIN e COMMIT.`,
      )
    }
    versions.add(migration.version)
    names.add(migration.name)
  }

  return sorted
}

export async function discoverSqlMigrations(directory: string): Promise<readonly SqlMigration[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const sqlFiles = entries.filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))

  return validateMigrationSet(
    await Promise.all(
      sqlFiles.map(async ({ name: fileName }) => {
        const match = MIGRATION_FILE_PATTERN.exec(fileName)
        if (!match) {
          throw new Error(
            `Nome de migration inválido: ${fileName}. Use o formato 0001_nome.sql.`,
          )
        }

        const [, versionText, name] = match
        if (!versionText || !name) throw new Error(`Nome de migration inválido: ${fileName}.`)
        const sql = await readFile(join(directory, fileName), 'utf8')
        return createSqlMigration({ version: Number(versionText), name, sql, fileName })
      }),
    ),
  )
}

function ensureMigrationTable(database: SqliteDatabase): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY CHECK (version > 0),
      name TEXT NOT NULL UNIQUE CHECK (length(trim(name)) > 0),
      checksum TEXT NOT NULL CHECK (length(checksum) = 64),
      applied_at TEXT NOT NULL,
      app_version TEXT NOT NULL CHECK (length(trim(app_version)) > 0)
    ) STRICT;
  `)
}

function readAppliedMigrations(database: SqliteDatabase): readonly AppliedMigration[] {
  return database
    .all<MigrationRow>(`
      SELECT version, name, checksum, applied_at, app_version
      FROM schema_migrations
      ORDER BY version
    `)
    .map((row) => ({
      version: row.version,
      name: row.name,
      checksum: row.checksum,
      appliedAt: row.applied_at,
      appVersion: row.app_version,
    }))
}

function migrationTableExists(database: SqliteDatabase): boolean {
  return (
    database.get<{ total: number }>(`
      SELECT count(*) AS total
      FROM sqlite_master
      WHERE type = 'table' AND name = 'schema_migrations'
    `)?.total === 1
  )
}

function hasUserSchema(database: SqliteDatabase): boolean {
  return (
    (database.get<{ total: number }>(`
      SELECT count(*) AS total
      FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
        AND name <> 'schema_migrations'
    `)?.total ?? 0) > 0
  )
}

function assertAppliedMigrationsMatch(
  available: readonly SqlMigration[],
  applied: readonly AppliedMigration[],
): void {
  const availableByVersion = new Map(available.map((migration) => [migration.version, migration]))

  for (const existing of applied) {
    const migration = availableByVersion.get(existing.version)
    if (!migration) {
      throw new Error(
        `A migration aplicada ${existing.version} (${existing.name}) não existe nesta versão do aplicativo.`,
      )
    }
    if (migration.name !== existing.name || migration.checksum !== existing.checksum) {
      throw new Error(
        `A migration aplicada ${existing.version} (${existing.name}) foi alterada.`,
      )
    }
  }
}

export function runSqlMigrations(
  database: SqliteDatabase,
  migrations: readonly SqlMigration[],
  options: MigrationRunnerOptions,
): MigrationResult {
  const appVersion = requiredText(options.appVersion, 'appVersion')
  const available = validateMigrationSet(migrations)
  ensureMigrationTable(database)

  const alreadyApplied = readAppliedMigrations(database)
  assertAppliedMigrationsMatch(available, alreadyApplied)
  const appliedVersions = new Set(alreadyApplied.map(({ version }) => version))
  const newlyApplied: AppliedMigration[] = []

  for (const migration of available) {
    if (appliedVersions.has(migration.version)) continue

    const appliedAt = (options.now ?? (() => new Date()))().toISOString()
    database.transaction(() => {
      database.exec(migration.sql)
      database.run(
        `INSERT INTO schema_migrations
          (version, name, checksum, applied_at, app_version)
         VALUES (?, ?, ?, ?, ?)`,
        migration.version,
        migration.name,
        migration.checksum,
        appliedAt,
        appVersion,
      )
    })

    newlyApplied.push({
      version: migration.version,
      name: migration.name,
      checksum: migration.checksum,
      appliedAt,
      appVersion,
    })
  }

  return { applied: newlyApplied, alreadyApplied }
}

export async function runSqlMigrationsFromDirectory(
  database: SqliteDatabase,
  directory: string,
  options: MigrationRunnerOptions,
): Promise<MigrationResult> {
  return runSqlMigrations(database, await discoverSqlMigrations(directory), options)
}

export async function runSqlMigrationsWithBackup(
  database: SqliteDatabase,
  migrations: readonly SqlMigration[],
  options: MigrationBackupOptions,
): Promise<MigrationResult> {
  const available = validateMigrationSet(migrations)
  const applied = migrationTableExists(database) ? readAppliedMigrations(database) : []
  assertAppliedMigrationsMatch(available, applied)
  const appliedVersions = new Set(applied.map(({ version }) => version))
  const hasPendingMigration = available.some(({ version }) => !appliedVersions.has(version))

  if (hasPendingMigration && hasUserSchema(database)) {
    await database.backupTo(requiredText(options.backupPath, 'backupPath'))
  }

  return runSqlMigrations(database, available, options)
}
