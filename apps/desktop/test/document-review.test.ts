import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CORE_MIGRATIONS, SqliteBatchRepository, SqliteCalculationRepository, SqliteCompanyRepository, SqliteDatabase,
  SqliteDocumentReviewRepository, SqliteOrganizationRepository, runSqlMigrations } from '@motor/database'
import type { NormalizedDocumentArtifact } from '@motor/domain'
import type { DocumentReviewAction, DocumentReviewSummary } from '@motor/contracts'
import { buildReportData, createExcelWorkbook } from '@motor/reporting'
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))
vi.mock('../src/main/main-services', () => ({ activeDatabase: vi.fn(), requiredInputText: vi.fn() }))
import { listDocumentReviews, saveDocumentReview, validateDocumentReviewInput } from '../src/main/document-review-use-cases'
import { queryMonthlyConference, queryMonthlyReport } from '../src/main/monthly-conference'
import { queryBatchDetail } from '../src/main/batch-query-handlers'
import { getItemFiscalContext } from '../src/main/item-fiscal-use-cases'

let database: SqliteDatabase, organizationId: string, companyId: string
const now = '2026-10-06T12:00:00.000Z', accessKey = '1'.repeat(44)
beforeEach(() => {
  database = new SqliteDatabase(':memory:'); runSqlMigrations(database, CORE_MIGRATIONS, { appVersion: 'test' })
  organizationId = randomUUID(); companyId = randomUUID()
  new SqliteOrganizationRepository(database).create({ id: organizationId, name: 'Escritório', active: true, createdAt: now, updatedAt: now })
  new SqliteCompanyRepository(database).create({ id: companyId, organizationId, legalName: 'Empresa de teste', cnpj: '11222333000181', state: 'PR', active: true, createdAt: now, updatedAt: now })
})
afterEach(() => { database.close(); vi.restoreAllMocks() })
function occurrence(batchId: string, hash: string) {
  return { id: randomUUID(), batchId, originalName: 'arquivo.xml', relativePath: 'arquivo.xml', detectedKind: 'XML' as const,
    origin: 'SELECTED_FILE' as const, contentHash: hash, sizeBytes: 100, order: 1, accessKey,
    ingestionStatus: 'PROCESSADA' as const, repetition: 'ORIGINAL' as const, contentConflict: 'SEM_CONFLITO' as const,
    eligibleForTotalsByOccurrencePolicy: true, receivedAt: now }
}
function batch(id: string, organization = organizationId) {
  return { id, organizationId: organization, status: 'RECEBIDO' as const, originalName: 'Teste',
    environmentCode: '1' as const, receivedAt: now, createdAt: now, updatedAt: now }
}
function note(hash = 'a'.repeat(64), env = '1') {
  const batchId = randomUUID(), documentId = randomUUID(), file = occurrence(batchId, hash)
  const source = { format: 'NFE_XML_4_00' as const, xmlPath: 'NFe' }
  new SqliteBatchRepository(database).createWithOccurrences(batch(batchId), [file], [], [{ id: documentId, batchId, companyId,
    occurrenceId: file.id, contentHash: hash, eligibleForProcessing: true, createdAt: now,
    normalized: { kind: 'NFE', layoutVersion: '4.00', model: '55', accessKey, number: '123', series: '1',
      issuedAt: '2026-09-30T10:00:00-03:00', environmentCode: env, operationDirection: '1', purposeCode: '1', finalConsumerIndicator: '0',
      issuer: { state: 'PR', taxId: '11222333000181', taxIdType: 'CNPJ', taxRegimeCode: '3' },
      recipient: { state: 'PR', taxId: '11444777000161', taxIdType: 'CNPJ', stateRegistrationIndicator: '1' }, declaredTotals: {}, source,
      items: [{ itemNumber: '1', cfop: '5102', supplierProductCode: '001', productAmount: '1000', declaredIcms: { cst: '00', amount: '120.00' }, source }] } }])
  const run = new SqliteCalculationRepository(database).save({ requestId: randomUUID(), batchId, documentId, engineVersion: 'PR_COMMON_2',
    items: [{ itemNumber: '1', memory: { schemaVersion: 1, status: 'CALCULATED', rule: { id: 'teste', version: 1, legalBasis: 'Caso sintético' },
      result: { base: '1000.00', rate: '12', amount: '120.00' }, deferredAmount: '75.00', inputs: [],
      steps: [{ name: 'ICMS', operation: 'Caso sintético', inputs: {}, result: '120.00' }] } }] })
  return { batchId, documentId, run }
}
function event(overrides: Partial<NormalizedDocumentArtifact> = {}, organization = organizationId) {
  const batchId = randomUUID(), id = randomUUID(), file = occurrence(batchId, 'b'.repeat(64))
  new SqliteBatchRepository(database).createWithOccurrences(batch(batchId, organization), [file], [], [], [{ id, batchId,
    occurrenceId: file.id, association: 'ORPHAN', contentHash: file.contentHash, createdAt: now,
    normalized: { kind: 'EVENT', envelope: 'PROC_EVENTO_NFE', version: '1.00', accessKey, environmentCode: '1',
      eventType: '110110', sequence: '1', protocolNumber: '123456', statusCode: '135', responseMatches: true,
      occurredAt: '2026-10-01T11:00:00-03:00', correctionText: 'Correção de texto, caso de teste.', ...overrides } }])
  return { id, batchId }
}
function review(id: string) { return listDocumentReviews(database).find(r => r.artifact.id === id)! }
function decide(row: DocumentReviewSummary, action: DocumentReviewAction, documentId = row.documentId ?? row.candidates[0]!.id, requestId = randomUUID()) {
  return saveDocumentReview(database, { artifactId: row.artifact.id, documentId, action, requestId,
    reason: 'Conferido no teste.', expectedSnapshot: row.snapshot })
}
const monthly = () => queryMonthlyConference(database, { companyId, period: '2026-09' })

