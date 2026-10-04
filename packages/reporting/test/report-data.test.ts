import { describe, expect, it } from 'vitest'
import type { BatchDetail } from '@motor/contracts'
import { buildReportData } from '../src/report-data'

const metadata = { generatedAt: '2026-10-01T20:00:00-03:00', appVersion: '0.1.0' }
function fixture(): BatchDetail {
  return {
    batch: { id: 'batch', status: 'COMPLETED', totalFiles: 2, totalDocuments: 1,
      totalPendencies: 99, receivedAt: '2026-10-01T10:00:00-03:00' },
    occurrences: [{ id: 'file', originalName: 'evento.xml', relativePath: 'pasta/evento.xml',
      kind: 'XML', origin: 'ZIP', contentHash: 'abc', sizeBytes: 100, ingestionStatus: 'NORMALIZED',
      repetition: 'UNIQUE', contentConflict: 'NONE', eligibleForTotals: false }],
    diagnostics: [{ id: 'diagnostic', source: 'erro.xml', code: 'INVALID_XML', message: 'XML inválido.' }],
    artifacts: [{ id: 'event', occurrenceId: 'file', kind: 'EVENT', envelope: 'evento',
      accessKey: '0'.repeat(44), version: '1.00', association: 'ORPHAN', responseMatches: false }],
    documents: [{ id: 'doc', accessKey: '1'.repeat(44), model: '55', number: '0001', series: '1',
      issuedAt: '2026-09-30T23:30:00-03:00', eligibleForProcessing: false, pendingReason: 'Conflito de conteúdo.',
      items: [{ itemNumber: '1', ncm: '01012100', classification: 'PENDENTE',
        classificationReason: 'PRODUCT_NOT_LINKED', declaredIcmsAmount: '12345678901234567890.01',
        ruleAssessment: { packId: 'local', packVersion: 1, assessedAt: '2026-10-01T10:00:00Z',
          context: { ncm: '01012100' }, kind: 'SELECTED', selectedRuleId: 'rule', selectedRuleVersion: 2,
          pendingCodes: ['PRODUTO_NAO_CLASSIFICADO'], evaluated: [{ ruleId: 'rule', ruleName: 'Histórica',
            version: 2, status: 'APPROVED', legalBasis: 'Fundamento salvo', exclusionReasons: [], mismatchedConditions: [] }] },
        calculation: { status: 'PENDING_DATA', runId: 'run', engineVersion: 'engine-1', reason: 'Base pendente.',
          inputs: [], steps: [], declared: { amount: '12345678901234567890.01' } } }] }],
    ruleAssessmentRuns: [{ id: 'assessment', number: 1, packId: 'local', packVersion: 1,
      assessedAt: '2026-10-01T10:00:00Z', itemCount: 1 }],
    originalAssessmentPack: { id: 'builtin', version: 1 },
  }
}

describe('snapshot de dados do relatório', () => {
  it('preserva valores declarados, datas fiscais, versões e documentos excluídos sem gerar totais', () => {
    const report = buildReportData(fixture(), metadata)
    expect(report.documents[0]).toMatchObject({ eligibleForProcessing: false, issuedAt: '2026-09-30T23:30:00-03:00' })
    expect(report.items[0]).toMatchObject({ documentId: 'doc', ncm: '01012100',
      declaredIcmsAmount: '12345678901234567890.01', calculation: { runId: 'run', engineVersion: 'engine-1' } })
    expect(report.items[0]?.calculation.result).toBeUndefined()
    expect(report.rules[0]).toMatchObject({ version: 2, legalBasis: 'Fundamento salvo', selected: true })
    expect(report.counts).toEqual({ documents: 1, items: 1, pendencies: 6, artifacts: 1, diagnostics: 1 })
    expect(report.pendencies.map((entry) => entry.scope)).toEqual([
      'DOCUMENT', 'CLASSIFICATION', 'RULE_SELECTION', 'CALCULATION', 'ARTIFACT', 'ARTIFACT'])
    expect(report.diagnostics[0]?.source).toBe('erro.xml')
    expect(report.originalAssessmentPack?.version).toBe(1)
  })
  it('isola e congela o snapshot sem congelar o lote original', () => {
    const source = fixture()
    const report = buildReportData(source, metadata)
    source.documents[0]!.items[0]!.calculation.reason = 'Alterado depois'
    expect(report.items[0]?.calculation.reason).toBe('Base pendente.')
    expect(Object.isFrozen(source)).toBe(false)
    expect(Object.isFrozen(report.items[0]?.calculation)).toBe(true)
    expect(() => { report.items[0]!.calculation.reason = 'Mutação' }).toThrow()
  })
  it('aceita lote vazio ou somente com erros de ingestão', () => {
    const source = fixture(); source.documents = []; source.artifacts = []; source.ruleAssessmentRuns = []
    expect(buildReportData(source, metadata).counts).toEqual({ documents: 0, items: 0,
      pendencies: 0, artifacts: 0, diagnostics: 1 })
  })
  it('aceita artefato associado e preserva cálculo disponível sem recalculá-lo', () => {
    const source = fixture()
    source.artifacts[0]!.association = 'ASSOCIATED'; source.artifacts[0]!.documentId = 'doc'
    source.artifacts[0]!.responseMatches = true
    source.documents[0]!.items[0]!.calculation = { status: 'CALCULATED', inputs: [], steps: [],
      result: { base: '10.00', rate: '12.00', amount: '1.20' } }
    const report = buildReportData(source, metadata)
    expect(report.items[0]?.calculation.result?.amount).toBe('1.20')
    expect(report.pendencies.some((entry) => entry.scope === 'CALCULATION' || entry.scope === 'ARTIFACT')).toBe(false)
  })
  it('recusa referências quebradas e identificadores duplicados', () => {
    const source = fixture(); source.artifacts[0]!.association = 'ASSOCIATED'
    expect(() => buildReportData(source, metadata)).toThrow(/documento ausente/)
    source.artifacts[0]!.documentId = 'doc'; source.artifacts[0]!.occurrenceId = 'missing'
    expect(() => buildReportData(source, metadata)).toThrow(/ocorrência ausente/)
    source.artifacts = []; source.documents = [...source.documents, source.documents[0]!]
    expect(() => buildReportData(source, metadata)).toThrow(/repetido/)
  })
  it('recusa metadados sem versão ou instante com fuso', () => {
    expect(() => buildReportData(fixture(), { ...metadata, appVersion: '' })).toThrow(/Metadados/)
    expect(() => buildReportData(fixture(), { ...metadata, generatedAt: '2026-10-01' })).toThrow(/Metadados/)
  })
})
