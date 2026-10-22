import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { normalizeNfeXml } from '@motor/nfe-parser'
import type { NormalizedDeclaredIcms, NormalizedNfeItem } from '@motor/domain'
import { itemCalculationStatus } from '@motor/contracts'
import { CORE_MIGRATIONS, SqliteDatabase, SqliteOrganizationRepository, SqliteCompanyRepository, SqliteBatchRepository, SqliteCalculationRepository, runSqlMigrations } from '@motor/database'
import { calculateAutomaticXmlItem, automaticCalculationDescription } from '../src/main/automatic-xml-calculation'
import { buildBatchConsolidation } from '@motor/reporting'
import { queryBatchDetail } from '../src/main/batch-query-handlers'
import { applyAutomaticXmlCalculations } from '../src/main/item-fiscal-use-cases'

const xml = readFileSync(new URL('./fixtures/revisao-resolucao-1245.xml', import.meta.url), 'utf8')
const note = normalizeNfeXml(xml)
const item = (tax: NormalizedDeclaredIcms, extra: Partial<NormalizedNfeItem> = {}): NormalizedNfeItem => ({ ...note.items[0]!, declaredIcms: tax, ...extra })
const st = { group: 'ICMS10', cst: '10', stBaseMode: '5', stBaseAmount: '100', stRate: '19.5', amount: '12', stAmount: '7.50' }