describe('revisão documental entre lotes', () => {
  it('confirma cancelamento, preserva original e memória e exporta evidência entre lotes', () => {
    const n = note(), e = event({ eventType: '110111', correctionText: '', justification: 'Cancelamento de teste' })
    expect(monthly().summary.counts.calculated).toBe(0)
    expect(review(e.id)).toMatchObject({ canAssociate: true, status: 'ASSOCIATION_PENDING' })
    const updated = decide(review(e.id), 'ASSOCIATE')
    expect(updated).toMatchObject({ canAssociate: false, status: 'CANCELED', canApproveCce: false })
    expect(monthly().summary.evidence[0]?.reasons.join()).toContain('cancelado')
    const detail = queryBatchDetail(database, n.batchId)
    expect(detail.documents[0]).toMatchObject({ documentaryStatus: 'CANCELED', items: [{ calculation: { status: 'CALCULATED', result: { amount: '120.00' } } }] })
    expect(getItemFiscalContext(database, n.batchId, n.documentId, '1').calculation.status).toBe('UNSUPPORTED')
    const book = createExcelWorkbook(queryMonthlyReport(database, { companyId, period: '2026-09' }, 'test'))
    expect(book.getWorksheet('Eventos e revisões')?.getCell('K6').value).toBe(e.batchId)
    expect(book.getWorksheet('Eventos e revisões')?.getCell('O6').value).toContain('ASSOCIATE')
    const items = book.getWorksheet('Itens')!
    expect(items.getRow(6).getCell(items.columnCount).value).toBe(120)
    expect(() => createExcelWorkbook(buildReportData(queryBatchDetail(database, e.batchId), { generatedAt: now, appVersion: 'test' }))).not.toThrow()
    expect(new SqliteCalculationRepository(database).latestByDocument(n.documentId)?.id).toBe(n.run.id)
    expect(new SqliteBatchRepository(database).listDocumentArtifacts(e.batchId)[0]?.association).toBe('ORPHAN')
    expect(database.get('SELECT count(*) AS total FROM execucoes_calculo')?.total).toBe(1)
  })
  it('conclui CC-e, atualiza lote e mês sem recalcular e permite reabrir com auditoria imutável', () => {
    const n = note(), e = event()
    expect(decide(review(e.id), 'ASSOCIATE')).toMatchObject({ status: 'CCE_PENDING', canApproveCce: true })
    expect(monthly().summary.counts.calculated).toBe(0)
    expect(decide(review(e.id), 'APPROVE_CCE')).toMatchObject({ status: 'CCE_APPROVED', canReopenCce: true })
    expect(monthly().summary.groups[0]?.totals.calculatedIcms).toBe('120.00')
    expect(queryBatchDetail(database, n.batchId).consolidation?.counts.calculated).toBe(1)
    const report = queryMonthlyReport(database, { companyId, period: '2026-09' }, 'test')
    expect(createExcelWorkbook(report).getWorksheet('Eventos e revisões')?.getCell('O6').value).toContain('APPROVE_CCE')
    expect(decide(review(e.id), 'REOPEN_CCE')).toMatchObject({ status: 'CCE_PENDING', canApproveCce: true })
    expect(monthly().summary.counts.calculated).toBe(0)
    expect(report.consolidation?.counts.calculated).toBe(1)
    expect(new SqliteDocumentReviewRepository(database).listByOrganization(organizationId)).toHaveLength(3)
    expect(() => database.run('DELETE FROM revisoes_documentais')).toThrow('imutáveis')
    expect(() => database.run('UPDATE revisoes_documentais SET motivo = ?', 'troca')).toThrow('imutáveis')
    expect(new SqliteCalculationRepository(database).latestByDocument(n.documentId)?.id).toBe(n.run.id)
  })
  it('nova CC-e exige outra revisão e impede aprovar uma tela antiga ou uma sequência anterior', () => {
    note(); const e = event()
    decide(review(e.id), 'ASSOCIATE'); const old = review(e.id)
    const latest = event({ sequence: '2', correctionText: 'Nova correção' })
    expect(() => decide(old, 'APPROVE_CCE')).toThrow('mudaram')
    expect(review(e.id).canApproveCce).toBe(false)
    decide(review(latest.id), 'ASSOCIATE')
    expect(review(e.id).canApproveCce).toBe(false)
    expect(review(latest.id).canApproveCce).toBe(true)
    decide(review(latest.id), 'APPROVE_CCE')
    expect(monthly().summary.counts.calculated).toBe(1)
  })
  it('chegada de cancelamento mantém exclusão mesmo após CC-e aprovada', () => {
    note(); const cce = event()
    decide(review(cce.id), 'ASSOCIATE'); decide(review(cce.id), 'APPROVE_CCE')
    const cancel = event({ eventType: '110111', correctionText: '', justification: 'Teste' })
    expect(monthly().summary.counts.calculated).toBe(0)
    decide(review(cancel.id), 'ASSOCIATE')
    expect(review(cce.id)).toMatchObject({ status: 'CANCELED', canApproveCce: false })
    expect(monthly().summary.evidence[0]?.reasons.join()).toContain('cancelado')
  })
  it('aplica o efeito às cópias idênticas sem duplicar valores nem escolher conteúdo conflitante', () => {
    note(); note(); const e = event()
    expect(review(e.id).candidates).toHaveLength(2)
    decide(review(e.id), 'ASSOCIATE'); decide(review(e.id), 'APPROVE_CCE')
    expect(monthly().summary.counts).toMatchObject({ calculated: 1, excluded: 1 })
    note('c'.repeat(64))
    const conflict = review(e.id)
    expect(conflict).toMatchObject({ status: 'CONFLICT', canAssociate: false, canApproveCce: false })
    expect(monthly().summary.counts.calculated).toBe(0)
  })
  it('bloqueia eventos sem retorno consistente, ambientes divergentes e notas não localizadas', () => {
    note()
    for (const overrides of [{ responseMatches: false }, { envelope: 'EVENTO' as const }, { protocolNumber: '' },
      { environmentCode: '2' }, { embeddedForAccessKey: '2'.repeat(44) }, { statusCode: '136' }]) {
      const e = event(overrides), row = review(e.id)
      expect(row.canAssociate).toBe(false)
      expect(row.blockedReason).toBeTruthy()
      expect(() => decide(row, 'ASSOCIATE', row.candidates[0]?.id ?? randomUUID())).toThrow()
    }
    const missing = event({ accessKey: '3'.repeat(44) })
    expect(review(missing.id)).toMatchObject({ status: 'UNMATCHED', candidates: [], canAssociate: false })
  })
  it('conflitos na mesma sequência impedem aprovação e tipos não cobertos continuam pendentes após associar', () => {
    note(); const e = event()
    event({ correctionText: 'Texto diferente para a mesma sequência' })
    expect(review(e.id).blockedReason).toContain('conteúdos diferentes')
    const unknown = event({ eventType: '210200', correctionText: '' })
    const linked = decide(review(unknown.id), 'ASSOCIATE')
    expect(linked.status).toBe('ASSOCIATION_PENDING')
    expect(linked.canApproveCce).toBe(false)
    expect(monthly().summary.counts.calculated).toBe(0)
  })
  it('não libera totalização por confirmar a associação de um tipo de evento ainda não coberto', () => {
    note(); const e = event({ eventType: '210200', correctionText: '' })
    const linked = decide(review(e.id), 'ASSOCIATE')
    expect(linked).toMatchObject({ status: 'REVIEW_PENDING', canAssociate: false, canApproveCce: false })
    expect(monthly().summary.counts.calculated).toBe(0)
  })
  it('erro estrutural impede confirmação e falha na escrita desfaz toda a revisão', () => {
    note(); const e = event(), initial = review(e.id)
    database.exec("CREATE TRIGGER falha_revisao BEFORE INSERT ON revisoes_documentais BEGIN SELECT RAISE(ABORT, 'Falha de escrita'); END")
    expect(() => decide(initial, 'ASSOCIATE')).toThrow('Falha de escrita')
    expect(review(e.id).history).toHaveLength(0)
    database.exec('DROP TRIGGER falha_revisao')
    const occurrenceId = initial.artifact.occurrenceId
    database.run(`INSERT INTO diagnosticos_ingestao (id, lote_id, ocorrencia_id, origem, codigo, mensagem, criado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?)`, randomUUID(), e.batchId, occurrenceId, 'evento.xml', 'ARTEFATO_XSD_INVALIDO', 'Erro de schema', now)
    expect(review(e.id)).toMatchObject({ canAssociate: false })
    expect(review(e.id).blockedReason).toContain('XML/XSD')
    expect(() => decide(review(e.id), 'ASSOCIATE')).toThrow('XML/XSD')
  })
  it('isolamento de organização, validação estrita, idempotência e concorrência', () => {
    const n = note(), e = event(), row = review(e.id), requestId = randomUUID()
    const input = { artifactId: e.id, documentId: n.documentId, action: 'ASSOCIATE', reason: 'Conferido.', expectedSnapshot: row.snapshot, requestId }
    saveDocumentReview(database, input); saveDocumentReview(database, input)
    expect(review(e.id).history).toHaveLength(1)
    expect(() => saveDocumentReview(database, { ...input, reason: 'Outro motivo' })).toThrow('outra revisão')
    expect(() => saveDocumentReview(database, { ...input, requestId: randomUUID() })).toThrow('mudaram')
    for (const raw of [null, [], {}, { ...input, reason: ' ' }, { ...input, amount: '100' }, { ...input, action: 'IGNORE' }]) expect(() => validateDocumentReviewInput(raw)).toThrow()
    const other = randomUUID()
    const activeOrganization = new SqliteOrganizationRepository(database).findSingle()!
    new SqliteOrganizationRepository(database).create({ id: other, name: 'Outro', active: true, createdAt: now, updatedAt: now })
    vi.spyOn(SqliteOrganizationRepository.prototype, 'findSingle').mockReturnValue(activeOrganization)
    const hidden = event({}, other)
    expect(listDocumentReviews(database).find(r => r.artifact.id === hidden.id)).toBeUndefined()
    expect(() => saveDocumentReview(database, { ...input, artifactId: hidden.id, requestId: randomUUID() })).toThrow('organização')
    expect(() => saveDocumentReview(database, { ...input, documentId: randomUUID(), expectedSnapshot: review(e.id).snapshot, requestId: randomUUID() })).toThrow('incompatível')
  })
})
