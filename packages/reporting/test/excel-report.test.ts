import ExcelJS from 'exceljs'
import { describe, expect, it } from 'vitest'
import { createExcelWorkbook, excelMoney, generateExcelReport } from '../src/excel-report'
import { excelFixture } from './excel-report.fixture'
function column(sheet: ExcelJS.Worksheet, title: string): number {
  let found = 0
  sheet.getRow(5).eachCell((cell, index) => { if (cell.value === title) found = index })
  if (!found) throw new Error(`Coluna ausente: ${title}`)
  return found
}
describe('exportação XLSX de conferência', () => {
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
    expect(summary.getCell(6, column(summary, 'ICMS calculado (R$)')).value).toBe(120)
    expect(summary.getCell(6, column(summary, 'ICMS declarado elegível (R$)')).value).toBe(129.98)
    expect(summary.getCell(6, column(summary, 'ICMS declarado dos pares (R$)')).value).toBe(119.98)
    expect(summary.getCell(6, column(summary, 'Diferença líquida dos pares (R$)')).value).toBe(0.02)
    expect(summary.getCell(6, column(summary, 'Créditos de compras')).value).toBe('Não apurados')
    const items = book.getWorksheet('Itens')!
    expect(items.getCell(6, column(items, 'Chave de acesso')).value).toBe('0'.repeat(44))
    expect(items.getCell(6, column(items, 'Nota')).value).toBe('0001')
    expect(items.getCell(6, column(items, 'NCM')).value).toBe('01012100')
    expect(items.getCell(7, column(items, 'ICMS calculado (R$)')).value).toBeNull()
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
    expect(sheet.getCell(6, column(sheet, 'ICMS declarado original (R$)')).value).toBe('12345678901234567890.01')
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
