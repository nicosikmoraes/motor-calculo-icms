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
    environmentCode: '1',
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
      'diagnosticos_ingestao',
      'documentos_fiscais',
      'empresas',
      'execucoes_calculo',
      'itens_documento',
      'lotes',
      'ocorrencias_arquivo',
      'organizacoes',
      'perfis_fiscais',
      'produtos_fornecedor',
      'resultados_item_calculo',
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

  it('mantém uma organização local e permite renomeá-la', () => {
    const organizations = new SqliteOrganizationRepository(database)
    organizations.createSingle(organization())

    expect(organizations.findSingle()).toEqual(organization())
    expect(() =>
      organizations.createSingle({
        ...organization(),
        id: '00000000-0000-4000-8000-000000000010',
      }),
    ).toThrow(/já foi configurada/)

    const updatedAt = '2026-09-22T21:00:00.000Z'
    organizations.rename(organizationId, 'Novo nome do escritório', updatedAt)
    expect(organizations.findSingle()).toMatchObject({
      name: 'Novo nome do escritório',
      updatedAt,
    })
  })

  it('lista empresas da organização em ordem alfabética', () => {
    const organizations = new SqliteOrganizationRepository(database)
    const companies = new SqliteCompanyRepository(database)
    organizations.createSingle(organization())
    companies.create({ ...company(), legalName: 'Zeta Ltda.' })
    companies.create({
      ...company(),
      id: '00000000-0000-4000-8000-000000000011',
      legalName: 'Alfa Ltda.',
      cnpj: '45.723.174/0001-10',
    })

    expect(companies.listByOrganization(organizationId).map(({ legalName }) => legalName)).toEqual([
      'Alfa Ltda.',
      'Zeta Ltda.',
    ])
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
      environmentCode: '1',
      totalFiles: 2,
      totalDocuments: 0,
      totalPendencies: 0,
    })
    expect(batches.listOccurrences(batchId).map(({ id }) => id)).toEqual([
      firstOccurrenceId,
      secondOccurrenceId,
    ])
    expect(batches.listByOrganization(organizationId).map(({ id }) => id)).toEqual([batchId])
  })

  it('persiste diagnósticos e atualiza os totais do lote atomicamente', () => {
    seedRegistrations()
    const batches = new SqliteBatchRepository(database)
    batches.createWithOccurrences(
      batch(),
      [occurrence({ id: firstOccurrenceId, order: 1, accessKey: '1'.repeat(44) })],
      [{
        id: '00000000-0000-4000-8000-000000000012',
        batchId,
        source: 'nota.xml',
        code: 'ASSINATURA_NAO_VERIFICADA',
        message: 'Assinatura não verificada no MVP.',
        createdAt: timestamp,
      }],
    )

    expect(batches.findById(batchId)).toMatchObject({
      totalFiles: 1,
      totalDocuments: 1,
      totalPendencies: 1,
    })
    expect(batches.listDiagnostics(batchId)).toEqual([
      expect.objectContaining({ code: 'ASSINATURA_NAO_VERIFICADA', source: 'nota.xml' }),
    ])
  })

  it('preserva empresas diferentes dentro do mesmo lote', () => {
    seedRegistrations()
    const secondCompanyId = '00000000-0000-4000-8000-000000000020'
    new SqliteCompanyRepository(database).create({
      ...company(),
      id: secondCompanyId,
      cnpj: '11444777000161',
      legalName: 'Segunda empresa Ltda.',
    })
    const documentBase = {
      kind: 'NFE' as const,
      layoutVersion: '4.00' as const,
      model: '55' as const,
      series: '1',
      environmentCode: '1',
      items: [],
      declaredTotals: {},
      source: { format: 'NFE_XML_4_00' as const, xmlPath: 'NFe.infNFe' },
    }
    const batches = new SqliteBatchRepository(database)
    batches.createWithOccurrences(
      batch(),
      [
        occurrence({ id: firstOccurrenceId, order: 1, accessKey: '1'.repeat(44) }),
        occurrence({ id: secondOccurrenceId, order: 2, accessKey: '2'.repeat(44) }),
      ],
      [],
      [
        {
          id: '00000000-0000-4000-8000-000000000021',
          batchId,
          occurrenceId: firstOccurrenceId,
          companyId,
          contentHash: '1'.repeat(64),
          normalized: { ...documentBase, accessKey: '1'.repeat(44), number: '1',
            issuer: { taxId: '11222333000181', taxIdType: 'CNPJ' as const, state: 'PR' } },
          eligibleForProcessing: true,
          createdAt: timestamp,
        },
        {
          id: '00000000-0000-4000-8000-000000000022',
          batchId,
          occurrenceId: secondOccurrenceId,
          companyId: secondCompanyId,
          contentHash: '2'.repeat(64),
          normalized: { ...documentBase, accessKey: '2'.repeat(44), number: '2',
            issuer: { taxId: '11444777000161', taxIdType: 'CNPJ' as const, state: 'PR' } },
          eligibleForProcessing: true,
          createdAt: timestamp,
        },
      ],
    )
    expect(batches.listNormalizedDocuments(batchId).map((document) => document.companyId).sort())
      .toEqual([companyId, secondCompanyId])
    expect(batches.countCompaniesByBatch(batchId)).toBe(2)
    expect(batches.findById(batchId)?.totalDocuments).toBe(2)
  })

  it('preserva ocorrências e diagnóstico quando a importação é cancelada', () => {
    seedRegistrations()
    const batches = new SqliteBatchRepository(database)
    batches.createWithOccurrences(
      batch({ status: 'CANCELADO', lastCanceledAt: timestamp }),
      [occurrence({ id: firstOccurrenceId, order: 1 })],
      [{
        id: '00000000-0000-4000-8000-000000000023',
        batchId,
        source: 'lote',
        code: 'IMPORTACAO_CANCELADA',
        message: 'Importação interrompida pelo usuário.',
        createdAt: timestamp,
      }],
    )

    expect(batches.findById(batchId)).toMatchObject({
      status: 'CANCELADO',
      lastCanceledAt: timestamp,
      totalFiles: 1,
      totalPendencies: 1,
    })
    expect(batches.listOccurrences(batchId)).toHaveLength(1)
    expect(batches.listDiagnostics(batchId)).toEqual([
      expect.objectContaining({ code: 'IMPORTACAO_CANCELADA' }),
    ])
  })

  it('persiste e reconstitui documento normalizado com seus itens', () => {
    seedRegistrations()
    const batches = new SqliteBatchRepository(database)
    const accessKey = '1'.repeat(44)
    const documentId = '00000000-0000-4000-8000-000000000013'
    const normalized = {
      kind: 'NFE' as const,
      layoutVersion: '4.00' as const,
      model: '55' as const,
      accessKey,
      number: '123',
      series: '1',
      environmentCode: '1',
      issuer: { taxId: '11222333000181', taxIdType: 'CNPJ' as const, state: 'PR' },
      items: [{
        itemNumber: '1', supplierProductCode: 'ABC', description: 'Produto sintético',
        ncm: '12345678', cfop: '5102', productAmount: '10.00',
        declaredIcms: { group: 'ICMS00', cst: '00', amount: '1.80' },
        source: { format: 'NFE_XML_4_00' as const, xmlPath: 'NFe.infNFe.det[1]' },
      }],
      declaredTotals: { productAmount: '10.00', icmsAmount: '1.80' },
      source: { format: 'NFE_XML_4_00' as const, xmlPath: 'NFe.infNFe' },
    }
    batches.createWithOccurrences(
      batch(),
      [occurrence({ id: firstOccurrenceId, order: 1, accessKey })],
      [],
      [{
        id: documentId,
        batchId,
        occurrenceId: firstOccurrenceId,
        contentHash: '1'.repeat(64),
        normalized,
        eligibleForProcessing: true,
        createdAt: timestamp,
      }],
    )

    expect(batches.listNormalizedDocuments(batchId)).toEqual([
      expect.objectContaining({ id: documentId, normalized, eligibleForProcessing: true }),
    ])
    expect(database.get<{ total: number }>(
      'SELECT count(*) AS total FROM itens_documento WHERE documento_id = ?',
      documentId,
    )?.total).toBe(1)
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
