import ExcelJS from 'exceljs'
import type { ConsolidationEvidence } from '@motor/contracts'
import { roundMoney } from '@motor/tax-engine'
import type { ReportData } from './report-data'

type Value = string | number | undefined
interface Column { title: string; width?: number; money?: boolean }
const text = (title: string, width = 24): Column => ({ title, width })
const monetary = (title: string): Column => ({ title: `${title} (R$)`, width: 25, money: true })
const labels: Record<string, string> = { SALES: 'Vendas', PURCHASES: 'Compras', UNDETERMINED: 'Não identificada',
  WITH_PROTOCOL: 'Com protocolo associado', UNVERIFIED: 'Sem protocolo confirmado — provisório',
  CALCULATED: 'Calculado', PENDING: 'Pendente', UNSUPPORTED: 'Fora do escopo', EXCLUDED: 'Excluído',
  DOCUMENT: 'Documento', CLASSIFICATION: 'Classificação cadastral', RULE_SELECTION: 'Enquadramento da regra', ARTIFACT: 'Protocolo / evento',
  PRODUCT_NOT_LINKED: 'Produto não vinculado', PROFILE_NOT_FOUND: 'Perfil fiscal não encontrado', PROFILE_INACTIVE: 'Perfil fiscal inativo',
  COMPANY_MISSING: 'Empresa não identificada', PENDING_DATA: 'Dados pendentes', PENDING_RULE: 'Regra pendente',
  MATCH: 'Igual', WITHIN_TOLERANCE: 'Dentro da tolerância', DIFFERENT: 'Divergente', NOT_DECLARED: 'Não declarado', INVALID_DECLARED: 'Declarado inválido' }
const label = (value: string) => labels[value] ?? value
const environment = (value: string) => value === '1' ? 'Produção' : value === '2' ? 'Homologação' : 'Não identificado'
/** Excel preserva até 15 dígitos: excedentes ou inválidos ficam como texto exato. */
export function excelMoney(value?: string): Value {
  if (value === undefined) return undefined
  if (!/^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) return value
  try {
    const canonical = roundMoney(value)
    const digits = canonical.replace(/[-.]/g, '').replace(/^0+/, '')
    const numeric = Number(canonical)
    return digits.length <= 15 && Number.isFinite(numeric) && numeric.toFixed(2) === canonical ? numeric : value
  } catch { return value }
}
function addSheet(book: ExcelJS.Workbook, report: ReportData, name: string, columns: Column[], rows: Value[][]): void {
  if (rows.length > 1_048_571) throw new Error(`A aba ${name} excede o limite de linhas do Excel.`)
  const sheet = book.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 5, xSplit: 1 }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: false, printTitlesRow: '1:5' } })
  sheet.columns = columns.map(column => ({ width: column.width ?? 24 }))
  for (const [row, value] of [
    [1, `ContabiliNico · ${name}`],
    [2, `${report.monthly ? 'Conferência mensal entre lotes' : 'Conferência do lote'}, por mês de emissão. Sem apuração de crédito ou saldo a recolher. Valores acima da precisão do Excel permanecem como texto.`],
    [3, `${report.monthly ? `Empresa: ${report.monthly.companyName} · Mês: ${report.monthly.period} · Lotes: ${report.monthly.batches.length}` : `Lote: ${report.batch.id}`} · Exportado: ${report.metadata.generatedAt} · Aplicativo: ${report.metadata.appVersion} · Layout XLSX: 1`],
  ] as const) {
    sheet.mergeCells(row, 1, row, Math.min(4, columns.length))
    sheet.getCell(row, 1).value = value
    sheet.getCell(row, 1).alignment = { wrapText: true, vertical: 'middle' }
  }
  sheet.getRow(1).height = 28; sheet.getRow(2).height = 60; sheet.getRow(3).height = 44
  sheet.getCell('A1').font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF17365D' } }
  sheet.getRow(5).values = columns.map(column => column.title)
  sheet.getRow(5).height = 56
  sheet.getRow(5).eachCell(cell => {
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF17365D' } }
    cell.alignment = { wrapText: true, vertical: 'middle' }
  })
  rows.forEach((values, index) => {
    const row = sheet.getRow(index + 6)
    let lines = 1
    columns.forEach((column, colIndex) => {
      const original = values[colIndex]
      if (typeof original === 'string' && original.length > 32_767) throw new Error(`Texto excede o limite do Excel na aba ${name}.`)
      const value = column.money && typeof original === 'string' ? excelMoney(original) : original
      const cell = row.getCell(colIndex + 1)
      // Strings são células textuais, nunca fórmulas ou hyperlinks, inclusive conteúdo vindo do XML.
      cell.value = value ?? null
      cell.numFmt = typeof value === 'number' && column.money ? '"R$" #,##0.00;[Red]-"R$" #,##0.00' : typeof value === 'string' ? '@' : '0'
      cell.font = { name: 'Calibri', size: 11 }
      cell.alignment = { vertical: 'top', wrapText: true, ...(column.money ? { horizontal: 'right' as const } : {}) }
      if (index % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5FA' } }
      if (typeof value === 'string') lines = Math.max(lines, ...value.split('\n').map(line => Math.ceil(line.length / Math.max(1, (column.width ?? 24) - 2))))
    })
    row.height = Math.min(409, Math.max(22, lines * 15 + 6))
  })
  sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: Math.max(5, rows.length + 5), column: columns.length } }
  if (!rows.length) { sheet.getCell('A6').value = 'Nenhum registro nesta aba.'; sheet.getRow(6).height = 24 }
}

