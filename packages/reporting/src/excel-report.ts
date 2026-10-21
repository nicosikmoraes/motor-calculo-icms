import ExcelJS from 'exceljs'
import { taxComponentLabel, type ConsolidationEvidence } from '@motor/contracts'
import { buildExcelItemRows } from './excel-item-rows'
import { buildSimpleExcelItemRows } from './simple-excel-item-rows'
import { addEntryAssessmentSheet } from './excel-entry-assessment'
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
  const sheet = book.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 5, xSplit: name === 'Itens' ? 5 : 1 }],
    pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: false, printTitlesRow: '1:5' } })
  sheet.columns = columns.map(column => ({ width: column.width ?? 24 }))
  for (const [row, value] of [
    [1, `ContabiliNico · ${name}`],
    [2, name === 'Itens' ? 'Uma linha por produto de cada nota. ICMS, ICMS-ST e FCP-ST em colunas separadas. Valores calculados usam os resultados salvos; pendências e exclusões permanecem identificadas.' : `${report.monthly ? 'Conferência mensal entre lotes' : 'Conferência do lote'}, por mês de emissão. Sem apuração de crédito ou saldo a recolher. Valores acima da precisão do Excel permanecem como texto.`],
    [3, `${report.monthly ? `Empresa: ${report.monthly.companyName} · Mês: ${report.monthly.period} · Lotes: ${report.monthly.batches.length}` : `Lote: ${report.batch.id}`} · CNPJ: ${[...new Set(report.documents.map(document => document.companyCnpj).filter(Boolean))].join(', ') || 'Não identificado'} · Exportado: ${report.metadata.generatedAt} · Aplicativo: ${report.metadata.appVersion} · Layout XLSX: 7`],
  ] as const) {
    sheet.mergeCells(row, 1, row, Math.min(name === 'Itens' ? 5 : 4, columns.length))
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

export interface ExcelReportOptions { layout?: 'SIMPLE' | 'AUDIT' }

/** Exportação padrão aprovada: uma tabela simples, sem filtros nem painéis congelados. */
export function createExcelWorkbook(report: ReportData, options: ExcelReportOptions = {}): ExcelJS.Workbook {
  if (options.layout === 'AUDIT') return createAuditExcelWorkbook(report)
  if (!report.consolidation || report.consolidation.batchId !== report.batch.id) throw new Error('Consolidação do lote ausente ou incompatível.')
  const book = new ExcelJS.Workbook()
  book.creator = 'ContabiliNico'; book.created = new Date(report.metadata.generatedAt)
  const sheet = book.addWorksheet('Produtos', { views: [{ state: 'normal', showGridLines: true }] })
  sheet.columns = [
    { width: 12 }, { width: 9 }, { width: 54 }, { width: 25 }, { width: 26 }, { width: 19 }, { width: 34 },
  ]
  sheet.getRow(1).values = ['Nota', 'Item', 'Produto', 'ICMS declarado\nno XML (R$)', 'ICMS calculado\n(R$)', 'FCP calculado\n(R$)', 'Tipo de cálculo']
  sheet.getRow(1).height = 36
  sheet.getRow(1).eachCell(cell => {
    cell.font = { name: 'Arial', size: 11, bold: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  })
  const data = buildSimpleExcelItemRows(report)
  if (data.rows.length > 1_048_574) throw new Error('A aba Produtos excede o limite de linhas do Excel.')
  for (const values of [...data.rows, ...(data.total ? [data.total] : [])]) {
    const row = sheet.addRow(values.map((value, index) => index >= 3 && index <= 5 ? excelMoney(value) ?? null : value ?? null))
    let lines = 1
    row.eachCell((cell, columnIndex) => {
      if (typeof cell.value === 'string' && cell.value.length > 32_767) throw new Error('Texto excede o limite do Excel na aba Produtos.')
      cell.font = { name: 'Arial', size: 11 }
      cell.numFmt = typeof cell.value === 'string' ? '@' : columnIndex >= 4 && columnIndex <= 6 ? '#,##0.00;[Red]-#,##0.00' : '0'
      cell.alignment = { vertical: 'middle', wrapText: true, indent: columnIndex <= 2 ? 0 : 1, horizontal: columnIndex <= 2 ? 'center' : columnIndex >= 4 && columnIndex <= 6 ? 'right' : 'left' }
      if (typeof cell.value === 'string') lines = Math.max(lines, Math.ceil(cell.value.length / Math.max(1, (sheet.getColumn(columnIndex).width ?? 24) - 2)))
    })
    row.height = Math.min(409, Math.max(25, lines * 14 + 4))
  }
  if (data.total) sheet.lastRow!.eachCell(cell => {
    cell.font = { name: 'Arial', size: 11, bold: true }
    cell.border = { top: { style: 'thin', color: { argb: 'FF999999' } } }
  })
  return book
}

/** Evidências detalhadas preservadas para ferramentas que solicitam o layout de auditoria. */
function createAuditExcelWorkbook(report: ReportData): ExcelJS.Workbook {
  const summary = report.consolidation
  if (!summary || summary.batchId !== report.batch.id) throw new Error('Consolidação do lote ausente ou incompatível.')
  const book = new ExcelJS.Workbook()
  book.creator = 'ContabiliNico'; book.created = new Date(report.metadata.generatedAt)
  if (report.monthly) addEntryAssessmentSheet(book, report)
  const documents = new Map(report.documents.map(document => [document.id, document]))
  const items = new Map(report.items.map(item => [JSON.stringify([item.documentId, item.itemNumber]), item]))
  const companyNames = new Map(summary.groups.map(group => [group.companyId, group.companyName]))
  const companyCnpjs = new Map(report.documents.map(document => [document.companyId, document.companyCnpj]))
  const identity = (entry: ConsolidationEvidence): Value[] => [companyNames.get(entry.companyId) ?? 'Empresa não identificada', entry.period,
    label(entry.perspective), environment(entry.environment), label(entry.authorization), entry.documentNumber,
    documents.get(entry.documentId)?.series, entry.accessKey, entry.itemNumber, ...(report.monthly ? [entry.batchId, report.monthly.batches.find(b => b.id === entry.batchId)?.name] : []), companyCnpjs.get(entry.companyId)]
  const identityColumns = [text('Empresa', 32), text('Mês de emissão', 18), text('Operação', 20), text('Ambiente', 20),
    text('Autorização', 38), text('Nota', 16), text('Série', 12), text('Chave de acesso', 50), text('Item', 10), ...(report.monthly ? [text('Lote de origem', 40), text('Nome do lote', 36)] : []), text('CNPJ da empresa', 22)]
  const itemTable = buildExcelItemRows(report)
  addSheet(book, report, 'Itens', itemTable.columns, itemTable.rows)
  addSheet(book, report, 'Resumo', [text('Empresa', 32), text('Mês de emissão', 18), text('Operação', 20), text('Ambiente', 20), text('Autorização', 38),
    monetary('Base calculada'), monetary('Imposto calculado'), monetary('Imposto declarado elegível'), monetary('Imposto diferido conhecido'),
    monetary('Imposto calculado dos pares'), monetary('Imposto declarado dos pares'), monetary('Diferença líquida dos pares'), monetary('Soma das diferenças absolutas'),
    ...['Notas', 'Itens', 'Calculados', 'Pendentes', 'Fora do escopo', 'Excluídos', 'Itens comparáveis', 'Itens com divergência de valor, base ou alíquota',
      'Diferenças dentro da tolerância', 'Declaração ausente', 'Declaração inválida', 'Diferimento sem informação'].map(title => text(title)), text('Créditos de compras', 30), text('Componente conferido'), text('CNPJ da empresa', 22)],
    summary.groups.map(g => [g.companyName ?? 'Empresa não identificada', g.period, label(g.perspective), environment(g.environment), label(g.authorization),
      g.totals.calculatedBase, g.totals.calculatedIcms, g.totals.declaredIcms, g.totals.deferredIcms,
      g.totals.comparedCalculatedIcms, g.totals.comparedDeclaredIcms, g.totals.difference, g.totals.absoluteDifferences,
      g.counts.documents, g.counts.items, g.counts.calculated, g.counts.pending, g.counts.unsupported, g.counts.excluded,
      g.counts.comparableItems, g.counts.divergentItems, g.counts.withinToleranceItems, g.counts.declaredMissing, g.counts.declaredInvalid,
      g.counts.deferredMissing, 'Não apurados', taxComponentLabel(g.component), companyCnpjs.get(g.companyId)]))
  addSheet(book, report, 'Divergências', [...identityColumns, text('Componente calculado'), monetary('Imposto calculado'), monetary('Imposto declarado'),
    monetary('Diferença calculado - declarado'), monetary('Tolerância por item'), text('Comparação'), text('Execução do cálculo', 40), text('Versão do motor'), text('Campo conferido'), text('Calculado exato'), text('Declarado exato'), text('Diferença exata'), text('Unidade')],
    summary.evidence.flatMap(e => {
      const comparisons = [...(e.comparison ? [e.comparison] : []), ...(e.comparisons?.filter(c => ['BASE', 'RATE', 'MVA'].includes(c.component)) ?? [])]
      return comparisons.filter(c => c.status === 'DIFFERENT' || c.status === 'WITHIN_TOLERANCE' || c.status === 'INVALID_DECLARED').map(c => [...identity(e),
        taxComponentLabel(e.component), ['BASE', 'RATE', 'MVA'].includes(c.component) ? undefined : e.calculatedIcms,
        ['BASE', 'RATE', 'MVA'].includes(c.component) ? undefined : e.declaredIcms,
        c.component === 'RATE' || c.component === 'MVA' ? undefined : c.difference, c.component === 'RATE' || c.component === 'MVA' ? undefined : c.tolerance,
        label(c.status), e.runId, e.engineVersion, c.component, c.calculated, c.declared, c.difference, c.component === 'RATE' || c.component === 'MVA' ? '%' : 'R$'])
    }))
  const pendingColumns = [text('Empresa', 32), text('Mês de emissão', 18), text('Nota', 16), text('Chave de acesso', 50), text('Item', 10),
    text('Categoria', 26), text('Código / situação', 32), text('Motivo', 70), text('Documento / origem', 45)]
  const pendingRows: Value[][] = summary.evidence.flatMap(e => {
    const rows: Value[][] = []
    const base: Value[] = [companyNames.get(e.companyId) ?? 'Empresa não identificada', e.period, e.documentNumber, e.accessKey, e.itemNumber]
    if (e.status !== 'CALCULATED') rows.push([...base, `Consolidação ${taxComponentLabel(e.component)}`, label(e.status), e.reasons.join('\n'), e.documentId])
    if (e.status !== 'EXCLUDED' && e.component !== 'ICMS_ENTRY') {
      const reportItem = items.get(JSON.stringify([e.documentId, e.itemNumber]))
      const original = e.component === 'FCP_ST' ? reportItem?.declaredFcpStAmount : e.component === 'ICMS_ST' ? reportItem?.declaredIcmsStAmount : reportItem?.declaredIcmsAmount
      if (e.declaredIcms === undefined) rows.push([...base, `Valor declarado ${taxComponentLabel(e.component)}`, original === undefined ? 'Ausente' : 'Inválido', original, e.documentId])
      if (e.status === 'CALCULATED' && e.component === 'ICMS' && e.deferredIcms === undefined) rows.push([...base, 'Diferimento', 'Sem informação', 'Memória sem valor de diferimento conhecido.', e.documentId])
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
  pendingColumns.push(text('CNPJ da empresa', 22))
  pendingRows.forEach(row => row.push(companyCnpjs.get(report.documents.find(document => document.id === row[8])?.companyId)
    ?? (typeof row[3] === 'string' ? report.documents.find(document => document.accessKey === row[3])?.companyCnpj : undefined)))
  addSheet(book, report, 'Pendências e exclusões', pendingColumns, pendingRows)
  if (report.monthly) addSheet(book, report, 'Lotes', [text('Lote de origem', 40), text('Nome do lote', 40), text('Situação', 24)], report.monthly.batches.map(b => [b.id, b.name, b.status]))
  const events = [...new Map(report.artifacts.filter(a => a.kind === 'EVENT').map(a => [JSON.stringify([a.id, a.documentId]), a])).values()]
  if (events.length) addSheet(book, report, 'Eventos e revisões', [text('Chave de acesso', 50), text('Tipo do evento', 20), text('Sequência', 12),
    text('Ambiente', 20), text('Protocolo', 30), text('Data original do evento', 30), text('Código SEFAZ', 16), text('Motivo SEFAZ', 50),
    text('Texto da correção / justificativa', 70), text('Associação', 24), text('Lote do evento', 40), text('Nome do lote do evento', 36),
    text('Documento associado', 40), text('Lote da nota', 40), text('Histórico das decisões locais', 100)], events.map(a => [a.accessKey,
    a.eventType, a.sequence, environment(a.environmentCode ?? ''), a.protocolNumber, a.occurredAt, a.statusCode, a.statusReason,
    a.correctionText ?? a.justification, a.association, a.sourceBatchId ?? report.batch.id, a.sourceBatchName, a.documentId, a.targetBatchId,
    a.reviewHistory?.map(r => `${r.revision} · ${r.action} · ${r.createdAt}\n${r.reason}\n${r.computer} · ${r.systemUser}`).join('\n\n')]))
  const conflicts = report.documents.filter(d => d.conflictResolution)
  if (conflicts.length) addSheet(book, report, 'Conflitos e decisões', [text('Chave de acesso', 50), text('Ambiente', 18), text('Documento', 40),
    text('Situação do conflito', 22), text('Versão escolhida', 40), text('Conteúdo escolhido', 68), text('Participação / motivo', 65), text('Histórico das decisões', 100), text('Conteúdo desta ocorrência', 68), text('Lote desta ocorrência', 40), text('Nome do lote', 36), text('Arquivo de origem', 50)],
    conflicts.map(d => [d.accessKey, environment(d.environmentCode ?? ''), d.id, d.conflictResolution!.status,
      d.conflictResolution!.chosenDocumentId, d.conflictResolution!.chosenContentHash, d.conflictResolution!.reason,
      d.conflictResolution!.history.map(r => `${r.revision} · ${r.action} · ${r.documentId} · ${r.createdAt}\n${r.reason}\n${r.computer} · ${r.systemUser}`).join('\n\n'), d.conflictResolution!.contentHash, d.conflictResolution!.sourceBatchId, d.conflictResolution!.sourceBatchName, d.conflictResolution!.sourceFileName]))
  return book
}
export async function generateExcelReport(report: ReportData, options: ExcelReportOptions = {}): Promise<Uint8Array> {
  return new Uint8Array(await createExcelWorkbook(report, options).xlsx.writeBuffer())
}
