import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { buildBatchConsolidation } from '../src/consolidation'
import { createExcelWorkbook, generateExcelReport } from '../src/excel-report'
import { buildExcelItemRows } from '../src/excel-item-rows'
import { itemCalculationStatus } from '@motor/contracts'
import { excelFixture } from './excel-report.fixture'

function fixture() {
  const report = structuredClone(excelFixture())
  report.items = [report.items[0]!]
  report.consolidation!.evidence = [report.consolidation!.evidence[0]!]
  return report
}

describe('Excel simples aprovado', () => {
  it('reabre uma única aba sem filtros, tabelas, mesclagens ou painéis congelados', async () => {
    const book = new ExcelJS.Workbook()
    await book.xlsx.load(Buffer.from(await generateExcelReport(excelFixture())) as never)
    expect(book.worksheets.map(s => s.name)).toEqual(['Produtos'])
    const sheet = book.worksheets[0]!
    expect(sheet.rowCount).toBe(4)
    expect(sheet.columnCount).toBe(7)
    expect(sheet.autoFilter).toBeUndefined()
    expect(sheet.getTables()).toEqual([])
    expect(sheet.model.merges).toEqual([])
    expect(sheet.views.every(v => v.state === 'normal')).toBe(true)
    expect(sheet.getCell('D1').value).toBe('ICMS declarado\nno XML (R$)')
    expect(sheet.getCell('E1').value).toBe('ICMS calculado\n(R$)')
    expect(sheet.getCell('E2').value).toBe(120)
    expect(sheet.getCell('E3').value).toBe('Pendente')
    expect(sheet.getCell('C4').value).toBe('TOTAL PARCIAL')
    expect(sheet.getCell('E4').value).toBe(120)
  })
  it('mantém 92 linhas físicas de duas notas sem confundir o mesmo número de item', () => {
    const report = fixture(), first = report.items[0]!, doc = report.documents[0]!, anchor = report.consolidation!.evidence[0]!
    report.documents = [doc, { ...doc, id: 'segunda', number: '0002', accessKey: '1'.repeat(44) }]
    report.items = [15, 77].flatMap((count, note) => Array.from({ length: count }, (_, n) => ({ ...first, documentId: note ? 'segunda' : doc.id, itemNumber: String(n + 1) })))
    report.consolidation!.evidence = report.items.map(i => ({ ...anchor, documentId: i.documentId, itemNumber: i.itemNumber }))
    const sheet = createExcelWorkbook(report).worksheets[0]!
    expect(sheet.rowCount).toBe(94)
    expect(sheet.getCell('A2').value).toBe(doc.number)
    expect(sheet.getCell('A17').value).toBe('0002')
    expect(sheet.getCell('B17').value).toBe('1')
    expect(sheet.getCell('B93').value).toBe('77')
    expect(sheet.getCell('E94').value).toBe(11040)
  })
  it('separa ICMS próprio declarado, ST calculada e FCP sem somar a conferência própria à ST', () => {
    const report = fixture(), item = report.items[0]!
    item.calculation.component = 'ICMS'
    item.calculation.additionalComponents = [
      { component: 'ICMS_ST', status: 'CALCULATED', inputs: [], steps: [], result: { component: 'ICMS_ST', base: '150.00', rate: '20', amount: '30.00' } },
      { component: 'FCP_ST', status: 'CALCULATED', inputs: [], steps: [], result: { component: 'FCP_ST', base: '150.00', rate: '2', amount: '3.00' } },
    ]
    report.consolidation = buildBatchConsolidation(report.batch.id, [{ documentId: item.documentId, documentNumber: '0001', accessKey: '0'.repeat(44), companyId: 'company',
      issuedAt: '2026-09-01', perspective: 'PURCHASES', environment: '1', authorization: 'WITH_PROTOCOL',
      items: [{ itemNumber: item.itemNumber, declaredIcms: '119.98', memory: { schemaVersion: 1, ...item.calculation } }] }])
    const sheet = createExcelWorkbook(report).worksheets[0]!
    expect(sheet.getCell('D2').value).toBe(119.98)
    expect(sheet.getCell('E2').value).toBe(30)
    expect(sheet.getCell('F2').value).toBe(3)
    expect(sheet.getCell('G2').value).toBe('ICMS-ST')
    expect(sheet.getCell('E3').value).toBe(30)
  })
  it.each(['EXCLUDED', 'PENDING', 'UNSUPPORTED'] as const)('não transforma %s em zero calculado nem soma o resultado histórico', status => {
    const report = fixture()
    report.consolidation!.evidence[0]!.status = status
    const sheet = createExcelWorkbook(report).worksheets[0]!
    expect(typeof sheet.getCell('E2').value).toBe('string')
    expect(sheet.getCell('D2').value).toBe(119.98)
    expect(sheet.getCell('E3').value).toBe(0)
    expect(sheet.getCell('C3').value).toBe('TOTAL PARCIAL')
  })
  it('mantém valor salvo que exige revisão fora do subtotal', () => {
    const report = fixture()
    report.items[0]!.calculation.reviewReason = 'Condições da operação mudaram.'
    const sheet = createExcelWorkbook(report).worksheets[0]!
    expect(sheet.getCell('E2').value).toBe('Revisar')
    expect(sheet.getCell('E3').value).toBe(0)
  })
  it('não soma FCP histórico quando a base do ICMS exige revisão', () => {
    const report = fixture()
    report.items[0]!.calculation.reviewReason = 'Revise a base.'
    report.consolidation!.evidence.push({ ...report.consolidation!.evidence[0]!, component: 'FCP_ST', calculatedIcms: '3.00' })
    const sheet = createExcelWorkbook(report).worksheets[0]!
    expect(sheet.getCell('F2').value).toBe('Pendente')
    expect(sheet.getCell('F3').value).toBe(0)
  })
  it('preserva o ICMS conhecido quando só o FCP está pendente', () => {
    const report = fixture()
    report.consolidation!.evidence.push({ ...report.consolidation!.evidence[0]!, component: 'FCP_ST', status: 'PENDING', reasons: ['Confirme o FCP.'] })
    const sheet = createExcelWorkbook(report).worksheets[0]!
    expect(sheet.getCell('E2').value).toBe(120)
    expect(sheet.getCell('F2').value).toBe('Pendente')
    expect(sheet.getCell('G2').text).toContain('FCP pendente')
  })
  it('preserva texto de XML como texto e dinheiro de alta precisão sem perda', async () => {
    const report = fixture()
    report.items[0]!.description = '=HYPERLINK("https://example.com", "abrir")'
    report.items[0]!.declaredIcmsAmount = '12345678901234567890.01'
    const book = new ExcelJS.Workbook(); await book.xlsx.load(Buffer.from(await generateExcelReport(report)) as never)
    const sheet = book.worksheets[0]!
    expect(sheet.getCell('C2').value).toBe(report.items[0]!.description)
    expect(sheet.getCell('C2').type).toBe(ExcelJS.ValueType.String)
    expect(sheet.getCell('D2').value).toBe('12345678901234567890.01')
    expect(sheet.getCell('D3').value).toBe('12345678901234567890.01')
  })
  it('usa o mesmo modelo no mês e não inventa linhas em mês vazio', () => {
    const report = fixture()
    report.monthly = { companyId: 'company', companyName: 'Empresa', period: '2026-09', batches: [] }
    expect(createExcelWorkbook(report).worksheets.map(s => s.name)).toEqual(['Produtos'])
    report.items = []; report.consolidation!.evidence = []
    expect(createExcelWorkbook(report).worksheets[0]!.rowCount).toBe(1)
  })
  it.each(['CALCULATED', 'PENDING_RULE'] as const)('não trata documento %s como imposto zero, mesmo com evidência antiga', oldStatus => {
    const report = fixture(), item = report.items[0]!
    item.calculation = { status: oldStatus, component: 'ICMS_ST', inputs: [
      { name: 'automaticXmlCalculation', value: 'XML_ARITHMETIC_3', source: 'DERIVED/XML', treatment: 'INCLUDED' },
      { name: 'xmlTreatment', value: 'PREVIOUS_ST', source: 'XML/ICMS', treatment: 'UNDECIDED' },
      { name: 'retainedStAmount', value: '41.43', source: 'XML/ICMS', treatment: 'EXCLUDED' },
      { name: 'retainedFcpStAmount', value: '3.31', source: 'XML/ICMS', treatment: 'EXCLUDED' },
    ], steps: [], ...(oldStatus === 'CALCULATED' ? { result: { component: 'ICMS_ST', base: '0.00', rate: '0', amount: '0.00' } } : {}) }
    expect(itemCalculationStatus(item.calculation)).toBe('PENDING_RULE')
    // A planilha também se protege quando recebe evidência de uma versão anterior.
    report.consolidation!.evidence[0]!.component = 'ICMS_ST'
    const sheet = createExcelWorkbook(report).worksheets[0]!
    expect(sheet.getCell('E2').value).toBe('Não apurado')
    expect(sheet.getCell('F2').value).toBe('Não apurado')
    expect(sheet.getCell('G2').text).toContain('41,43')
    expect(sheet.getCell('E3').value).toBe(0)
    expect(sheet.getCell('C3').value).toBe('TOTAL PARCIAL')
    const audit = buildExcelItemRows(report)
    const value = (title: string) => audit.rows[0]![audit.columns.findIndex(column => column.title === title)]
    expect(value('Situação fiscal')).toBe('Não apurado')
    expect(value('ICMS-ST calculado (R$)')).toBeUndefined()
    expect(value('Imposto salvo para auditoria ICMS-ST (R$)')).toBeUndefined()
    expect(value('ST anterior informada (R$)')).toBe('41.43')
    expect(value('FCP-ST anterior informado (R$)')).toBe('3.31')
    report.consolidation = buildBatchConsolidation(report.batch.id, [{ documentId: item.documentId, documentNumber: '0001', accessKey: '0'.repeat(44), companyId: 'company', issuedAt: '2026-09-01', perspective: 'PURCHASES', environment: '1', authorization: 'WITH_PROTOCOL', items: [{ itemNumber: item.itemNumber, memory: { schemaVersion: 1, ...item.calculation } }] }])
    expect(report.consolidation.counts).toMatchObject({ calculated: 0, pending: 1 })
    expect(report.consolidation.evidence[0]?.calculatedIcms).toBeUndefined()
  })

})
