import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  CORE_MIGRATIONS,
  SqliteBatchRepository,
  SqliteCompanyRepository,
  SqliteDatabase,
  SqliteOrganizationRepository,
  runSqlMigrations,
  type FileOccurrenceRecord,
  type FiscalBatchRecord,
} from '../src'

const timestamp = '2026-09-21T18:00:00.000Z'
const organizationId = '00000000-0000-4000-8000-000000000001'
const companyId = '00000000-0000-4000-8000-000000000002'
const batchId = '00000000-0000-4000-8000-000000000003'
const firstOccurrenceId = '00000000-0000-4000-8000-000000000004'
const secondOccurrenceId = '00000000-0000-4000-8000-000000000005'

let database: SqliteDatabase

function migrate(target: SqliteDatabase): void {
  runSqlMigrations(target, CORE_MIGRATIONS, {
    appVersion: '0.1.0-test',
    now: () => new Date(timestamp),
  })
}

function organization() {
  return {
    id: organizationId,
    name: 'Escritório sintético',
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function company() {
  return {
    id: companyId,
    organizationId,
    legalName: 'Empresa sintética Ltda.',
    tradeName: 'Empresa sintética',
    cnpj: '11.222.333/0001-81',
    state: 'PR' as const,
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function batch(
  values: Partial<Omit<FiscalBatchRecord, 'totalFiles' | 'totalDocuments' | 'totalPendencies'>> = {},
): Omit<FiscalBatchRecord, 'totalFiles' | 'totalDocuments' | 'totalPendencies'> {
  return {
    id: batchId,
    organizationId,
    companyId,
    originalName: 'lote-setembro',
    receivedAt: timestamp,
    status: 'RECEBIDO',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...values,
  }
}

function occurrence(
  values: Partial<FileOccurrenceRecord> & Pick<FileOccurrenceRecord, 'id' | 'order'>,
): FileOccurrenceRecord {
  return {
    id: values.id,
    batchId,
    originalName: `nota-${values.order}.xml`,
    relativePath: `entrada/nota-${values.order}.xml`,
    detectedKind: 'XML',
    origin: 'FOLDER_FILE',
    contentHash: String(values.order).repeat(64),
    sizeBytes: 1_024,
    order: values.order,
    ingestionStatus: 'INVENTARIADA',
    repetition: 'NAO_CLASSIFICADA',
    contentConflict: 'NAO_CLASSIFICADO',
    eligibleForTotalsByOccurrencePolicy: false,
    receivedAt: timestamp,
    ...values,
  }
}

function seedRegistrations(target = database): void {
  new SqliteOrganizationRepository(target).create(organization())
  new SqliteCompanyRepository(target).create(company())
}

beforeEach(() => {
  database = new SqliteDatabase(':memory:')
  migrate(database)
})

afterEach(() => database.close())

describe('migrations e repositórios centrais', () => {
  it('cria as tabelas e índices do núcleo persistente', () => {
    const tables = database
      .all<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .map(({ name }) => name)
    const indexes = database
      .all<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%' ORDER BY name",
      )
      .map(({ name }) => name)

    expect(tables).toEqual([
      'empresas',
      'lotes',
      'ocorrencias_arquivo',
      'organizacoes',
      'schema_migrations',
    ])
    expect(indexes).toContain('idx_ocorrencias_lote_chave')
    expect(indexes).toContain('idx_ocorrencias_lote_hash')
  })

  it('cria, consulta e inativa organização e empresa', () => {
    const organizations = new SqliteOrganizationRepository(database)
    const companies = new SqliteCompanyRepository(database)
    organizations.create(organization())
    companies.create(company())

    expect(organizations.findById(organizationId)).toEqual(organization())
    expect(companies.findByCnpj(organizationId, '11222333000181')).toMatchObject({
      id: companyId,
      cnpj: '11222333000181',
      state: 'PR',
      active: true,
    })

    companies.inactivate(companyId, '2026-09-22T12:00:00.000Z')
    expect(companies.findById(companyId)).toMatchObject({
      active: false,
      inactivatedAt: '2026-09-22T12:00:00.000Z',
    })
  })

  it('cria lote e ocorrências na ordem canônica', () => {
    seedRegistrations()
    const batches = new SqliteBatchRepository(database)
    batches.createWithOccurrences(batch(), [
      occurrence({ id: secondOccurrenceId, order: 2 }),
      occurrence({ id: firstOccurrenceId, order: 1 }),
    ])

    expect(batches.findById(batchId)).toMatchObject({
      id: batchId,
      companyId,
      totalFiles: 2,
      totalDocuments: 0,
      totalPendencies: 0,
    })
    expect(batches.listOccurrences(batchId).map(({ id }) => id)).toEqual([
      firstOccurrenceId,
      secondOccurrenceId,
    ])
  })

  it('cancela e retoma lote preservando checkpoints e data do cancelamento', () => {
    seedRegistrations()
    const batches = new SqliteBatchRepository(database)
    batches.createWithOccurrences(batch({ status: 'PROCESSANDO' }), [
      occurrence({ id: firstOccurrenceId, order: 1, ingestionStatus: 'PROCESSADA' }),
      occurrence({ id: secondOccurrenceId, order: 2 }),
    ])

    const canceledAt = '2026-09-22T20:00:00.000Z'
    batches.cancel(batchId, canceledAt)
    expect(batches.findById(batchId)).toMatchObject({
      status: 'CANCELADO',
      lastCanceledAt: canceledAt,
    })
    expect(batches.listOccurrences(batchId).map(({ ingestionStatus }) => ingestionStatus)).toEqual([
      'PROCESSADA',
      'INVENTARIADA',
    ])

    const resumedAt = '2026-09-22T20:05:00.000Z'
    batches.resume(batchId, resumedAt)
    expect(batches.findById(batchId)).toMatchObject({
      status: 'PROCESSANDO',
      lastCanceledAt: canceledAt,
      updatedAt: resumedAt,
    })
  })

  it('recusa cancelamento ou retomada em estados incompatíveis', () => {
    seedRegistrations()
    const batches = new SqliteBatchRepository(database)
    batches.createWithOccurrences(batch({ status: 'CONCLUIDO' }), [])

    expect(() => batches.cancel(batchId, timestamp)).toThrow(/não permite cancelamento/)
    expect(() => batches.resume(batchId, timestamp)).toThrow(/não permite retomada/)
  })

  it('desfaz o lote inteiro quando uma ocorrência viola restrição', () => {
    seedRegistrations()
    const batches = new SqliteBatchRepository(database)

    expect(() =>
      batches.createWithOccurrences(batch(), [
        occurrence({ id: firstOccurrenceId, order: 1 }),
        occurrence({ id: secondOccurrenceId, order: 1 }),
      ]),
    ).toThrow(/UNIQUE constraint failed/)

    expect(batches.findById(batchId)).toBeUndefined()
    expect(batches.listOccurrences(batchId)).toEqual([])
  })

  it('impede associar ao lote empresa de outra organização', () => {
    seedRegistrations()
    const otherOrganizationId = '00000000-0000-4000-8000-000000000010'
    new SqliteOrganizationRepository(database).create({
      ...organization(),
      id: otherOrganizationId,
      name: 'Outro escritório',
    })

    expect(() =>
      new SqliteBatchRepository(database).createWithOccurrences(
        batch({ organizationId: otherOrganizationId }),
        [],
      ),
    ).toThrow(/FOREIGN KEY constraint failed/)
  })

  it('preserva referências históricas contra exclusão em cascata', () => {
    seedRegistrations()
    expect(() => database.run('DELETE FROM organizacoes WHERE id = ?', organizationId)).toThrow(
      /FOREIGN KEY constraint failed/,
    )
    expect(new SqliteOrganizationRepository(database).findById(organizationId)).toBeDefined()
  })

  it('mantém lote e ocorrências depois de fechar e reabrir o arquivo', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'motor-icms-core-'))
    const path = join(directory, 'motor-icms.sqlite')
    const first = new SqliteDatabase(path)
    try {
      migrate(first)
      seedRegistrations(first)
      new SqliteBatchRepository(first).createWithOccurrences(batch(), [
        occurrence({ id: firstOccurrenceId, order: 1 }),
      ])
    } finally {
      first.close()
    }

    const reopened = new SqliteDatabase(path)
    try {
      migrate(reopened)
      expect(new SqliteBatchRepository(reopened).findById(batchId)?.totalFiles).toBe(1)
      expect(new SqliteBatchRepository(reopened).listOccurrences(batchId)).toHaveLength(1)
    } finally {
      reopened.close()
      await rm(directory, { recursive: true, force: true })
    }
  })
})
