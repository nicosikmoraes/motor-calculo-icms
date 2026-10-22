import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import type { ItemFiscalAnswers } from '@motor/contracts'
import { itemCalculationStatus } from '@motor/contracts'
import { normalizeNfeXml, validateNfeSchema } from '@motor/nfe-parser'
import { CORE_MIGRATIONS, SqliteBatchRepository, SqliteCalculationRepository, SqliteCompanyRepository,
  SqliteDatabase, SqliteOrganizationRepository, runSqlMigrations } from '@motor/database'
import { applyAutomaticXmlCalculations, getItemFiscalContext, saveItemFiscalAnswers } from '../src/main/item-fiscal-use-cases'
import { getBatchConsolidation } from '../src/main/batch-consolidation'

const xml = readFileSync(new URL('./fixtures/revisao-interestadual-1245.xml', import.meta.url), 'utf8')
const timestamp = '2026-09-15T15:00:00.000Z'
const orgId = '00000000-0000-4000-8000-000000000001'
const companyId = '00000000-0000-4000-8000-000000000002'
const batchId = '00000000-0000-4000-8000-000000000003'
const documentId = '00000000-0000-4000-8000-000000000004'
const occurrenceId = '00000000-0000-4000-8000-000000000005'
const complete: ItemFiscalAnswers = { stApplicableConfirmed: true, stMvaMode: 'CATALOG_INTERSTATE',
  stInternalRate: '23', stOwnOperationRate: '12', fcpStApplicableConfirmed: true, stInternalRateIncludesFcp: false }
let db: SqliteDatabase

function context(itemNumber = '1') { return getItemFiscalContext(db, batchId, documentId, itemNumber) }
function save(requestId: string, answers: ItemFiscalAnswers, itemNumber = '1', reuseScope: 'CURRENT_ITEM' | 'MATCHING_NOTE_ITEMS' = 'MATCHING_NOTE_ITEMS') {
  const current = context(itemNumber)
  return saveItemFiscalAnswers(db, { batchId, documentId, itemNumber, requestId, answers, reuseScope,
    ...(current.runId ? { expectedRunId: current.runId } : {}) })
}

beforeEach(() => {
  db = new SqliteDatabase(':memory:')
  runSqlMigrations(db, CORE_MIGRATIONS, { appVersion: 'test' })
  new SqliteOrganizationRepository(db).create({ id: orgId, name: 'Escritório de teste', active: true, createdAt: timestamp, updatedAt: timestamp })
  new SqliteCompanyRepository(db).create({ id: companyId, organizationId: orgId, legalName: 'Compradora de teste',
    cnpj: '00000000000191', state: 'PR', active: true, createdAt: timestamp, updatedAt: timestamp })
  const normalized = normalizeNfeXml(xml)
  const contentHash = createHash('sha256').update(xml).digest('hex')
  new SqliteBatchRepository(db).createWithOccurrences({ id: batchId, organizationId: orgId, status: 'RECEBIDO',
    receivedAt: timestamp, createdAt: timestamp, updatedAt: timestamp }, [{ id: occurrenceId, batchId,
    originalName: 'revisao-interestadual-1245.xml', relativePath: 'revisao-interestadual-1245.xml', detectedKind: 'XML', origin: 'SELECTED_FILE',
    contentHash, sizeBytes: Buffer.byteLength(xml), order: 1, accessKey: normalized.accessKey, ingestionStatus: 'PROCESSADA',
    repetition: 'ORIGINAL', contentConflict: 'SEM_CONFLITO', eligibleForTotalsByOccurrencePolicy: true, receivedAt: timestamp }], [],
  [{ id: documentId, batchId, companyId, occurrenceId, contentHash, eligibleForProcessing: true, createdAt: timestamp, normalized }])
  // O cálculo inicial mantém os quatro itens pendentes: a alíquota ST do XML está zerada.
  applyAutomaticXmlCalculations(db, batchId)
})
afterEach(() => db.close())

