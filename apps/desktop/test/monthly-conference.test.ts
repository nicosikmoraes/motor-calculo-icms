import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CORE_MIGRATIONS, SqliteBatchRepository, SqliteCalculationRepository, SqliteCompanyRepository, SqliteDatabase, SqliteOrganizationRepository, runSqlMigrations } from '@motor/database'
import { createExcelWorkbook } from '@motor/reporting'
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))
vi.mock('../src/main/main-services', () => ({ activeDatabase: vi.fn(), requiredInputText: vi.fn() }))
import { queryMonthlyConference, queryMonthlyReport, validateMonthlyInput } from '../src/main/monthly-conference'
let database: SqliteDatabase, organizationId: string, companyId: string
const now = '2026-10-06T12:00:00.000Z'
beforeEach(() => {
  database = new SqliteDatabase(':memory:'); runSqlMigrations(database, CORE_MIGRATIONS, { appVersion: 'test' })
  organizationId = randomUUID(); companyId = randomUUID()
  new SqliteOrganizationRepository(database).create({ id: organizationId, name: 'Escritório', active: true, createdAt: now, updatedAt: now })
  new SqliteCompanyRepository(database).create({ id: companyId, organizationId, legalName: 'Empresa de teste', cnpj: '11222333000181', state: 'PR', active: true, createdAt: now, updatedAt: now })
})
afterEach(() => database.close())

function addNote(options: { key?: string; hash?: string; month?: string; company?: string; eligible?: boolean; amount?: string; receivedAt?: string } = {}) {
  const batchId = randomUUID(), documentId = randomUUID(), occurrenceId = randomUUID()
  const source = { format: 'NFE_XML_4_00' as const, xmlPath: 'NFe' }
  const key = options.key ?? '1'.repeat(44), hash = options.hash ?? 'a'.repeat(64)
  new SqliteBatchRepository(database).createWithOccurrences({ id: batchId, organizationId, status: 'RECEBIDO', originalName: 'notas.zip',
    receivedAt: options.receivedAt ?? now, createdAt: now, updatedAt: now }, [
    { id: occurrenceId, batchId, originalName: 'nota.xml', relativePath: 'nota.xml', detectedKind: 'XML', origin: 'SELECTED_FILE', contentHash: hash,
      sizeBytes: 100, order: 1, accessKey: key, ingestionStatus: 'PROCESSADA', repetition: 'ORIGINAL',
      contentConflict: 'SEM_CONFLITO', eligibleForTotalsByOccurrencePolicy: options.eligible ?? true, receivedAt: now },
  ], [], [{ id: documentId, batchId, companyId: options.company ?? companyId, occurrenceId, contentHash: hash, eligibleForProcessing: true, createdAt: now,
    normalized: { kind: 'NFE', layoutVersion: '4.00', model: '55', accessKey: key, number: '0001', series: '01', issuedAt: `${options.month ?? '2026-09'}-30T23:30:00-03:00`, environmentCode: '1',
      issuer: { state: 'PR', taxId: '11222333000181', taxIdType: 'CNPJ', taxRegimeCode: '3' },
      recipient: { state: 'PR', taxId: '11444777000161', taxIdType: 'CNPJ' }, declaredTotals: {}, source,
      items: [{ itemNumber: '1', supplierProductCode: '001', productAmount: '1000', declaredIcms: { cst: '00', amount: '120.00' }, source }] } }])
  const run = save(batchId, documentId, options.amount ?? '120.00')
  return { batchId, documentId, run }
}
function save(batchId: string, documentId: string, amount: string, previousRunId?: string) {
  return new SqliteCalculationRepository(database).save({ requestId: randomUUID(), batchId, documentId, engineVersion: 'test',
    ...(previousRunId ? { previousRunId } : {}), items: [{ itemNumber: '1', memory: { schemaVersion: 1, status: 'CALCULATED',
      rule: { id: 'rule', version: 1, legalBasis: 'Teste sintético' }, result: { base: '1000.00', rate: '12', amount },
      deferredAmount: '0.00', inputs: [], steps: [{ name: 'ICMS', operation: 'multiplicação', inputs: {}, result: amount }] } }] })
}
const input = () => ({ companyId, period: '2026-09' })