/** Exporta um snapshot, sem fórmulas fiscais ou recálculo pelo Excel. */
export function createExcelWorkbook(report: ReportData): ExcelJS.Workbook {
  const summary = report.consolidation
  if (!summary || summary.batchId !== report.batch.id) throw new Error('Consolidação do lote ausente ou incompatível.')
  const book = new ExcelJS.Workbook()
  book.creator = 'ContabiliNico'; book.created = new Date(report.metadata.generatedAt)
  const documents = new Map(report.documents.map(document => [document.id, document]))
  const items = new Map(report.items.map(item => [JSON.stringify([item.documentId, item.itemNumber]), item]))
  const companyNames = new Map(summary.groups.map(group => [group.companyId, group.companyName]))
  const identity = (entry: ConsolidationEvidence): Value[] => [companyNames.get(entry.companyId) ?? 'Empresa não identificada', entry.period,
    label(entry.perspective), environment(entry.environment), label(entry.authorization), entry.documentNumber,
    documents.get(entry.documentId)?.series, entry.accessKey, entry.itemNumber, ...(report.monthly ? [entry.batchId, report.monthly.batches.find(b => b.id === entry.batchId)?.name] : [])]
  const identityColumns = [text('Empresa', 32), text('Mês de emissão', 18), text('Operação', 20), text('Ambiente', 20),
    text('Autorização', 38), text('Nota', 16), text('Série', 12), text('Chave de acesso', 50), text('Item', 10), ...(report.monthly ? [text('Lote de origem', 40), text('Nome do lote', 36)] : [])]
  addSheet(book, report, 'Resumo', [text('Empresa', 32), text('Mês de emissão', 18), text('Operação', 20), text('Ambiente', 20), text('Autorização', 38),
    monetary('Base calculada'), monetary('ICMS calculado'), monetary('ICMS declarado elegível'), monetary('ICMS diferido conhecido'),
    monetary('ICMS calculado dos pares'), monetary('ICMS declarado dos pares'), monetary('Diferença líquida dos pares'), monetary('Soma das diferenças absolutas'),
    ...['Notas', 'Itens', 'Calculados', 'Pendentes', 'Fora do escopo', 'Excluídos', 'Itens comparáveis', 'Divergências acima de R$ 0,01',
      'Diferenças dentro da tolerância', 'Declaração ausente', 'Declaração inválida', 'Diferimento sem informação'].map(title => text(title)), text('Créditos de compras', 30)],
    summary.groups.map(g => [g.companyName ?? 'Empresa não identificada', g.period, label(g.perspective), environment(g.environment), label(g.authorization),
      g.totals.calculatedBase, g.totals.calculatedIcms, g.totals.declaredIcms, g.totals.deferredIcms,
      g.totals.comparedCalculatedIcms, g.totals.comparedDeclaredIcms, g.totals.difference, g.totals.absoluteDifferences,
      g.counts.documents, g.counts.items, g.counts.calculated, g.counts.pending, g.counts.unsupported, g.counts.excluded,
      g.counts.comparableItems, g.counts.divergentItems, g.counts.withinToleranceItems, g.counts.declaredMissing, g.counts.declaredInvalid,
      g.counts.deferredMissing, 'Não apurados']))
  addSheet(book, report, 'Itens', [...identityColumns, text('Código do produto'), text('Produto', 50), text('NCM', 14), text('CFOP', 14),
    text('Emissão original no XML', 30), text('Situação fiscal'), monetary('Base calculada'), monetary('ICMS calculado'),
    monetary('ICMS declarado original'), monetary('ICMS diferido conhecido'), monetary('Diferença calculado - declarado'),
    text('Comparação'), text('Motivo', 60), text('Execução do cálculo', 40), text('Versão do motor'), text('Regra fiscal', 40), text('Versão da regra')],
    summary.evidence.map(entry => {
      const item = items.get(JSON.stringify([entry.documentId, entry.itemNumber]))
      if (!item || !documents.has(entry.documentId)) throw new Error('Evidência referencia item ou documento ausente.')
      return [...identity(entry), item.supplierProductCode, item.description, item.ncm, item.cfop, documents.get(entry.documentId)?.issuedAt,
        label(entry.status), entry.status === 'CALCULATED' ? item.calculation.result?.base : undefined, entry.calculatedIcms,
        item.declaredIcmsAmount, entry.deferredIcms, entry.comparison?.difference, entry.comparison ? label(entry.comparison.status) : 'Sem comparação',
        entry.reasons.join('\n'), entry.runId, entry.engineVersion, item.calculation.rule?.id, item.calculation.rule?.version]
    }))
  addSheet(book, report, 'Divergências', [...identityColumns, monetary('ICMS calculado'), monetary('ICMS declarado'),
    monetary('Diferença calculado - declarado'), monetary('Tolerância por item'), text('Comparação'), text('Execução do cálculo', 40), text('Versão do motor')],
    summary.evidence.filter(e => e.comparison && e.comparison.status !== 'MATCH').map(e => [...identity(e), e.calculatedIcms, e.declaredIcms,
      e.comparison?.difference, e.comparison?.tolerance, label(e.comparison!.status), e.runId, e.engineVersion]))
  const pendingColumns = [text('Empresa', 32), text('Mês de emissão', 18), text('Nota', 16), text('Chave de acesso', 50), text('Item', 10),
    text('Categoria', 26), text('Código / situação', 32), text('Motivo', 70), text('Documento / origem', 45)]
  const pendingRows: Value[][] = summary.evidence.flatMap(e => {
    const rows: Value[][] = []
    const base: Value[] = [companyNames.get(e.companyId) ?? 'Empresa não identificada', e.period, e.documentNumber, e.accessKey, e.itemNumber]
    if (e.status !== 'CALCULATED') rows.push([...base, 'Consolidação fiscal', label(e.status), e.reasons.join('\n'), e.documentId])
    if (e.status !== 'EXCLUDED') {
      const original = items.get(JSON.stringify([e.documentId, e.itemNumber]))?.declaredIcmsAmount
      if (e.declaredIcms === undefined) rows.push([...base, 'Valor declarado', original === undefined ? 'Ausente' : 'Inválido', original, e.documentId])
      if (e.status === 'CALCULATED' && e.deferredIcms === undefined) rows.push([...base, 'Diferimento', 'Sem informação', 'Memória sem valor de diferimento conhecido.', e.documentId])
    }
    if (report.monthly) rows.forEach(row => row.push(e.batchId))
    return rows
  })
  for (const p of report.pendencies.filter(p => p.scope !== 'CALCULATION')) {
    const d = p.documentId ? documents.get(p.documentId) : undefined
    pendingRows.push([d?.companyName, d?.issuedAt?.slice(0, 7), d?.number, d?.accessKey, p.itemNumber, label(p.scope), label(p.code), p.detail, p.documentId ?? p.artifactId, ...(report.monthly ? [p.batchId] : [])])
  }
  for (const d of report.diagnostics) pendingRows.push([undefined, undefined, undefined, undefined, undefined, 'Diagnóstico XML', d.code, d.message, d.source, ...(report.monthly ? [d.batchId] : [])])
  for (const o of report.occurrences.filter(o => !o.eligibleForTotals)) pendingRows.push([undefined, undefined, undefined, o.accessKey, undefined,
    'Ocorrência excluída', `${o.repetition} / ${o.contentConflict}`, o.ingestionStatus, o.relativePath, ...(report.monthly ? [o.batchId] : [])])
  if (report.monthly) pendingColumns.push(text('Lote de origem', 40))
  addSheet(book, report, 'Pendências e exclusões', pendingColumns, pendingRows)
  if (report.monthly) addSheet(book, report, 'Lotes', [text('Lote de origem', 40), text('Nome do lote', 40), text('Situação', 24)], report.monthly.batches.map(b => [b.id, b.name, b.status]))
  return book
}
export async function generateExcelReport(report: ReportData): Promise<Uint8Array> {
  return new Uint8Array(await createExcelWorkbook(report).xlsx.writeBuffer())
}
