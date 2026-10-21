import { randomUUID, createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import ExcelJS from 'exceljs'
import { expect, it, vi } from 'vitest'
import { CORE_MIGRATIONS, SqliteDatabase, SqliteOrganizationRepository, SqliteCompanyRepository, SqliteBatchRepository, runSqlMigrations } from '@motor/database'
import { IPC_CHANNELS } from '@motor/contracts'
import { normalizeNfeXml } from '@motor/nfe-parser'
import { compareDecimals, multiplyDecimals, divideDecimals, roundMoney, subtractDecimals } from '@motor/tax-engine'

// Massa privada opt-in; caminhos, empresas e resultados reais ficam fora do repositório.
const manifest = process.env.CONTABILINICO_EXCEL_VALIDATION_MANIFEST
const state = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => any>(), database: null as any, destination: '' }))
vi.mock('electron', () => ({ app: { getVersion: () => 'validation' }, BrowserWindow: { fromWebContents: () => ({}) },
  dialog: { showSaveDialog: async () => ({ canceled: false, filePath: state.destination }) },
  ipcMain: { handle: (name: string, handler: (...args: any[]) => any) => state.handlers.set(name, handler) } }))
vi.mock('../src/main/main-services', () => ({ activeDatabase: () => state.database, batchOperations: { busy: false },
  requiredInputText: (value: string) => value }))
import { importBatch } from '../src/main/import-batch'
import { BatchOperationRegistry } from '../src/main/batch-operation'
import { applyAutomaticXmlCalculations, getItemFiscalContext } from '../src/main/item-fiscal-use-cases'
import { entryReviewFindings } from '../src/main/entry-review-findings'
import { queryBatchDetail } from '../src/main/batch-query-handlers'
import { registerReportHandlers } from '../src/main/report-handlers'