describe('consulta mensal persistida', () => {
  it('reúne lotes, exclui repetidas e usa a última execução sem apagar o histórico', () => {
    const original = addNote({ receivedAt: '2026-10-01T12:00:00.000Z' })
    addNote({ eligible: false }); addNote({ key: '2'.repeat(44), hash: 'b'.repeat(64) })
    const latest = save(original.batchId, original.documentId, '130.00', original.run.id)
    const result = queryMonthlyConference(database, input())
    expect(result.summary.counts).toMatchObject({ documents: 3, calculated: 2, excluded: 1 })
    expect(result.summary.groups[0]?.totals.calculatedIcms).toBe('250.00')
    expect(result.summary.evidence.find(e => e.documentId === original.documentId)?.runId).toBe(latest.id)
    expect(database.get('SELECT count(*) AS total FROM execucoes_calculo')?.total).toBe(4)
  })
  it('bloqueia conflito com outro mês e rejeita empresa desconhecida e entradas inválidas', () => {
    addNote(); addNote({ hash: 'b'.repeat(64), month: '2026-08' })
    expect(queryMonthlyConference(database, input()).summary.counts.calculated).toBe(0)
    expect(() => queryMonthlyConference(database, { companyId: randomUUID(), period: '2026-09' })).toThrow('organização')
    for (const raw of [null, [], {}, { companyId, period: '2026-13' }, { companyId, period: '0000-01' }, { companyId, period: '2026-09-01' }]) expect(() => validateMonthlyInput(raw)).toThrow()
  })
  it('exporta somente a empresa e mês selecionados com cinco abas e lotes exatos por item', async () => {
    const original = addNote({ receivedAt: '2026-10-01T12:00:00.000Z' })
    const duplicate = addNote({ eligible: false }); addNote({ key: '3'.repeat(44), month: '2026-08' })
    const otherCompany = randomUUID()
    new SqliteCompanyRepository(database).create({ id: otherCompany, organizationId, legalName: 'Outra empresa', cnpj: '11444777000161', state: 'PR', active: true, createdAt: now, updatedAt: now })
    addNote({ company: otherCompany, key: '4'.repeat(44) })
    const report = queryMonthlyReport(database, input(), 'test')
    const book = createExcelWorkbook(report)
    expect(book.worksheets.map(s => s.name)).toEqual(['Resumo', 'Itens', 'Divergências', 'Pendências e exclusões', 'Lotes'])
    expect(report.documents).toHaveLength(2)
    expect(book.getWorksheet('Resumo')?.getCell('G6').value).toBe(120)
    expect(book.getWorksheet('Itens')?.getColumn(10).values).toEqual(expect.arrayContaining([original.batchId, duplicate.batchId]))
    expect(book.getWorksheet('Pendências e exclusões')?.getColumn(10).values).toContain(duplicate.batchId)
    expect(book.getWorksheet('Lotes')?.getColumn(1).values).toEqual(expect.arrayContaining([original.batchId, duplicate.batchId]))
    const before = report.consolidation?.groups[0]?.totals.calculatedIcms
    save(original.batchId, original.documentId, '130.00', original.run.id)
    expect(report.consolidation?.groups[0]?.totals.calculatedIcms).toBe(before)
    expect(queryMonthlyConference(database, input()).summary.groups[0]?.totals.calculatedIcms).toBe('130.00')
  })
  it('conta uma cópia elegível sem promover a repetida bloqueada pelo processamento', () => {
    addNote({ receivedAt: '2026-10-01T12:00:00.000Z' })
    const duplicate = addNote({ eligible: false })
    database.run('UPDATE documentos_fiscais SET elegivel_processamento = 0, motivo_exclusao_pendencia = ? WHERE id = ?', 'OCORRENCIA_INELEGIVEL', duplicate.documentId)
    expect(queryMonthlyConference(database, input()).summary.counts.calculated).toBe(1)
  })
  it('sinaliza evento órfão de outro lote e preserva o evento sem associação ou efeito fiscal automático', () => {
    addNote()
    const batchId = randomUUID(), occurrenceId = randomUUID(), artifactId = randomUUID()
    new SqliteBatchRepository(database).createWithOccurrences({ id: batchId, organizationId, status: 'RECEBIDO', receivedAt: now, createdAt: now, updatedAt: now }, [{
      id: occurrenceId, batchId, originalName: 'evento.xml', relativePath: 'evento.xml', detectedKind: 'XML', origin: 'SELECTED_FILE',
      contentHash: 'b'.repeat(64), sizeBytes: 100, order: 1, accessKey: '1'.repeat(44), ingestionStatus: 'PENDENTE', repetition: 'ORIGINAL',
      contentConflict: 'SEM_CONFLITO', eligibleForTotalsByOccurrencePolicy: true, receivedAt: now,
    }], [], [], [{ id: artifactId, batchId, occurrenceId, association: 'ORPHAN', contentHash: 'b'.repeat(64), createdAt: now,
      normalized: { kind: 'EVENT', envelope: 'PROC_EVENTO_NFE', version: '1.00', accessKey: '1'.repeat(44), environmentCode: '1', eventType: '110111', statusCode: '135' } }])
    const result = queryMonthlyConference(database, input())
    expect(result.summary.counts.calculated).toBe(0)
    expect(result.batches).toHaveLength(2)
    expect(result.summary.evidence[0]?.reasons[0]).toContain(batchId)
    expect(new SqliteBatchRepository(database).listDocumentArtifacts(batchId)[0]?.association).toBe('ORPHAN')
    expect(createExcelWorkbook(queryMonthlyReport(database, input(), 'test')).getWorksheet('Lotes')?.getColumn(1).values).toContain(batchId)
  })
  it('retorna e exporta mês vazio com identificação e sem criar execuções fiscais', () => {
    const report = queryMonthlyReport(database, input(), 'test')
    expect(report.documents).toEqual([])
    expect(createExcelWorkbook(report).getWorksheet('Itens')?.getCell('A6').value).toBe('Nenhum registro nesta aba.')
    expect(database.get('SELECT count(*) AS total FROM execucoes_calculo')?.total).toBe(0)
  })
})
