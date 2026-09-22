import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  CORE_MIGRATIONS,
  SqliteDatabase,
  createSqlMigration,
  discoverSqlMigrations,
  runSqlMigrations,
  runSqlMigrationsWithBackup,
} from '../src'

const temporaryDirectories: string[] = []
const migrationOptions = {
  appVersion: '0.1.0-test',
  now: () => new Date('2026-09-21T18:00:00.000Z'),
}

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'motor-icms-database-'))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  )
})

describe('SQLite e migrations', () => {
  it('cria o banco vazio e a tabela de controle', () => {
    const database = new SqliteDatabase(':memory:')
    try {
      const result = runSqlMigrations(database, [], migrationOptions)
      const table = database.get<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'",
      )

      expect(result).toEqual({ applied: [], alreadyApplied: [] })
      expect(table?.name).toBe('schema_migrations')
    } finally {
      database.close()
    }
  })

  it('aplica migrations em ordem de versão', () => {
    const database = new SqliteDatabase(':memory:')
    const first = createSqlMigration({
      version: 1,
      name: 'cria_exemplo',
      sql: 'CREATE TABLE exemplo (id TEXT PRIMARY KEY) STRICT;',
    })
    const second = createSqlMigration({
      version: 2,
      name: 'adiciona_nome',
      sql: 'ALTER TABLE exemplo ADD COLUMN nome TEXT;',
    })

    try {
      const result = runSqlMigrations(database, [second, first], migrationOptions)
      const columns = database.all<{ name: string }>('PRAGMA table_info(exemplo)')

      expect(result.applied.map(({ version }) => version)).toEqual([1, 2])
      expect(columns.map(({ name }) => name)).toEqual(['id', 'nome'])
    } finally {
      database.close()
    }
  })

  it('não reaplica migrations concluídas', () => {
    const database = new SqliteDatabase(':memory:')
    const migration = createSqlMigration({
      version: 1,
      name: 'cria_exemplo',
      sql: 'CREATE TABLE exemplo (id TEXT PRIMARY KEY) STRICT;',
    })

    try {
      const first = runSqlMigrations(database, [migration], migrationOptions)
      const second = runSqlMigrations(database, [migration], migrationOptions)
      const count = database.get<{ total: number }>(
        'SELECT count(*) AS total FROM schema_migrations',
      )

      expect(first.applied).toHaveLength(1)
      expect(second.applied).toHaveLength(0)
      expect(second.alreadyApplied).toHaveLength(1)
      expect(count?.total).toBe(1)
    } finally {
      database.close()
    }
  })

  it('recusa migration aplicada cujo conteúdo foi alterado', () => {
    const database = new SqliteDatabase(':memory:')
    const original = createSqlMigration({
      version: 1,
      name: 'cria_exemplo',
      sql: 'CREATE TABLE exemplo (id TEXT PRIMARY KEY) STRICT;',
    })
    const altered = createSqlMigration({
      version: 1,
      name: 'cria_exemplo',
      sql: 'CREATE TABLE exemplo (id INTEGER PRIMARY KEY) STRICT;',
    })

    try {
      runSqlMigrations(database, [original], migrationOptions)
      expect(() => runSqlMigrations(database, [altered], migrationOptions)).toThrow(
        /foi alterada/,
      )
    } finally {
      database.close()
    }
  })

  it('desfaz integralmente a migration que falhar', () => {
    const database = new SqliteDatabase(':memory:')
    const broken = createSqlMigration({
      version: 1,
      name: 'migration_com_falha',
      sql: `
        CREATE TABLE tabela_temporaria (id TEXT PRIMARY KEY) STRICT;
        INSERT INTO tabela_inexistente (id) VALUES ('erro');
      `,
    })

    try {
      expect(() => runSqlMigrations(database, [broken], migrationOptions)).toThrow()
      const transientTable = database.get<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'tabela_temporaria'",
      )
      const count = database.get<{ total: number }>(
        'SELECT count(*) AS total FROM schema_migrations',
      )

      expect(transientTable).toBeUndefined()
      expect(count?.total).toBe(0)
    } finally {
      database.close()
    }
  })

  it('recusa numeração duplicada durante a descoberta', async () => {
    const directory = await temporaryDirectory()
    await Promise.all([
      writeFile(join(directory, '0001_primeira.sql'), 'SELECT 1;', 'utf8'),
      writeFile(join(directory, '0001_segunda.sql'), 'SELECT 2;', 'utf8'),
    ])

    await expect(discoverSqlMigrations(directory)).rejects.toThrow(
      /Versão de migration duplicada: 1/,
    )
  })

  it('recusa lacunas e controle de transação dentro do SQL', () => {
    const database = new SqliteDatabase(':memory:')
    try {
      expect(() =>
        runSqlMigrations(
          database,
          [
            createSqlMigration({
              version: 2,
              name: 'sem_primeira',
              sql: 'SELECT 2;',
            }),
          ],
          migrationOptions,
        ),
      ).toThrow(/esperada versão 1, encontrada 2/)

      expect(() =>
        runSqlMigrations(
          database,
          [
            createSqlMigration({
              version: 1,
              name: 'controla_transacao',
              sql: 'BEGIN; SELECT 1; COMMIT;',
            }),
          ],
          migrationOptions,
        ),
      ).toThrow(/contém controle de transação/)
    } finally {
      database.close()
    }
  })

  it('preserva schema e histórico depois de fechar e reabrir', async () => {
    const directory = await temporaryDirectory()
    const databasePath = join(directory, 'motor-icms.sqlite')
    const migration = createSqlMigration({
      version: 1,
      name: 'cria_exemplo',
      sql: 'CREATE TABLE exemplo (id TEXT PRIMARY KEY) STRICT;',
    })

    const firstConnection = new SqliteDatabase(databasePath)
    runSqlMigrations(firstConnection, [migration], migrationOptions)
    firstConnection.run("INSERT INTO exemplo (id) VALUES ('persistido')")
    firstConnection.close()

    const secondConnection = new SqliteDatabase(databasePath)
    try {
      const row = secondConnection.get<{ id: string }>(
        "SELECT id FROM exemplo WHERE id = 'persistido'",
      )
      const history = runSqlMigrations(secondConnection, [migration], migrationOptions)

      expect(row?.id).toBe('persistido')
      expect(history.applied).toHaveLength(0)
      expect(history.alreadyApplied).toHaveLength(1)
    } finally {
      secondConnection.close()
    }
  })

  it('mantém chaves estrangeiras habilitadas', () => {
    const database = new SqliteDatabase(':memory:')
    try {
      database.exec(`
        CREATE TABLE pai (id TEXT PRIMARY KEY) STRICT;
        CREATE TABLE filho (
          id TEXT PRIMARY KEY,
          pai_id TEXT NOT NULL REFERENCES pai(id) ON DELETE RESTRICT
        ) STRICT;
      `)

      expect(() =>
        database.run("INSERT INTO filho (id, pai_id) VALUES ('f-1', 'inexistente')"),
      ).toThrow(/FOREIGN KEY constraint failed/)
    } finally {
      database.close()
    }
  })

  it('migra lote existente para CANCELADO sem perder ocorrências', () => {
    const database = new SqliteDatabase(':memory:')
    const organizationId = '00000000-0000-4000-8000-000000000001'
    const companyId = '00000000-0000-4000-8000-000000000002'
    const batchId = '00000000-0000-4000-8000-000000000003'
    const occurrenceId = '00000000-0000-4000-8000-000000000004'
    const timestamp = '2026-09-21T18:00:00.000Z'

    try {
      runSqlMigrations(database, [CORE_MIGRATIONS[0]!], migrationOptions)
      database.run(
        `INSERT INTO organizacoes (id, nome, criado_em, atualizado_em)
         VALUES (?, 'Escritório sintético', ?, ?)`,
        organizationId,
        timestamp,
        timestamp,
      )
      database.run(
        `INSERT INTO empresas (
           id, organizacao_id, razao_social, cnpj, uf, criado_em, atualizado_em
         ) VALUES (?, ?, 'Empresa sintética', '11222333000181', 'PR', ?, ?)`,
        companyId,
        organizationId,
        timestamp,
        timestamp,
      )
      database.run(
        `INSERT INTO lotes (
           id, organizacao_id, empresa_id, recebido_em, status, criado_em, atualizado_em
         ) VALUES (?, ?, ?, ?, 'PROCESSANDO', ?, ?)`,
        batchId,
        organizationId,
        companyId,
        timestamp,
        timestamp,
        timestamp,
      )
      database.run(
        `INSERT INTO ocorrencias_arquivo (
           id, lote_id, nome_original, caminho_relativo, tipo_detectado, origem,
           hash_conteudo, tamanho_bytes, ordem_no_envio, recebido_em
         ) VALUES (?, ?, 'nota.xml', 'nota.xml', 'XML', 'SELECTED_FILE', ?, 6, 1, ?)`,
        occurrenceId,
        batchId,
        'a'.repeat(64),
        timestamp,
      )

      const result = runSqlMigrations(database, CORE_MIGRATIONS, migrationOptions)
      database.run(
        `UPDATE lotes
         SET status = 'CANCELADO', ultimo_cancelamento_em = ?, atualizado_em = ?
         WHERE id = ?`,
        timestamp,
        timestamp,
        batchId,
      )

      expect(result.applied.map(({ version }) => version)).toEqual([2])
      expect(database.get<{ status: string }>('SELECT status FROM lotes WHERE id = ?', batchId))
        .toEqual({ status: 'CANCELADO' })
      expect(
        database.get<{ lote_id: string }>(
          'SELECT lote_id FROM ocorrencias_arquivo WHERE id = ?',
          occurrenceId,
        ),
      ).toEqual({ lote_id: batchId })
      expect(database.get<{ integrity_check: string }>('PRAGMA integrity_check')).toEqual({
        integrity_check: 'ok',
      })
    } finally {
      database.close()
    }
  })

  it('cria e valida backup antes de migrar um banco existente', async () => {
    const directory = await temporaryDirectory()
    const databasePath = join(directory, 'motor-icms.sqlite')
    const backupPath = join(directory, 'motor-icms.pre-migration.sqlite')
    const database = new SqliteDatabase(databasePath)
    database.exec(`
      CREATE TABLE legado (id TEXT PRIMARY KEY) STRICT;
      INSERT INTO legado (id) VALUES ('preservado');
    `)
    const migration = createSqlMigration({
      version: 1,
      name: 'evolui_legado',
      sql: 'ALTER TABLE legado ADD COLUMN nome TEXT;',
    })

    try {
      await runSqlMigrationsWithBackup(database, [migration], {
        ...migrationOptions,
        backupPath,
      })
      expect(database.all<{ name: string }>('PRAGMA table_info(legado)').map(({ name }) => name)).toEqual([
        'id',
        'nome',
      ])
    } finally {
      database.close()
    }

    const backupDatabase = new SqliteDatabase(backupPath, { readOnly: true })
    try {
      expect(
        backupDatabase.all<{ name: string }>('PRAGMA table_info(legado)').map(({ name }) => name),
      ).toEqual(['id'])
      expect(backupDatabase.get<{ id: string }>('SELECT id FROM legado')?.id).toBe('preservado')
    } finally {
      backupDatabase.close()
    }
  })
})