it.skipIf(!manifest)('importa XMLs reais em base isolada e confere cada produto no Excel salvo pelo IPC', async () => {
  const config = JSON.parse(await readFile(manifest!, 'utf8')) as { sources: string[]; outputDirectory: string; expectedItems: number }
  const buffers = await Promise.all(config.sources.map(path => readFile(path)))
  const hashes = buffers.map(buffer => createHash('sha256').update(buffer).digest('hex'))
  const notes = buffers.map(buffer => normalizeNfeXml(buffer.toString('utf8')))
  const buyer = notes[0]!.recipient!
  expect(notes.every(note => note.recipient?.taxId === buyer.taxId)).toBe(true)
  const root = await mkdtemp(join(tmpdir(), 'contabilinico-export-validation-'))
  const database = new SqliteDatabase(join(root, 'validation.sqlite'))
  state.database = database
  try {
    runSqlMigrations(database, CORE_MIGRATIONS, { appVersion: 'validation' })
    const organizationId = randomUUID(), companyId = randomUUID(), now = new Date().toISOString()
    new SqliteOrganizationRepository(database).create({ id: organizationId, name: 'Validação isolada', active: true, createdAt: now, updatedAt: now })
    new SqliteCompanyRepository(database).create({ id: companyId, organizationId, legalName: buyer.name ?? 'Compradora', cnpj: buyer.taxId!, state: buyer.state!, active: true, createdAt: now, updatedAt: now })
    const sources = config.sources.map(path => ({ path, kind: 'XML' as const }))
    const operationId = randomUUID(), registry = new BatchOperationRegistry()
    const session = registry.start(operationId, 1, 'PROCESSING', sources.length, () => {})
    const imported = await importBatch({ operationId, totalEntries: sources.length, environmentCode: '1', sources,
      assignments: sources.map(source => ({ source: source.path, companyId })) }, session, database, root).catch(async cause => {
        for (const name of await readdir(join(root, 'import-recovery'), { recursive: true })) {
          if (name.endsWith('.entry.json')) {
            const checkpoint = JSON.parse(await readFile(join(root, 'import-recovery', name), 'utf8'))
            console.error(checkpoint.issue)
          }
        }
        throw cause
      })
    registry.finish(operationId)
    applyAutomaticXmlCalculations(database, imported.id)
    const detail = queryBatchDetail(database, imported.id)
    const items = detail.documents.flatMap(document => document.items.map(item => ({ document, item })))
    expect(detail.documents).toHaveLength(notes.length)
    expect(items).toHaveLength(config.expectedItems)
    const before = database.get('SELECT count(*) AS n FROM execucoes_calculo')!.n
    const documentsBefore = new SqliteBatchRepository(database).listNormalizedDocuments(imported.id).map(document => document.normalized)
    await mkdir(config.outputDirectory, { recursive: true })
    state.destination = join(config.outputDirectory, 'Conferencia-aplicativo-92-produtos.xlsx')
    registerReportHandlers()
    const sender = { mainFrame: {}, isDestroyed: () => false }
    expect(await state.handlers.get(IPC_CHANNELS.EXPORT_BATCH_EXCEL)!({ sender, senderFrame: sender.mainFrame }, imported.id)).toEqual({ path: state.destination })
    const book = new ExcelJS.Workbook(); await book.xlsx.load(await readFile(state.destination) as never)
    expect(book.worksheets.map(sheet => sheet.name)).toEqual(['Produtos'])
    const sheet = book.worksheets[0]!
    expect(sheet.rowCount).toBe(config.expectedItems + 2)
    expect(sheet.autoFilter).toBeUndefined()
    expect(sheet.views[0]?.state).toBe('normal')
    const sum = { icms: 0, fcp: 0, numericItems: 0, pendingItems: 0 }
    const ipiChecks: { invoice?: string; item: string; calculated: string; declared?: string; difference?: string }[] = []
    const pendingAudit: Record<string, unknown>[] = []
    for (const [index, { document, item }] of items.entries()) {
      const row = index + 2
      expect(sheet.getCell(row, 1).value).toBe(document.number)
      expect(sheet.getCell(row, 2).value).toBe(item.itemNumber)
      expect(sheet.getCell(row, 3).value).toBe(item.description ?? null)
      expect(sheet.getCell(row, 4).value).toBe(item.declaredIcmsAmount === undefined ? 'Sem destaque' : Number(item.declaredIcmsAmount))
      const eligible = detail.consolidation!.evidence.filter(e => e.documentId === document.id && e.itemNumber === item.itemNumber)
      const selected = eligible.find(e => e.component === 'ICMS_ENTRY') ?? eligible.find(e => e.component === 'ICMS_ST') ?? eligible.find(e => (e.component ?? 'ICMS') === 'ICMS')
      const value = sheet.getCell(row, 5).value
      const note = notes.find(note => note.accessKey === document.accessKey)!
      const original = note.items.find(original => original.itemNumber === item.itemNumber)!
      const tax = original.declaredIcms
      if (tax?.cst === '00' && tax.baseMode === '3' && tax.baseAmount !== undefined && tax.rate !== undefined
        && compareDecimals(original.ipiAmount ?? '0', '0') > 0
        && compareDecimals(tax.baseReductionPercent ?? '0', '0') === 0 && compareDecimals(tax.fcpAmount ?? '0', '0') === 0) {
        const calculated = roundMoney(divideDecimals(multiplyDecimals(tax.baseAmount, tax.rate), '100'))
        expect(value).toBe(Number(calculated))
        expect(selected?.component).toBe('ICMS')
        ipiChecks.push({ invoice: note.number, item: item.itemNumber, calculated, declared: tax.amount,
          difference: tax.amount === undefined ? undefined : roundMoney(subtractDecimals(calculated, tax.amount)) })
      }
      if (typeof value === 'number') {
        expect(selected?.status).toBe('CALCULATED')
        expect(value).toBe(Number(selected?.calculatedIcms))
        sum.icms += Math.round(value * 100); sum.numericItems++
      } else {
        sum.pendingItems++
        const context = getItemFiscalContext(database, imported.id, document.id, item.itemNumber)
        const findings = entryReviewFindings(note, original)
        const noReduction = tax?.baseReductionPercent === undefined || compareDecimals(tax.baseReductionPercent, '0') === 0
        const noOwnFcp = tax?.fcpAmount === undefined || compareDecimals(tax.fcpAmount, '0') === 0
        const hasIpi = original.ipiAmount !== undefined && compareDecimals(original.ipiAmount, '0') > 0
        const rootCause = note.issuer.taxRegimeCode === '1' && tax?.csosn === '102' && tax.amount === undefined ? 'SIMPLES_NO_OWN_ICMS'
          : tax?.cst === '00' && tax.baseMode === '3' && noReduction && noOwnFcp && hasIpi ? 'IPI_BLOCKS_AUTOMATIC_XML_CHECK' : 'OTHER'
        const ownReproduced = tax?.baseAmount !== undefined && tax.rate !== undefined ? roundMoney(divideDecimals(multiplyDecimals(tax.baseAmount, tax.rate), '100')) : undefined
        pendingAudit.push({ invoice: note.number, item: original.itemNumber, product: original.description, rootCause,
          supplierRegime: note.issuer.taxRegimeCode, ncm: original.ncm, cest: original.cest, cfop: original.cfop,
          productAmount: original.productAmount, ipi: original.ipiAmount, tax,
          ownXmlArithmetic: { calculated: ownReproduced, declared: tax?.amount,
            difference: ownReproduced !== undefined && tax?.amount !== undefined ? roundMoney(subtractDecimals(ownReproduced, tax.amount)) : undefined },
          savedStatus: item.calculation.status, savedReason: item.calculation.reason,
          consolidationStatus: selected?.status, consolidationReasons: selected?.reasons,
          context: { status: context.calculation.status, reason: context.calculation.reason, blockedReason: context.blockedReason,
            answers: context.answers, questions: context.questions, mva: context.stMvaReference },
          findings: findings.findings, mvaSelection: findings.selection, mvaCandidates: findings.candidates,
        })
      }
      const fcp = sheet.getCell(row, 6).value
      if (typeof fcp === 'number') sum.fcp += Math.round(fcp * 100)
    }
    expect(sheet.getCell(config.expectedItems + 2, 5).value).toBe(sum.icms / 100)
    expect(sheet.getCell(config.expectedItems + 2, 6).value).toBe(sum.fcp / 100)
    expect(database.get('SELECT count(*) AS n FROM execucoes_calculo')!.n).toBe(before)
    expect(new SqliteBatchRepository(database).listNormalizedDocuments(imported.id).map(document => document.normalized)).toEqual(documentsBefore)
    expect(await Promise.all(config.sources.map(async path => createHash('sha256').update(await readFile(path)).digest('hex')))).toEqual(hashes)
    const groups = Object.fromEntries([...new Set(pendingAudit.map(item => item.rootCause))].map(cause => [String(cause), pendingAudit.filter(item => item.rootCause === cause).length]))
    await writeFile(join(config.outputDirectory, 'pendencias-itens.json'), JSON.stringify({ count: pendingAudit.length, groups,
      sourcesUnchanged: true, productionConfirmationsSaved: false, items: pendingAudit }, null, 2))
    await writeFile(join(config.outputDirectory, 'validacao-exportacao.json'), JSON.stringify({ documents: notes.length, items: items.length, ...sum,
      ipiArithmeticItems: ipiChecks.length, ipiArithmeticDifferences: ipiChecks.filter(item => item.difference !== undefined && compareDecimals(item.difference, '0') !== 0),
      savedCalculationsUnchanged: true, sourceXmlsUnchanged: true, exportedThroughIpc: true, productionConfirmationsSaved: false }, null, 2))
    console.log(JSON.stringify({ documents: notes.length, items: items.length, ...sum, exportedThroughIpc: true }))
  } finally { database.close(); await rm(root, { recursive: true, force: true }) }
}, 120000)
