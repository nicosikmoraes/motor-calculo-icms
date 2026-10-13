import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { createExcelWorkbook, excelMoney, generateExcelReport } from '../src/excel-report'
import { excelFixture } from './excel-report.fixture'
import { buildBatchConsolidation } from '../src/consolidation'
function column(sheet: ExcelJS.Worksheet, title: string): number {
  let found = 0
  sheet.getRow(5).eachCell((cell, index) => { if (cell.value === title) found = index })
  if (!found) throw new Error(`Coluna ausente: ${title}`)
  return found
}
describe('exportação XLSX de conferência', () => {
  it('identifica o componente e exporta o ST declarado em vez do ICMS próprio da mesma nota', () => {
    const report = structuredClone(excelFixture())
    const item = report.items[0]!
    item.declaredIcmsStAmount = '106.30'
    item.calculation = { component: 'ICMS_ST', status: 'CALCULATED', inputs: [], steps: [],
      result: { component: 'ICMS_ST', base: '648.61', rate: '19.5', amount: '106.30' } }
    report.consolidation = buildBatchConsolidation(report.batch.id, [{ documentId: item.documentId, documentNumber: '0001',
      accessKey: '0'.repeat(44), companyId: 'company', issuedAt: '2026-09-01', perspective: 'PURCHASES', environment: '1',
      authorization: 'UNVERIFIED', items: [{ itemNumber: item.itemNumber, declaredIcms: item.declaredIcmsAmount,
        declaredIcmsSt: item.declaredIcmsStAmount, memory: { schemaVersion: 1, ...item.calculation } }] }])
    const book = createExcelWorkbook(report)
    const sheet = book.getWorksheet('Itens')!
    expect(sheet.getCell(6, column(sheet, 'Componente calculado')).value).toBe('ICMS-ST')
    expect(sheet.getCell(6, column(sheet, 'Imposto declarado original (R$)')).value).toBe(106.30)
    const summary = book.getWorksheet('Resumo')!
    expect(summary.getCell(6, column(summary, 'Componente conferido')).value).toBe('ICMS-ST')
    expect(book.getWorksheet('Pendências e exclusões')!.getColumn(6).values).not.toContain('Diferimento')
  })
  it('exporta a decisão específica da MVA mesmo quando o imposto ainda não pode ser concluído', () => {
    const report = structuredClone(excelFixture())
    const item = report.items[0]!
    item.calculation = { component: 'ICMS_ST', status: 'PENDING_DATA', inputs: [{ name: 'stSpecificMvaDecision',
      value: JSON.stringify({ status: 'CALCULATED', originalMvaPercent: '30', appliedMvaPercent: '58.54', article: 11 }),
      source: 'RULE/PR_ST_MVA_FUEL_VEHICLE_571/v1', treatment: 'INCLUDED' }], steps: [], reason: 'Falta conferir o imposto.' }
    report.consolidation = buildBatchConsolidation(report.batch.id, [{ documentId: 'doc', companyId: 'company', documentNumber: '1',
      accessKey: '0'.repeat(44), issuedAt: '2026-09-01', perspective: 'PURCHASES', environment: '1', authorization: 'UNVERIFIED',
      items: [{ itemNumber: '1', memory: { schemaVersion: 1, ...item.calculation } }] }])
    const sheet = createExcelWorkbook(report).getWorksheet('Itens')!
    expect(sheet.getCell(6, column(sheet,'MVA aplicada (%)')).value).toBe('58.54')
    expect(sheet.getCell(6, column(sheet,'Imposto calculado (R$)')).value).toBeNull()
    expect(sheet.getCell(6, column(sheet,'Regra específica da MVA')).text).toContain('58.54')
  })
  it('gera arquivo reabrível com quatro abas, filtros, cabeçalhos fixos e números conciliados', async () => {
    const report = excelFixture()
    const bytes = await generateExcelReport(report)
    const book = new ExcelJS.Workbook(); await book.xlsx.load(Buffer.from(bytes) as never)
    expect(book.worksheets.map(s => s.name)).toEqual(['Resumo', 'Itens', 'Divergências', 'Pendências e exclusões'])
    for (const sheet of book.worksheets) {
      expect(sheet.autoFilter).toBeTruthy()
      expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 5 })
      expect(sheet.getCell('A3').text).toContain('lote-teste')
    }
    const summary = book.getWorksheet('Resumo')!
    expect(summary.getCell(6, column(summary, 'Imposto calculado (R$)')).value).toBe(120)
    expect(summary.getCell(6, column(summary, 'Imposto declarado elegível (R$)')).value).toBe(129.98)
    expect(summary.getCell(6, column(summary, 'Imposto declarado dos pares (R$)')).value).toBe(119.98)
    expect(summary.getCell(6, column(summary, 'Diferença líquida dos pares (R$)')).value).toBe(0.02)
    expect(summary.getCell(6, column(summary, 'Créditos de compras')).value).toBe('Não apurados')
    const items = book.getWorksheet('Itens')!
    expect(items.getCell(6, column(items, 'Chave de acesso')).value).toBe('0'.repeat(44))
    expect(items.getCell(6, column(items, 'Nota')).value).toBe('0001')
    expect(items.getCell(6, column(items, 'NCM')).value).toBe('01012100')
    expect(items.getCell(7, column(items, 'Imposto calculado (R$)')).value).toBeNull()
    expect(items.getCell(6, column(items, 'Componente calculado')).value).toBe('ICMS')
    expect(book.getWorksheet('Divergências')!.getCell('F6').value).toBe('0001')
    const pend = book.getWorksheet('Pendências e exclusões')!
    expect(pend.getColumn(8).values).toContain('Defina a destinação.')
    expect(pend.getColumn(8).values).toContain('XML inválido.')
    expect(report.consolidation?.groups[0]?.totals.calculatedIcms).toBe('120.00')
  })
  it('preserva números enormes como texto e nunca interpreta XML como fórmula', async () => {
    expect(excelMoney('12345678901234567890.01')).toBe('12345678901234567890.01')
    expect(excelMoney('9999999999999.99')).toBe(9999999999999.99)
    expect(excelMoney('-0.02')).toBe(-0.02)
    expect(excelMoney('inválido')).toBe('inválido')
    const report = structuredClone(excelFixture())
    report.items[0]!.description = '=HYPERLINK("https://example.com", "abrir")'
    report.items[0]!.declaredIcmsAmount = '12345678901234567890.01'
    const book = new ExcelJS.Workbook(); await book.xlsx.load(Buffer.from(await generateExcelReport(report)) as never)
    const sheet = book.getWorksheet('Itens')!
    expect(sheet.getCell(6, column(sheet, 'Produto')).value).toBe(report.items[0]!.description)
    expect(sheet.getCell(6, column(sheet, 'Produto')).type).toBe(ExcelJS.ValueType.String)
    expect(sheet.getCell(6, column(sheet, 'Imposto declarado original (R$)')).value).toBe('12345678901234567890.01')
    for (const s of book.worksheets) s.eachRow(row => row.eachCell(cell => expect(cell.type).not.toBe(ExcelJS.ValueType.Formula)))
  })
  it('mostra abas vazias sem inventar registros e recusa consolidação ausente', () => {
    const report = structuredClone(excelFixture())
    report.consolidation!.groups = []; report.consolidation!.evidence = []
    const book = createExcelWorkbook(report)
    expect(book.getWorksheet('Resumo')!.getCell('A6').value).toBe('Nenhum registro nesta aba.')
    delete report.consolidation
    expect(() => createExcelWorkbook(report)).toThrow('Consolidação')
  })
})
