import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CORE_MIGRATIONS, SqliteBatchRepository, SqliteCalculationRepository, SqliteCompanyRepository, SqliteConflictResolutionRepository,
  SqliteDatabase, SqliteOrganizationRepository, runSqlMigrations, type NormalizedFiscalDocumentRecord } from '@motor/database'
import type { NormalizedDocumentArtifact, NormalizedNfe } from '@motor/domain'
import type { DocumentConflictSummary } from '@motor/contracts'
import { createExcelWorkbook } from '@motor/reporting'
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))
vi.mock('../src/main/main-services', () => ({ activeDatabase: vi.fn(), requiredInputText: vi.fn() }))
import { listDocumentConflicts, saveConflictResolution, validateConflictResolutionInput } from '../src/main/conflict-resolution-use-cases'
import { listDocumentReviews, saveDocumentReview } from '../src/main/document-review-use-cases'
import { queryMonthlyConference, queryMonthlyReport } from '../src/main/monthly-conference'
import { queryBatchDetail } from '../src/main/batch-query-handlers'
import { getItemFiscalContext } from '../src/main/item-fiscal-use-cases'
import { compareConflictDocuments } from '../src/main/conflict-comparison'
let database: SqliteDatabase, organizationId: string, companyId: string
const now = '2026-10-07T12:00:00.000Z', accessKey = '1'.repeat(44)
beforeEach(() => {
  database = new SqliteDatabase(':memory:'); runSqlMigrations(database, CORE_MIGRATIONS, { appVersion: 'test' })
  organizationId = randomUUID(); companyId = randomUUID()
  new SqliteOrganizationRepository(database).create({ id: organizationId, name: 'Escritório', active: true, createdAt: now, updatedAt: now })
  new SqliteCompanyRepository(database).create({ id: companyId, organizationId, legalName: 'Empresa de teste', cnpj: '11222333000181', state: 'PR', active: true, createdAt: now, updatedAt: now })
})
afterEach(() => { database.close(); vi.restoreAllMocks() })
function notes(hashes: string[], changes: Partial<NormalizedNfe> = {}, company = companyId, organization = organizationId, environment = '1', pending?: string) {
  const batchId = randomUUID(), source = { format: 'NFE_XML_4_00' as const, xmlPath: 'NFe' }
  const occurrences = hashes.map((hash, index) => ({ id: randomUUID(), batchId, originalName: `nota-${index}.xml`, relativePath: `nota-${index}.xml`,
    detectedKind: 'XML' as const, origin: 'SELECTED_FILE' as const, contentHash: hash.repeat(64), sizeBytes: 100, order: index + 1, accessKey,
    ingestionStatus: 'PROCESSADA' as const, repetition: 'ORIGINAL' as const, contentConflict: hashes.length > 1 ? 'CONFLITO_CONTEUDO' as const : 'SEM_CONFLITO' as const,
    eligibleForTotalsByOccurrencePolicy: hashes.length === 1, receivedAt: now }))
  const documents: NormalizedFiscalDocumentRecord[] = occurrences.map((file, index) => ({ id: randomUUID(), batchId, companyId: company,
    occurrenceId: file.id, contentHash: file.contentHash, eligibleForProcessing: !pending && hashes.length === 1,
    ...((pending || hashes.length > 1) ? { pendingReason: pending ?? 'OCORRENCIA_INELEGIVEL' } : {}), createdAt: now,
    normalized: { kind: 'NFE', layoutVersion: '4.00', model: '55', accessKey, number: '123', series: '1', issuedAt: '2026-09-30T10:00:00-03:00', environmentCode: environment,
      operationDirection: '1', purposeCode: '1', finalConsumerIndicator: '0', issuer: { state: 'PR', taxId: '11222333000181', taxIdType: 'CNPJ', taxRegimeCode: '3' },
      recipient: { state: 'PR', taxId: '11444777000161', taxIdType: 'CNPJ', stateRegistrationIndicator: '1' }, declaredTotals: { documentAmount: String(1000 + index * 100) }, source,
      items: [{ itemNumber: '1', supplierProductCode: '001', cfop: '5102', description: 'Produto teste', productAmount: String(1000 + index * 100), declaredIcms: { cst: '00', amount: '195.00' }, source }], ...changes } }))
  new SqliteBatchRepository(database).createWithOccurrences({ id: batchId, organizationId: organization, status: 'RECEBIDO', originalName: 'Lote de teste', environmentCode: environment as '1' | '2', receivedAt: now, createdAt: now, updatedAt: now }, occurrences, [], documents)
  for (const document of documents) new SqliteCalculationRepository(database).save({ requestId: randomUUID(), batchId, documentId: document.id, engineVersion: 'PR_COMMON_2', items: [{ itemNumber: '1', memory: {
    schemaVersion: 1, status: 'CALCULATED', rule: { id: 'test', version: 1, legalBasis: 'Caso sintético' }, result: { base: '1000.00', rate: '19.5', amount: '195.00' },
    inputs: [], steps: [{ name: 'ICMS', operation: 'Caso sintético', inputs: {}, result: '195.00' }] } }] })
  return documents
}
function event(document: NormalizedFiscalDocumentRecord, overrides: Partial<NormalizedDocumentArtifact> = {}, associated = true) {
  const id = randomUUID(), batchId = randomUUID(), occurrenceId = randomUUID()
  // Eventos confirmados entre lotes usam a API auditada, mantendo a associação importada órfã.
  new SqliteBatchRepository(database).createWithOccurrences({ id: batchId, organizationId, status: 'RECEBIDO', environmentCode: '1', receivedAt: now, createdAt: now, updatedAt: now },
    [{ id: occurrenceId, batchId, originalName: 'evento.xml', relativePath: 'evento.xml', detectedKind: 'XML', origin: 'SELECTED_FILE', contentHash: 'e'.repeat(64), sizeBytes: 100,
      order: 1, accessKey, ingestionStatus: 'PROCESSADA', repetition: 'ORIGINAL', contentConflict: 'SEM_CONFLITO', eligibleForTotalsByOccurrencePolicy: true, receivedAt: now }], [], [],
    [{ id, batchId, occurrenceId, association: 'ORPHAN', contentHash: 'e'.repeat(64), createdAt: now, normalized: { kind: 'EVENT', envelope: 'PROC_EVENTO_NFE', version: '1.00', accessKey,
      environmentCode: '1', eventType: '110110', sequence: '1', protocolNumber: '123456', statusCode: '135', responseMatches: true, correctionText: 'Correção do endereço', ...overrides } }])
  if (associated) decideEvent(id, 'ASSOCIATE', document.id)
  return id
}
function decideEvent(id: string, action: 'ASSOCIATE' | 'APPROVE_CCE', documentId?: string) {
  const r = listDocumentReviews(database).find(row => row.artifact.id === id)!
  return saveDocumentReview(database, { artifactId: id, documentId: documentId ?? r.documentId!, action, reason: 'Teste auditado.', expectedSnapshot: r.snapshot, requestId: randomUUID() })
}
function row() { return listDocumentConflicts(database).find(r => r.environmentCode === '1')! }
function decide(r: DocumentConflictSummary, documentId = r.versions[0]!.id, action: 'SELECT' | 'REOPEN' = 'SELECT', requestId = randomUUID()) {
  return saveConflictResolution(database, { accessKey: r.accessKey, environmentCode: r.environmentCode, documentId, action, reason: 'Comparado no teste.', expectedSnapshot: r.snapshot, requestId })
}
const monthly = (period = '2026-09', company = companyId) => queryMonthlyConference(database, { companyId: company, period })
describe('resolução auditada de conflitos', () => {
  it('escolhe a versão entre lotes, preserva originais e snapshots e exporta decisões', () => {
    const a = notes(['a'])[0]!, b = notes(['b'])[0]!
    expect(monthly().summary.counts.calculated).toBe(0)
    const oldReport = queryMonthlyReport(database, { companyId, period: '2026-09' }, 'test')
    const original = new SqliteBatchRepository(database).listNormalizedDocuments(b.batchId)[0]
    const run = new SqliteCalculationRepository(database).latestByDocument(b.id)!.id
    expect(decide(row(), b.id)).toMatchObject({ status: 'RESOLVED', chosenDocumentId: b.id })
    expect(monthly().summary.counts).toMatchObject({ calculated: 1, excluded: 1 })
    expect(monthly().summary.evidence.find(e => e.documentId === a.id)?.reasons.join()).toContain('Versão excluída')
    expect(queryBatchDetail(database, b.batchId).consolidation?.counts.calculated).toBe(1)
    expect(oldReport.consolidation?.counts.calculated).toBe(0)
    const book = createExcelWorkbook(queryMonthlyReport(database, { companyId, period: '2026-09' }, 'test'))
    expect(book.getWorksheet('Conflitos e decisões')).toBeTruthy()
    expect(book.getWorksheet('Conflitos e decisões')?.getCell('H6').value).toContain('SELECT')
    expect(new SqliteBatchRepository(database).listNormalizedDocuments(b.batchId)[0]).toEqual(original)
    expect(new SqliteCalculationRepository(database).latestByDocument(b.id)!.id).toBe(run)
    expect(database.get('SELECT count(*) AS total FROM execucoes_calculo')?.total).toBe(2)
  })
  it('resolve conflito no mesmo lote e libera somente a restrição da ocorrência na projeção', () => {
    const [a, b] = notes(['a', 'b'])
    expect(getItemFiscalContext(database, b!.batchId, b!.id, '1').calculation.status).toBe('UNSUPPORTED')
    decide(row(), b!.id)
    expect(queryBatchDetail(database, b!.batchId).consolidation?.counts).toMatchObject({ calculated: 1, excluded: 1 })
    expect(queryBatchDetail(database, b!.batchId).documents.find(d => d.id === b!.id)).toMatchObject({ eligibleForProcessing: true })
    expect(getItemFiscalContext(database, b!.batchId, b!.id, '1').calculation.status).not.toBe('UNSUPPORTED')
    expect(new SqliteBatchRepository(database).listNormalizedDocuments(a!.batchId).every(d => !d.eligibleForProcessing)).toBe(true)
  })
  it('prefere a ocorrência escolhida entre cópias do mesmo lote e não duplica valores', () => {
    const [, copy, chosen] = notes(['a', 'b', 'b'])
    decide(row(), chosen!.id)
    expect(queryBatchDetail(database, chosen!.batchId).consolidation?.counts).toMatchObject({ calculated: 1, excluded: 2 })
    expect(monthly().summary.evidence.find(e => e.status === 'CALCULATED')?.documentId).toBe(chosen!.id)
    expect(monthly().summary.evidence.find(e => e.documentId === copy!.id)?.status).toBe('EXCLUDED')
  })
  it('evento novo invalida a tela antiga e não é ignorado pela escolha de conteúdo', () => {
    const a = notes(['a'])[0]!; notes(['b']); const before = row()
    const e = event(a, { eventType: '210200', correctionText: '' }, false)
    expect(() => decide(before, a.id)).toThrow('mudaram')
    decide(row(), a.id)
    expect(monthly().summary.counts.calculated).toBe(0)
    decideEvent(e, 'ASSOCIATE', a.id)
    expect(monthly().summary.counts.calculated).toBe(0)
  })
  it('reabre e mantém histórico imutável, solicitações idempotentes e concorrência protegida', () => {
    notes(['a']); const b = notes(['b'])[0]!, before = row(), requestId = randomUUID()
    decide(before, b.id, 'SELECT', requestId); decide(before, b.id, 'SELECT', requestId)
    expect(row().history).toHaveLength(1)
    expect(() => decide(before, b.id)).toThrow('mudaram')
    expect(() => decide(before, b.id, 'REOPEN', requestId)).toThrow('outra resolução')
    expect(decide(row(), b.id, 'REOPEN').status).toBe('PENDING')
    expect(monthly().summary.counts.calculated).toBe(0)
    expect(row().history).toHaveLength(2)
    expect(() => database.run('DELETE FROM resolucoes_conflitos')).toThrow('imutáveis')
    expect(() => database.run("UPDATE resolucoes_conflitos SET motivo = 'troca'")).toThrow('imutáveis')
  })
  it('nova versão invalida a escolha, enquanto cópia idêntica mantém a decisão e não duplica valores', () => {
    notes(['a']); const b = notes(['b'])[0]!
    decide(row(), b.id); const old = row()
    notes(['b'])
    expect(row().status).toBe('RESOLVED'); expect(monthly().summary.counts).toMatchObject({ calculated: 1, excluded: 2 })
    expect(monthly().summary.evidence.find(e => e.status === 'CALCULATED')?.documentId).toBe(b.id)
    expect(() => decide(old, b.id, 'REOPEN')).toThrow('mudaram')
    notes(['c'])
    expect(row().status).toBe('STALE'); expect(monthly().summary.counts.calculated).toBe(0)
    expect(decide(row(), b.id).status).toBe('RESOLVED'); expect(monthly().summary.counts.calculated).toBe(1)
  })
  it('cancelamento de uma versão descartada bloqueia todas e impede novo cálculo', () => {
    const a = notes(['a'])[0]!, e = event(a, { eventType: '110111', correctionText: '', justification: 'Teste' })
    const b = notes(['b'])[0]!
    decide(row(), b.id)
    expect(monthly().summary.counts.calculated).toBe(0)
    expect(monthly().summary.evidence.find(r => r.documentId === b.id)?.reasons.join()).toContain('cancelado')
    expect(getItemFiscalContext(database, b.batchId, b.id, '1').calculation.status).toBe('UNSUPPORTED')
    expect(listDocumentReviews(database).find(r => r.artifact.id === e)?.status).toBe('CANCELED')
  })
  it('denegação associada a uma versão descartada não é removida pela escolha', () => {
    const a = notes(['a'])[0]!, id = randomUUID()
    database.run(`INSERT INTO artefatos_documentais (id, lote_id, ocorrencia_arquivo_id, documento_id, tipo, chave_acesso, versao, codigo_status, associacao, hash_xml, dados_json, criado_em)
      VALUES (?, ?, ?, ?, 'PROTOCOL', ?, '4.00', '301', 'ASSOCIATED', ?, ?, ?)`, id, a.batchId, a.occurrenceId, a.id, accessKey, 'e'.repeat(64),
      JSON.stringify({ kind: 'PROTOCOL', envelope: 'PROT_NFE', version: '4.00', accessKey, environmentCode: '1', protocolNumber: '123456', statusCode: '301', responseMatches: true }), now)
    const b = notes(['b'])[0]!; decide(row(), b.id)
    expect(monthly().summary.counts.calculated).toBe(0)
    expect(getItemFiscalContext(database, b.batchId, b.id, '1').calculation.status).toBe('UNSUPPORTED')
  })
  it('CC-e revisada em outra versão exige novo vínculo e nova aprovação', () => {
    const a = notes(['a'])[0]!, e = event(a); decideEvent(e, 'APPROVE_CCE')
    const b = notes(['b'])[0]!; decide(row(), b.id)
    expect(monthly().summary.counts.calculated).toBe(0)
    expect(listDocumentReviews(database).find(r => r.artifact.id === e)).toMatchObject({ canAssociate: true, canApproveCce: false })
    decideEvent(e, 'ASSOCIATE', b.id)
    expect(monthly().summary.counts.calculated).toBe(0)
    decideEvent(e, 'APPROVE_CCE')
    expect(monthly().summary.counts.calculated).toBe(1)
  })
  it('preserva mês da versão escolhida e separa ambientes e empresas analisadas', () => {
    notes(['a']); const b = notes(['b'], { issuedAt: '2026-08-31T23:00:00-03:00' })[0]!
    notes(['d'], { environmentCode: '2' }, companyId, organizationId, '2')
    decide(row(), b.id)
    expect(monthly().summary.evidence.find(e => e.documentId === b.id)).toBeUndefined()
    expect(monthly().summary.groups.find(g => g.environment === '1')?.counts.calculated).toBe(0)
    expect(monthly().summary.groups.find(g => g.environment === '2')?.counts.calculated).toBe(1)
    expect(monthly('2026-08').summary.counts.calculated).toBe(1)
    const other = randomUUID()
    new SqliteCompanyRepository(database).create({ id: other, organizationId, legalName: 'Comprador', cnpj: '11444777000161', state: 'PR', active: true, createdAt: now, updatedAt: now })
    notes(['b'], { issuedAt: '2026-08-31T23:00:00-03:00' }, other)
    expect(row().status).toBe('RESOLVED'); expect(monthly('2026-08', other).summary.counts.calculated).toBe(1)
    expect(monthly('2026-08', other).summary.groups[0]?.perspective).toBe('PURCHASES')
  })
  it('não elimina outras restrições, valida entradas e desfaz falha de gravação', () => {
    notes(['a']); const b = notes(['b'], {}, companyId, organizationId, '1', 'EMPRESA_DIVERGENTE,OCORRENCIA_INELEGIVEL')[0]!
    expect(row().versions.find(d => d.id === b.id)?.canSelect).toBe(false)
    expect(() => decide(row(), b.id)).toThrow('EMPRESA_DIVERGENTE')
    const initial = row(), input = { accessKey, environmentCode: '1', documentId: initial.versions.find(v => v.canSelect)!.id, action: 'SELECT', reason: 'Conferido.', expectedSnapshot: initial.snapshot, requestId: randomUUID() }
    for (const raw of [null, [], {}, { ...input, reason: ' ' }, { ...input, amount: '99' }, { ...input, action: 'IGNORE' }, { ...input, environmentCode: '3' }]) expect(() => validateConflictResolutionInput(raw)).toThrow()
    database.exec("CREATE TRIGGER falha_conflito BEFORE INSERT ON resolucoes_conflitos BEGIN SELECT RAISE(ABORT, 'Falha de escrita'); END")
    expect(() => saveConflictResolution(database, input)).toThrow('Falha de escrita')
    expect(new SqliteConflictResolutionRepository(database).listByOrganization(organizationId)).toHaveLength(0)
    expect(monthly().summary.counts.calculated).toBe(0)
  })
  it('isola a organização e rejeita referência a nota de outro grupo no serviço e no SQLite', () => {
    notes(['a']); notes(['b']); const other = randomUUID(), active = new SqliteOrganizationRepository(database).findSingle()!
    new SqliteOrganizationRepository(database).create({ id: other, name: 'Outro escritório', active: true, createdAt: now, updatedAt: now })
    vi.spyOn(SqliteOrganizationRepository.prototype, 'findSingle').mockReturnValue(active)
    const foreign = notes(['c', 'd'], {}, companyId, other)[0]!
    expect(row().versions).toHaveLength(2)
    expect(() => decide(row(), foreign.id)).toThrow('incompatível')
    const valid = decide(row())
    const record = new SqliteConflictResolutionRepository(database).listByOrganization(organizationId)[0]!
    expect(() => new SqliteConflictResolutionRepository(database).insert({ ...record, id: randomUUID(), requestId: randomUUID(), revision: 2, documentId: foreign.id })).toThrow('incompatível')
    expect(valid.history).toHaveLength(1)
  })
  it('compara itens pelo número, preservando diferenças de campo ausente, zero e itens removidos', () => {
    const a = notes(['a'])[0]!, b = notes(['b'])[0]!
    const first = a.normalized.items[0]!
    a.normalized = { ...a.normalized, items: [first, { ...first, itemNumber: '2', description: 'Segundo' }] }
    b.normalized = { ...b.normalized, items: [{ ...first, itemNumber: '2', description: 'Segundo', freightAmount: '0' }, first] }
    const fields = compareConflictDocuments([a, b])
    expect(fields.find(f => f.path === 'items.2.description')?.different).toBe(false)
    expect(fields.find(f => f.path === 'items.2.freightAmount')).toMatchObject({ different: true, values: [null, '0'] })
    b.normalized = { ...b.normalized, items: [first] }
    expect(compareConflictDocuments([a, b]).find(f => f.path === 'items.2.description')?.values).toEqual(['Segundo', null])
  })
})
