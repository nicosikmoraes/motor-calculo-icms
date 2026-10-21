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
describe('exportação XLSX de auditoria', () => {
  it('exporta um produto em uma única linha com ICMS, ICMS-ST e FCP-ST em colunas próprias', async () => {
    const report = structuredClone(excelFixture())
    const item = report.items[0]!
    report.items = [item]
    item.declaredIcmsStAmount = '30.00'; item.declaredFcpStAmount = '3.00'
    item.calculation.component = 'ICMS'
    item.calculation.additionalComponents = [
      { component: 'ICMS_ST', status: 'CALCULATED', inputs: [], steps: [], result: { component: 'ICMS_ST', base: '150.00', rate: '20', amount: '30.00' } },
      { component: 'FCP_ST', status: 'CALCULATED', inputs: [], steps: [], result: { component: 'FCP_ST', base: '150.00', rate: '2', amount: '3.00' } },
    ]
    report.consolidation = buildBatchConsolidation(report.batch.id, [{ documentId: item.documentId, documentNumber: '0001', accessKey: '0'.repeat(44),
      companyId: 'company', issuedAt: '2026-09-01', perspective: 'PURCHASES', environment: '1', authorization: 'WITH_PROTOCOL',
      items: [{ itemNumber: item.itemNumber, declaredIcms: item.declaredIcmsAmount, declaredIcmsSt: item.declaredIcmsStAmount,
        declaredFcpSt: item.declaredFcpStAmount, memory: { schemaVersion: 1, ...item.calculation } }] }])
    expect(report.consolidation.evidence).toHaveLength(3)
    const book = new ExcelJS.Workbook(); await book.xlsx.load(Buffer.from(await generateExcelReport(report, { layout: 'AUDIT' })) as never)
    const sheet = book.getWorksheet('Itens')!
    expect(sheet.rowCount).toBe(6)
    expect(book.worksheets[0]?.name).toBe('Itens')
    expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 5, xSplit: 5 })
    expect(sheet.getCell(6, column(sheet, 'Nota')).value).toBe('0001')
    expect(sheet.getCell(6, column(sheet, 'Produto')).value).toBe(item.description)
    for (const [name, declared, calculated] of [['ICMS', 119.98, 120], ['ICMS-ST', 30, 30], ['FCP-ST', 3, 3]] as const) {
      expect(sheet.getCell(6, column(sheet, `${name} declarado (R$)`)).value).toBe(declared)
      expect(sheet.getCell(6, column(sheet, `${name} calculado (R$)`)).value).toBe(calculated)
    }
  })
  it('mantém o mesmo código e número de item em notas diferentes como linhas distintas', () => {
    const report = structuredClone(excelFixture())
    const first = report.items[0]!, document = report.documents[0]!
    report.items = [first, { ...first, documentId: 'segunda-nota' }]
    report.documents = [document, { ...document, id: 'segunda-nota', number: '0002', accessKey: '1'.repeat(44) }]
    report.consolidation!.evidence = [report.consolidation!.evidence[0]!, {
      ...report.consolidation!.evidence[0]!, documentId: 'segunda-nota', documentNumber: '0002', accessKey: '1'.repeat(44),
    }]
    const sheet = createExcelWorkbook(report, { layout: 'AUDIT' }).getWorksheet('Itens')!
    expect(sheet.rowCount).toBe(7)
    expect(sheet.getCell(6, column(sheet, 'Nota')).value).toBe('0001')
    expect(sheet.getCell(7, column(sheet, 'Nota')).value).toBe('0002')
    expect(sheet.getCell(6, column(sheet, 'Código do produto')).value).toBe(first.supplierProductCode)
    expect(sheet.getCell(7, column(sheet, 'Código do produto')).value).toBe(first.supplierProductCode)
    expect(sheet.getCell(7, column(sheet, 'Item')).value).toBe('1')
  })
  it('não totaliza resultados de um produto excluído, mas preserva a memória e o XML na mesma linha', () => {
    const report = structuredClone(excelFixture())
    report.consolidation!.evidence[0]!.status = 'EXCLUDED'
    const sheet = createExcelWorkbook(report, { layout: 'AUDIT' }).getWorksheet('Itens')!
    expect(sheet.getCell(6, column(sheet, 'Situação fiscal')).value).toBe('Excluído')
    expect(sheet.getCell(6, column(sheet, 'ICMS calculado (R$)')).value).toBeNull()
    expect(sheet.getCell(6, column(sheet, 'Diferença ICMS (R$)')).value).toBeNull()
    expect(sheet.getCell(6, column(sheet, 'ICMS declarado (R$)')).value).toBe(119.98)
    expect(sheet.getCell(6, column(sheet, 'Imposto salvo para auditoria ICMS (R$)')).value).toBe(120)
  })
  it('mantém FCP-ST pendente na linha do produto sem inventar um valor calculado', () => {
    const report = structuredClone(excelFixture()), item = report.items[0]!
    report.items = [item]
    item.declaredFcpStAmount = '3.00'
    item.calculation.additionalComponents = [{ component: 'FCP_ST', status: 'PENDING_DATA', inputs: [], steps: [], reason: 'Confirme o FCP-ST.' }]
    report.consolidation = buildBatchConsolidation(report.batch.id, [{ documentId: item.documentId, documentNumber: '0001', accessKey: '0'.repeat(44),
      companyId: 'company', issuedAt: '2026-09-01', perspective: 'PURCHASES', environment: '1', authorization: 'WITH_PROTOCOL',
      items: [{ itemNumber: item.itemNumber, declaredIcms: item.declaredIcmsAmount, declaredFcpSt: item.declaredFcpStAmount,
        memory: { schemaVersion: 1, ...item.calculation } }] }])
    const sheet = createExcelWorkbook(report, { layout: 'AUDIT' }).getWorksheet('Itens')!
    expect(sheet.rowCount).toBe(6)
    expect(sheet.getCell(6, column(sheet, 'Situação fiscal')).value).toBe('Pendente')
    expect(sheet.getCell(6, column(sheet, 'ICMS calculado (R$)')).value).toBe(120)
    expect(sheet.getCell(6, column(sheet, 'FCP-ST declarado (R$)')).value).toBe(3)
    expect(sheet.getCell(6, column(sheet, 'FCP-ST calculado (R$)')).value).toBeNull()
    expect(sheet.getCell(6, column(sheet, 'Motivo')).text).toContain('Confirme o FCP-ST.')
  })
  it('não omite produtos quando a consolidação não tem evidência para eles', () => {
    const report = structuredClone(excelFixture())
    report.consolidation!.evidence = []
    const sheet = createExcelWorkbook(report, { layout: 'AUDIT' }).getWorksheet('Itens')!
    expect(sheet.rowCount).toBe(7)
    expect(sheet.getCell(6, column(sheet, 'Situação fiscal')).value).toBe('Sem consolidação')
    expect(sheet.getCell(6, column(sheet, 'ICMS calculado (R$)')).value).toBeNull()
    expect(sheet.getCell(6, column(sheet, 'Produto')).value).toBe(report.items[0]!.description)
  })
  it('exporta divergência de MVA em percentual sem tratá-la como dinheiro', () => {
    const report = structuredClone(excelFixture())
    report.consolidation!.evidence[0]!.comparisons = [{ component: 'MVA', calculated: '47.77', declared: '0', difference: '47.77',
      tolerance: '0.0001', status: 'DIFFERENT' }]
    const sheet = createExcelWorkbook(report, { layout: 'AUDIT' }).getWorksheet('Divergências')!
    let mvaRow = 0
    sheet.eachRow((row, index) => { if (row.getCell(column(sheet, 'Campo conferido')).value === 'MVA') mvaRow = index })
    expect(mvaRow).toBeGreaterThan(5)
    expect(sheet.getCell(mvaRow, column(sheet, 'Unidade')).value).toBe('%')
    expect(sheet.getCell(mvaRow, column(sheet, 'Diferença calculado - declarado (R$)')).value).toBeNull()
  })
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
    const book = createExcelWorkbook(report, { layout: 'AUDIT' })
    const sheet = book.getWorksheet('Itens')!
    expect(sheet.getCell(6, column(sheet, 'Componentes conferidos')).value).toBe('ICMS-ST')
    expect(sheet.getCell(6, column(sheet, 'ICMS-ST declarado (R$)')).value).toBe(106.30)
    expect(sheet.getCell(6, column(sheet, 'ICMS declarado (R$)')).value).toBe(119.98)
    expect(sheet.getCell(6, column(sheet, 'ICMS calculado (R$)')).value).toBeNull()
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
    const sheet = createExcelWorkbook(report, { layout: 'AUDIT' }).getWorksheet('Itens')!
    expect(sheet.getCell(6, column(sheet,'MVA aplicada (%)')).value).toBe('58.54')
    expect(sheet.getCell(6, column(sheet,'ICMS-ST calculado (R$)')).value).toBeNull()
    expect(sheet.getCell(6, column(sheet,'Regra específica da MVA')).text).toContain('58.54')
  })
  it('gera arquivo reabrível com quatro abas, filtros, cabeçalhos fixos e números conciliados', async () => {
    const report = excelFixture()
    const bytes = await generateExcelReport(report, { layout: 'AUDIT' })
    const book = new ExcelJS.Workbook(); await book.xlsx.load(Buffer.from(bytes) as never)
    expect(book.worksheets.map(s => s.name)).toEqual(['Itens', 'Resumo', 'Divergências', 'Pendências e exclusões'])
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
    expect(items.getCell(7, column(items, 'ICMS calculado (R$)')).value).toBeNull()
    expect(items.getCell(6, column(items, 'Componentes conferidos')).value).toBe('ICMS')
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
    const book = new ExcelJS.Workbook(); await book.xlsx.load(Buffer.from(await generateExcelReport(report, { layout: 'AUDIT' })) as never)
    const sheet = book.getWorksheet('Itens')!
    expect(sheet.getCell(6, column(sheet, 'Produto')).value).toBe(report.items[0]!.description)
    expect(sheet.getCell(6, column(sheet, 'Produto')).type).toBe(ExcelJS.ValueType.String)
    expect(sheet.getCell(6, column(sheet, 'ICMS declarado (R$)')).value).toBe('12345678901234567890.01')
    for (const s of book.worksheets) s.eachRow(row => row.eachCell(cell => expect(cell.type).not.toBe(ExcelJS.ValueType.Formula)))
  })
  it('mostra abas vazias sem inventar registros e recusa consolidação ausente', () => {
    const report = structuredClone(excelFixture())
    report.consolidation!.groups = []; report.consolidation!.evidence = []
    const book = createExcelWorkbook(report, { layout: 'AUDIT' })
    expect(book.getWorksheet('Resumo')!.getCell('A6').value).toBe('Nenhum registro nesta aba.')
    delete report.consolidation
    expect(() => createExcelWorkbook(report, { layout: 'AUDIT' })).toThrow('Consolidação')
  })
})