describe('revisão compartilhada com nota XML sintética', () => {
  it('aceita o leiaute NF-e 4.00 da nota de exemplo', async () => {
    const result = await validateNfeSchema(xml)
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
    expect(getBatchConsolidation(db, batchId).counts).toMatchObject({ items: 4, pending: 4, calculated: 0 })
  })

  it('responde um produto e calcula os três compatíveis pelos valores individuais, mantendo o outro NCM pendente', () => {
    const before = context()
    expect(before.commonScenario).toBeUndefined() // O CFOP 5403 usa ST, não o cálculo comum sem ST.
    expect(before.matchingNoteItems?.map(item => item.itemNumber)).toEqual(['1', '2', '3'])
    const saved = save('complete-group', complete)
    expect(saved.appliedItemNumbers).toEqual(['1', '2', '3'])
    expect(saved.calculation.inputs.find(input => input.name === 'originalMvaPercent')).toMatchObject({
      value: '47.77', source: expect.stringContaining('CATALOG/pr-st-mva-1245-2025'),
    })
    expect(['1', '2', '3'].map(number => context(number).calculation.result?.amount)).toEqual(['278.78', '55.76', '13.94'])
    expect(['1', '2', '3'].every(number => itemCalculationStatus(context(number).calculation) === 'CALCULATED')).toBe(true)
    expect(itemCalculationStatus(context('4').calculation)).toBe('PENDING_DATA')
    expect(context('4').calculation.result).toBeUndefined()
    expect(context('4').answers.stMvaPercent).toBeUndefined()
    const summary = getBatchConsolidation(db, batchId)
    expect(summary.counts).toMatchObject({ calculated: 3, pending: 1 })
    expect(summary.groups.find(group => group.component === 'ICMS_ST')?.totals.calculatedIcms).toBe('348.48')
    expect(summary.groups.find(group => group.component === 'FCP_ST')?.totals.calculatedIcms).toBe('43.35')
    expect(new SqliteCalculationRepository(db).latestByDocument(documentId)?.previousRunId).toBe(before.runId)
    expect(saveItemFiscalAnswers(db, { batchId, documentId, itemNumber: '1', requestId: 'complete-group',
      expectedRunId: before.runId!, answers: complete, reuseScope: 'MATCHING_NOTE_ITEMS' }).runId).toBe(saved.runId)
  })

  it('compartilha o rascunho e conclui o grupo sem perder o histórico', () => {
    const partial = save('partial-group', { stApplicableConfirmed: true })
    expect(partial.appliedItemNumbers).toEqual(['1', '2', '3'])
    for (const number of ['1', '2', '3']) {
      expect(context(number).answers.stApplicableConfirmed).toBe(true)
      expect(itemCalculationStatus(context(number).calculation)).toBe('PENDING_DATA')
    }
    const finished = save('finish-group', complete)
    expect(itemCalculationStatus(finished.calculation)).toBe('CALCULATED')
    const history = new SqliteCalculationRepository(db).findByRequest('partial-group', documentId)!
    expect(history.items.filter(item => ['1', '2', '3'].includes(item.itemNumber)).every(item => item.memory.status === 'PENDING_DATA')).toBe(true)
    expect(new SqliteCalculationRepository(db).latestByDocument(documentId)?.previousRunId).toBe(partial.runId)
  })

  it('preserva o produto já calculado individualmente ao responder os demais', () => {
    save('individual-third', { ...complete, stMvaMode: 'MANUAL_APPLIED', stMvaPercent: '40' }, '3', 'CURRENT_ITEM')
    const previous = new SqliteCalculationRepository(db).latestByDocument(documentId)!.items.find(item => item.itemNumber === '3')!.memory
    expect(context().matchingNoteItems?.map(item => item.itemNumber)).toEqual(['1', '2'])
    expect(save('preserve-third', complete).appliedItemNumbers).toEqual(['1', '2'])
    expect(new SqliteCalculationRepository(db).latestByDocument(documentId)!.items.find(item => item.itemNumber === '3')!.memory).toEqual(previous)
    expect(context('3').answers.stMvaPercent).toBe('40')
  })

  it('não copia base em reais nem decisão de ausência de débito para outros produtos', () => {
    const before = context().runId
    expect(() => save('individual-base', { ...complete, entryBaseAmount: '1000.00' })).toThrow(/revisão individual/)
    expect(() => save('individual-no-debit', { entryMethod: 'NO_DEBIT', entryNoDebitConfirmed: true,
      entryNoDebitReason: 'Hipótese específica do primeiro produto.' })).toThrow(/aquisição interestadual|revisão individual/)
    expect(context().runId).toBe(before)
    expect(context('2').answers.entryBaseAmount).toBeUndefined()
    expect(context('2').answers.entryNoDebitReason).toBeUndefined()
  })
})