describe('conferência automática dos tratamentos declarados', () => {
  it.each([{ group: 'ICMS60', cst: '60' }, { group: 'ICMSST', cst: '60' }, { group: 'ICMSSN500', csosn: '500' }])('separa retenção anterior de destaque atual: $group', tax => {
    const result = calculateAutomaticXmlItem(note, item({ ...tax, retainedStBaseAmount: '119.20', retainedStAmount: '25.08', retainedFcpStAmount: '2.38' }))!
    expect(result.status).toBe('PENDING_RULE')
    expect(result.result).toBeUndefined()
    expect(result.additionalComponents).toBeUndefined()
    expect(result.inputs.find(input => input.name === 'retainedStAmount')).toMatchObject({ value: '25.08', treatment: 'EXCLUDED', source: 'XML/ICMS' })
    expect(automaticCalculationDescription(result)).toContain('ST anterior')
    const summary = buildBatchConsolidation('batch', [{ documentId: 'doc', accessKey: note.accessKey, documentNumber: '1', companyId: 'company', issuedAt: note.issuedAt,
      perspective: 'PURCHASES', environment: '1', authorization: 'WITH_PROTOCOL', items: [{ itemNumber: '1', memory: result }] }])
    expect(summary.counts).toMatchObject({ calculated: 0, pending: 1, declaredMissing: 0, deferredMissing: 0 })
    expect(summary.groups[0]?.totals.calculatedIcms).toBe('0.00')
  })
  it('não presume ausência de destaque se os campos atuais contêm imposto ou valores inválidos', () => {
    expect(calculateAutomaticXmlItem(note, item({ group: 'ICMS60', cst: '60', amount: '10' }))).toBeUndefined()
    expect(calculateAutomaticXmlItem(note, item({ group: 'ICMS60', cst: '60', retainedStAmount: '-1' }))?.status).toBe('PENDING_DATA')
    expect(calculateAutomaticXmlItem(note, item({ group: 'ICMS60', cst: '60', retainedStAmount: 'inválido' }))?.status).toBe('PENDING_DATA')
  })
  it('identifica isenção declarada e Simples sem destaque sem calcular apuração do DAS', () => {
    expect(calculateAutomaticXmlItem(note, item({ group: 'ICMS40', cst: '40', exemptAmount: '6.19' }))?.result).toBeUndefined()
    const simpleNote = { ...note, issuer: { ...note.issuer, taxRegimeCode: '1' } }
    const result = calculateAutomaticXmlItem(simpleNote, item({ group: 'ICMSSN102', csosn: '102' }))!
    expect(result.status).toBe('PENDING_RULE')
    expect(automaticCalculationDescription(result)).toContain('imposto devido')
    expect(calculateAutomaticXmlItem(simpleNote, item({ group: 'ICMSSN102', csosn: '400' }))?.result).toBeUndefined()
    expect(calculateAutomaticXmlItem(note, item({ group: 'ICMSSN102', csosn: '102' }))?.reason).toContain('CRT 1')
  })
  it('confere ICMS51 com os percentuais do XML e arredondamento por etapa', () => {
    const result = calculateAutomaticXmlItem(note, item({ group: 'ICMS51', cst: '51', baseAmount: '43.92', rate: '19.5',
      deferralPercent: '38.46', operationAmount: '8.56', deferredAmount: '3.29', amount: '5.27' }))!
    expect(result.result).toMatchObject({ base: '43.92', rate: '19.5', amount: '5.27' })
    expect(result.deferredAmount).toBe('3.29')
    expect(result.comparisons?.[0]?.status).toBe('MATCH')
    expect(calculateAutomaticXmlItem(note, item({ group: 'ICMS51', cst: '51', baseAmount: '43.92', rate: '19.5' }))?.status).toBe('PENDING_DATA')
  })
  it.each(['3', '5', '4'])('confere ST pela base declarada quando a composição exige regra própria: modalidade %s', mode => {
    const result = calculateAutomaticXmlItem(note, item({ ...st, stBaseMode: mode, fcpStBaseAmount: '100', fcpStRate: '2', fcpStAmount: '2' }, { discountAmount: '5' }))!
    expect(itemCalculationStatus(result)).toBe('CALCULATED')
    expect(result.result?.amount).toBe('7.50')
    expect(result.additionalComponents?.[0]?.result?.amount).toBe('2.00')
    expect(result.inputs.find(input => input.name === 'xmlTreatment')?.value).toBe('DECLARED_ST_BASE')
  })
  it('mantém os dados ausentes, as bases inválidas e a alíquota zerada como exceções', () => {
    expect(calculateAutomaticXmlItem(note, item({ ...st, stBaseAmount: undefined }))).toBeUndefined()
    expect(calculateAutomaticXmlItem(note, item({ ...st, stRate: '0' }))?.status).toBe('PENDING_DATA')
    expect(calculateAutomaticXmlItem(note, item({ ...st, amount: '500' }))?.status).toBe('PENDING_DATA')
    expect(itemCalculationStatus(calculateAutomaticXmlItem(note, item({ ...st, fcpStAmount: '2' }))!)).toBe('PENDING_DATA')
  })
  it('preserva a seleção CFOP e exige tratamento de devolução em vez de somar novo débito', () => {
    expect(calculateAutomaticXmlItem(note, item(st, { cfop: '6403' }))?.status).toBe('CALCULATED')
    const result = calculateAutomaticXmlItem({ ...note, purposeCode: '4' }, item(st, { cfop: '1411' }))!
    expect(result.status).toBe('UNSUPPORTED')
    expect(result.result).toBeUndefined()
    expect(result.reason).toContain('devolução')
    expect(calculateAutomaticXmlItem({ ...note, issuer: { ...note.issuer, state: 'SP' } }, item({ group: 'ICMS60', cst: '60' }))).toBeUndefined()
  })
  it('preserva na normalização os campos de retenção e de diferimento sem modificar os decimais', () => {
    const retained = normalizeNfeXml(xml.replace(/<ICMS10>[\s\S]*?<\/ICMS10>/, '<ICMS60><orig>0</orig><CST>60</CST><vBCSTRet>119.20</vBCSTRet><vICMSSTRet>25.08</vICMSSTRet><vFCPSTRet>2.38</vFCPSTRet></ICMS60>'))
    expect(retained.items[0]?.declaredIcms).toMatchObject({ retainedStBaseAmount: '119.20', retainedStAmount: '25.08', retainedFcpStAmount: '2.38' })
    const deferred = normalizeNfeXml(xml.replace(/<ICMS10>[\s\S]*?<\/ICMS10>/, '<ICMS51><orig>0</orig><CST>51</CST><vICMSOp>8.56</vICMSOp><pDif>38.4600</pDif><vICMSDif>3.29</vICMSDif></ICMS51>'))
    expect(deferred.items[0]?.declaredIcms).toMatchObject({ operationAmount: '8.56', deferralPercent: '38.4600', deferredAmount: '3.29' })
  })
  it('atualiza automaticamente uma memória antiga, preserva a revisão manual e não duplica execuções', () => {
    const db = new SqliteDatabase(':memory:')
    try {
      runSqlMigrations(db, CORE_MIGRATIONS, { appVersion: 'test' })
      const date = '2026-09-15T15:00:00.000Z'
      new SqliteOrganizationRepository(db).create({ id: '00000000-0000-4000-8000-000000000001', name: 'Teste', active: true, createdAt: date, updatedAt: date })
      new SqliteCompanyRepository(db).create({ id: '00000000-0000-4000-8000-000000000002', organizationId: '00000000-0000-4000-8000-000000000001', legalName: 'Compradora', cnpj: note.recipient!.taxId!, state: 'PR', active: true, createdAt: date, updatedAt: date })
      const normalized = { ...note, items: [item({ group: 'ICMS60', cst: '60' }), item({ group: 'ICMS60', cst: '60' }, { itemNumber: '2' })] }
      new SqliteBatchRepository(db).createWithOccurrences({ id: '00000000-0000-4000-8000-000000000003', organizationId: '00000000-0000-4000-8000-000000000001', status: 'RECEBIDO', receivedAt: date, createdAt: date, updatedAt: date },
        [{ id: '00000000-0000-4000-8000-000000000004', batchId: '00000000-0000-4000-8000-000000000003', originalName: 'test.xml', relativePath: 'test.xml', detectedKind: 'XML', origin: 'SELECTED_FILE', contentHash: 'a'.repeat(64), sizeBytes: 100,
          order: 1, accessKey: note.accessKey, ingestionStatus: 'PROCESSADA', repetition: 'ORIGINAL', contentConflict: 'SEM_CONFLITO', eligibleForTotalsByOccurrencePolicy: true, receivedAt: date }], [],
        [{ id: '00000000-0000-4000-8000-000000000005', batchId: '00000000-0000-4000-8000-000000000003', companyId: '00000000-0000-4000-8000-000000000002', occurrenceId: '00000000-0000-4000-8000-000000000004', contentHash: 'a'.repeat(64), eligibleForProcessing: true, createdAt: date, normalized }])
      const repository = new SqliteCalculationRepository(db)
      const old = { ...calculateAutomaticXmlItem(note, item({ group: 'ICMS60', cst: '60' }))!, schemaVersion: 1 as const, component: 'ICMS_ST' as const, status: 'CALCULATED' as const, result: { component: 'ICMS_ST' as const, base: '0.00', rate: '0', amount: '0.00' }, reason: 'Anterior', inputs: [{ name: 'automaticXmlCalculation', value: 'XML_ARITHMETIC_3', source: 'DERIVED/XML', treatment: 'INCLUDED' as const }, { name: 'xmlTreatment', value: 'PREVIOUS_ST', source: 'XML/ICMS', treatment: 'EXCLUDED' as const }, { name: 'answerCalculationMode', value: 'AUTOMATIC_XML', source: 'USER/current_item', treatment: 'UNDECIDED' as const }], steps: [{ name: 'Sem destaque', operation: '0', inputs: {}, result: '0.00' }] }
      const manual = { ...old, inputs: [{ name: 'answerRequestId', value: 'manual', source: 'USER/current_item', treatment: 'UNDECIDED' as const }] }
      const before = repository.save({ requestId: 'old', batchId: '00000000-0000-4000-8000-000000000003', documentId: '00000000-0000-4000-8000-000000000005', engineVersion: 'old', items: [{ itemNumber: '1', memory: old }, { itemNumber: '2', memory: manual }] })
      const legacyView = queryBatchDetail(db, '00000000-0000-4000-8000-000000000003').documents[0]!.items[0]!.calculation
      expect(legacyView.status).toBe('PENDING_RULE')
      expect(legacyView.result).toBeUndefined()
      expect(applyAutomaticXmlCalculations(db, '00000000-0000-4000-8000-000000000003')).toBe(0)
      const latest = repository.latestByDocument('00000000-0000-4000-8000-000000000005')!
      expect(latest.id).toBe(before.id)
      expect(queryBatchDetail(db, '00000000-0000-4000-8000-000000000003').documents[0]?.items[0]?.entryCalculationEligible).toBe(false)
      expect(before.items[0]?.memory.result?.amount).toBe('0.00')
      expect(latest.items[1]?.memory).toEqual(manual)
      expect(applyAutomaticXmlCalculations(db, '00000000-0000-4000-8000-000000000003')).toBe(0)
      expect(repository.latestByDocument('00000000-0000-4000-8000-000000000005')?.id).toBe(latest.id)
      const returnBatch = '00000000-0000-4000-8000-000000000006'
      const returnDoc = '00000000-0000-4000-8000-000000000007'
      const returnOccurrence = '00000000-0000-4000-8000-000000000008'
      const returned = { ...note, purposeCode: '4', accessKey: '2'.repeat(44), items: [item({ group: 'ICMS60', cst: '60' }, { cfop: '1411' })] }
      new SqliteBatchRepository(db).createWithOccurrences({ id: returnBatch, organizationId: '00000000-0000-4000-8000-000000000001', status: 'RECEBIDO', receivedAt: date, createdAt: date, updatedAt: date },
        [{ id: returnOccurrence, batchId: returnBatch, originalName: 'return.xml', relativePath: 'return.xml', detectedKind: 'XML', origin: 'SELECTED_FILE', contentHash: 'b'.repeat(64), sizeBytes: 100,
          order: 1, accessKey: returned.accessKey, ingestionStatus: 'PROCESSADA', repetition: 'ORIGINAL', contentConflict: 'SEM_CONFLITO', eligibleForTotalsByOccurrencePolicy: true, receivedAt: date }], [],
        [{ id: returnDoc, batchId: returnBatch, companyId: '00000000-0000-4000-8000-000000000002', occurrenceId: returnOccurrence, contentHash: 'b'.repeat(64), eligibleForProcessing: true, createdAt: date, normalized: returned }])
      applyAutomaticXmlCalculations(db, returnBatch)
      expect(queryBatchDetail(db, returnBatch).documents[0]?.items[0]?.entryCalculationEligible).toBe(false)

    } finally { db.close() }
  })
})
