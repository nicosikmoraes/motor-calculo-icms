import { resolve } from 'node:path'
import { stat } from 'node:fs/promises'
import { DatabaseSync, backup, type SQLInputValue } from 'node:sqlite'

export interface SqliteDatabaseOptions {
  readOnly?: boolean
  timeoutMilliseconds?: number
}

export class SqliteDatabase {
  readonly #connection: DatabaseSync
  #closed = false

  constructor(path: string, options: SqliteDatabaseOptions = {}) {
    const timeout = options.timeoutMilliseconds ?? 5_000
    if (!Number.isSafeInteger(timeout) || timeout < 0) {
      throw new Error('timeoutMilliseconds deve ser um inteiro não negativo.')
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
      throw new Error('Não foi possível habilitar as chaves estrangeiras do SQLite.')
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
    return this.#connection.prepare(sql).get(...parameters) as TRow | undefined
  }

  all<TRow extends Record<string, unknown>>(
    sql: string,
    ...parameters: SQLInputValue[]
  ): readonly TRow[] {
    this.#assertOpen()
    return this.#connection.prepare(sql).all(...parameters) as TRow[]
  }

  run(sql: string, ...parameters: SQLInputValue[]): void {
    this.#assertOpen()
    this.#connection.prepare(sql).run(...parameters)
  }

  transaction<T>(operation: () => T): T {
    this.#assertOpen()
    if (this.#connection.isTransaction) {
      throw new Error('Transações aninhadas não são permitidas.')
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
    if (!sourcePath) throw new Error('Banco em memória não pode gerar backup persistente.')
    if (resolve(sourcePath) === resolve(destinationPath)) {
      throw new Error('O backup não pode sobrescrever o banco de origem.')
    }

    try {
      await stat(destinationPath)
      throw new Error('O destino do backup já existe e não será sobrescrito.')
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
        throw new Error('O backup SQLite criado não passou na verificação de integridade.')
      }
    } finally {
      validation.close()
    }
  }

  close(): void {
    if (this.#closed) return
    if (this.#connection.isTransaction) this.#connection.exec('ROLLBACK')
    this.#connection.close()
    this.#closed = true
  }

  #assertOpen(): void {
    if (this.#closed) throw new Error('A conexão SQLite está fechada.')
  }
}
