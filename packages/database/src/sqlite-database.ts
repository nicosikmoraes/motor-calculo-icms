import { AppError, AppErrorCode } from '@motor/domain'
import { resolve } from 'node:path'
import { stat } from 'node:fs/promises'
import { DatabaseSync, backup, type StatementSync, type SQLInputValue } from 'node:sqlite'

export interface SqliteDatabaseOptions {
  readOnly?: boolean
  timeoutMilliseconds?: number
}

export class SqliteDatabase {
  readonly #connection: DatabaseSync
  #closed = false
  readonly #statements = new Map<string, StatementSync>()

  constructor(path: string, options: SqliteDatabaseOptions = {}) {
    const timeout = options.timeoutMilliseconds ?? 5_000
    if (!Number.isSafeInteger(timeout) || timeout < 0) {
      throw new AppError(AppErrorCode.INVALID_SQLITE_TIMEOUT)
    }

    this.#connection = new DatabaseSync(path, {
      readOnly: options.readOnly ?? false,
      timeout,
      enableForeignKeyConstraints: true,
      enableDoubleQuotedStringLiterals: false,
      allowExtension: false,
    })

    this.#connection.exec('PRAGMA foreign_keys = ON')
    this.#connection.exec(`PRAGMA busy_timeout = ${timeout}`)

    if (!(options.readOnly ?? false)) {
      this.#connection.exec('PRAGMA journal_mode = WAL')
      this.#connection.exec('PRAGMA synchronous = FULL')
    }

    const foreignKeys = this.get<{ foreign_keys: number }>('PRAGMA foreign_keys')
    if (foreignKeys?.foreign_keys !== 1) {
      this.#connection.close()
      this.#closed = true
      throw new AppError(AppErrorCode.FOREIGN_KEYS_DISABLED)
    }
  }

  get isOpen(): boolean {
    return !this.#closed
  }

  exec(sql: string): void {
    this.#assertOpen()
    this.#connection.exec(sql)
  }

  get<TRow extends Record<string, unknown>>(
    sql: string,
    ...parameters: SQLInputValue[]
  ): TRow | undefined {
    this.#assertOpen()
    return this.#statement(sql).get(...parameters) as TRow | undefined
  }

  all<TRow extends Record<string, unknown>>(
    sql: string,
    ...parameters: SQLInputValue[]
  ): readonly TRow[] {
    this.#assertOpen()
    return this.#statement(sql).all(...parameters) as TRow[]
  }

  run(sql: string, ...parameters: SQLInputValue[]): void {
    this.#assertOpen()
    this.#statement(sql).run(...parameters)
  }

  transaction<T>(operation: () => T): T {
    this.#assertOpen()
    if (this.#connection.isTransaction) {
      throw new AppError(AppErrorCode.NESTED_TRANSACTION)
    }

    this.#connection.exec('BEGIN IMMEDIATE')
    try {
      const result = operation()
      this.#connection.exec('COMMIT')
      return result
    } catch (error) {
      if (this.#connection.isTransaction) this.#connection.exec('ROLLBACK')
      throw error
    }
  }

  async backupTo(destinationPath: string): Promise<void> {
    this.#assertOpen()
    const sourcePath = this.#connection.location()
    if (!sourcePath) throw new AppError(AppErrorCode.MEMORY_BACKUP_UNSUPPORTED)
    if (resolve(sourcePath) === resolve(destinationPath)) {
      throw new AppError(AppErrorCode.BACKUP_SAME_PATH)
    }

    try {
      await stat(destinationPath)
      throw new AppError(AppErrorCode.BACKUP_DEST_EXISTS)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }

    await backup(this.#connection, destinationPath)

    const validation = new DatabaseSync(destinationPath, { readOnly: true })
    try {
      const row = validation.prepare('PRAGMA integrity_check').get() as
        | { integrity_check?: unknown }
        | undefined
      if (row?.integrity_check !== 'ok') {
        throw new AppError(AppErrorCode.BACKUP_INTEGRITY_FAILED)
      }
    } finally {
      validation.close()
    }
  }

  close(): void {
    if (this.#closed) return
    if (this.#connection.isTransaction) this.#connection.exec('ROLLBACK')
    this.#statements.clear()
    this.#connection.close()
    this.#closed = true
  }

  /** Cache limitado de SQL reutilizado por todas as notas; valores continuam vinculados. */
  #statement(sql: string): StatementSync {
    const existing = this.#statements.get(sql)
    if (existing) return existing
    const prepared = this.#connection.prepare(sql)
    if (this.#statements.size >= 128) this.#statements.delete(this.#statements.keys().next().value!)
    this.#statements.set(sql, prepared)
    return prepared
  }

  #assertOpen(): void {
    if (this.#closed) throw new AppError(AppErrorCode.SQLITE_CONNECTION_CLOSED)
  }
}
