import { mkdtemp, readFile, readdir, mkdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import ExcelJS from 'exceljs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '@motor/contracts'
import { CORE_MIGRATIONS, SqliteBatchRepository, SqliteCompanyRepository, SqliteDatabase, SqliteOrganizationRepository, runSqlMigrations } from '@motor/database'
const state = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => any>(), database: null as any,
  saveDialog: vi.fn(), window: {} as unknown, busy: false }))
vi.mock('electron', () => ({ app: { getVersion: () => 'test' }, BrowserWindow: { fromWebContents: () => state.window },
  dialog: { showSaveDialog: state.saveDialog }, ipcMain: { handle: (name: string, fn: (...args: any[]) => any) => state.handlers.set(name, fn) } }))
vi.mock('../src/main/main-services', () => ({ activeDatabase: () => state.database, batchOperations: { get busy() { return state.busy } },
  requiredInputText: (raw: unknown) => { if (typeof raw !== 'string' || !raw.trim()) throw new Error('Entrada inválida'); return raw.trim() } }))
import { registerReportHandlers } from '../src/main/report-handlers'
import { writeExcelFile } from '../src/main/report-file-io'
const org = '00000000-0000-4000-8000-000000000001', batchId = '00000000-0000-4000-8000-000000000002'
const companyId = '00000000-0000-4000-8000-000000000003', documentId = '00000000-0000-4000-8000-000000000004'
const fileId = '00000000-0000-4000-8000-000000000005', now = '2026-10-04T12:00:00.000Z'
const sender = { mainFrame: {}, isDestroyed: () => false }, event = { sender, senderFrame: sender.mainFrame }
let directory: string, path: string
const invoke = (id: unknown = batchId, ev: unknown = event) => state.handlers.get(IPC_CHANNELS.EXPORT_BATCH_EXCEL)!(ev, id)
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'xlsx-handlers-')); path = join(directory, 'conferencia.xlsx')
  state.database = new SqliteDatabase(':memory:'); runSqlMigrations(state.database, CORE_MIGRATIONS, { appVersion: 'test' })
  new SqliteOrganizationRepository(state.database).create({ id: org, name: 'Escritório', active: true, createdAt: now, updatedAt: now })
  new SqliteCompanyRepository(state.database).create({ id: companyId, organizationId: org, legalName: 'Empresa', cnpj: '11222333000181', state: 'PR', active: true, createdAt: now, updatedAt: now })
  const source = { format: 'NFE_XML_4_00' as const, xmlPath: 'NFe' }
  new SqliteBatchRepository(state.database).createWithOccurrences({ id: batchId, organizationId: org, status: 'RECEBIDO', receivedAt: now, createdAt: now, updatedAt: now }, [
    { id: fileId, batchId, originalName: 'nota.xml', relativePath: 'nota.xml', detectedKind: 'XML', origin: 'SELECTED_FILE', contentHash: 'a'.repeat(64), sizeBytes: 100,
      order: 1, accessKey: '1'.repeat(44), ingestionStatus: 'PROCESSADA', repetition: 'ORIGINAL', contentConflict: 'SEM_CONFLITO', eligibleForTotalsByOccurrencePolicy: true, receivedAt: now },
  ], [], [{ id: documentId, batchId, companyId, occurrenceId: fileId, contentHash: 'a'.repeat(64), eligibleForProcessing: true, createdAt: now,
    normalized: { kind: 'NFE', layoutVersion: '4.00', model: '55', accessKey: '1'.repeat(44), number: '0001', series: '01', issuedAt: now, environmentCode: '1',
      issuer: { state: 'PR', taxId: '11222333000181', taxIdType: 'CNPJ', taxRegimeCode: '3' },
      recipient: { state: 'PR', taxId: '11444777000161', taxIdType: 'CNPJ' }, declaredTotals: {}, source,
      items: [{ itemNumber: '1', supplierProductCode: '001', productAmount: '1000', declaredIcms: { cst: '51', amount: '120.00' }, source }] } }])
  state.handlers.clear(); state.saveDialog.mockReset(); state.busy = false; state.window = {}
  state.saveDialog.mockResolvedValue({ canceled: false, filePath: path }); registerReportHandlers()
})
afterEach(async () => { state.database.close(); await rm(directory, { recursive: true, force: true }) })
describe('exportação de lote com destino nativo', () => {
  it('consulta o banco, salva XLSX válido e mantém pendências sem calcular novos impostos', async () => {
    expect(await invoke()).toEqual({ path })
    const book = new ExcelJS.Workbook(); await book.xlsx.load(await readFile(path) as never)
    expect(book.worksheets).toHaveLength(4)
    expect(book.getWorksheet('Itens')!.getCell('F6').value).toBe('0001')
    expect(state.database.get('SELECT count(*) AS total FROM execucoes_calculo').total).toBe(0)
    expect(await readdir(directory)).toEqual(['conferencia.xlsx'])
  })
  it('cancela sem alterar o arquivo anterior', async () => {
    await writeFile(path, 'anterior'); state.saveDialog.mockResolvedValue({ canceled: true, filePath: path })
    expect(await invoke()).toBeNull(); expect(await readFile(path, 'utf8')).toBe('anterior')
  })
  it('recusa iframe, lote desconhecido e importação em andamento antes do seletor', async () => {
    await expect(invoke(batchId, { ...event, senderFrame: {} })).rejects.toThrow('inválida')
    await expect(invoke('inexistente')).rejects.toThrow()
    state.busy = true; await expect(invoke()).rejects.toThrow('pause')
    expect(state.saveDialog).not.toHaveBeenCalled()
  })
  it('recusa extensão diferente e janela destruída sem escrever', async () => {
    state.saveDialog.mockResolvedValueOnce({ canceled: false, filePath: join(directory, 'banco.sqlite') })
    await expect(invoke()).rejects.toThrow('extensão')
    expect(await invoke(batchId, { sender: { ...sender, isDestroyed: () => true }, senderFrame: sender.mainFrame })).toBeNull()
    expect(await readdir(directory)).toEqual([])
  })
  it('exporta snapshot capturado antes do diálogo mesmo se o banco mudar', async () => {
    state.saveDialog.mockImplementationOnce(async () => { state.database.run('UPDATE empresas SET razao_social = ? WHERE id = ?', 'Nome alterado', companyId); return { canceled: false, filePath: path } })
    await invoke()
    const book = new ExcelJS.Workbook(); await book.xlsx.load(await readFile(path) as never)
    expect(book.getWorksheet('Itens')!.getCell('A6').value).toBe('Empresa')
  })
  it('limpa temporários quando a troca do destino falha', async () => {
    const target = join(directory, 'destino.xlsx'); await mkdir(target)
    await expect(writeExcelFile(target, new Uint8Array([1, 2]))).rejects.toThrow()
    expect(await readdir(directory)).toEqual(['destino.xlsx'])
  })
})


describe('conferência mensal via IPC', () => {
  const monthly = (channel: string, input: unknown = { companyId, period: '2026-10' }, ev: unknown = event) => state.handlers.get(channel)!(ev, input)
  it('consulta e exporta um mês com identificação e origem sem recalcular', async () => {
    const summary = await monthly(IPC_CHANNELS.GET_MONTHLY_CONFERENCE)
    expect(summary.summary.counts.documents).toBe(1)
    expect(summary.summary.evidence[0].batchId).toBe(batchId)
    expect(await monthly(IPC_CHANNELS.EXPORT_MONTHLY_EXCEL)).toEqual({ path })
    const book = new ExcelJS.Workbook(); await book.xlsx.load(await readFile(path) as never)
    expect(book.worksheets).toHaveLength(5)
    expect(book.getWorksheet('Itens')!.getCell('J6').value).toBe(batchId)
    expect(book.getWorksheet('Itens')!.getCell('A3').value).toContain('Mês: 2026-10')
    expect(state.database.get('SELECT count(*) AS total FROM execucoes_calculo').total).toBe(0)
  })
  it('recusa iframe, empresa desconhecida, mês inválido e importação ativa', async () => {
    expect(() => monthly(IPC_CHANNELS.GET_MONTHLY_CONFERENCE, { companyId, period: '2026-10' }, { ...event, senderFrame: {} })).toThrow('inválida')
    await expect(monthly(IPC_CHANNELS.EXPORT_MONTHLY_EXCEL, { companyId: 'outra', period: '2026-10' })).rejects.toThrow('organização')
    await expect(monthly(IPC_CHANNELS.EXPORT_MONTHLY_EXCEL, { companyId, period: '2026-00' })).rejects.toThrow('válido')
    state.busy = true
    expect(() => monthly(IPC_CHANNELS.GET_MONTHLY_CONFERENCE)).toThrow('pause')
    await expect(monthly(IPC_CHANNELS.EXPORT_MONTHLY_EXCEL)).rejects.toThrow('pause')
    expect(state.saveDialog).not.toHaveBeenCalled()
  })
  it('cancela sem alterar destino e captura snapshot antes do diálogo', async () => {
    await writeFile(path, 'anterior'); state.saveDialog.mockResolvedValueOnce({ canceled: true, filePath: path })
    expect(await monthly(IPC_CHANNELS.EXPORT_MONTHLY_EXCEL)).toBeNull()
    expect(await readFile(path, 'utf8')).toBe('anterior')
    state.saveDialog.mockImplementationOnce(async () => { state.database.run('UPDATE empresas SET razao_social = ? WHERE id = ?', 'Alterada', companyId); return { canceled: false, filePath: path } })
    await monthly(IPC_CHANNELS.EXPORT_MONTHLY_EXCEL)
    const book = new ExcelJS.Workbook(); await book.xlsx.load(await readFile(path) as never)
    expect(book.getWorksheet('Itens')!.getCell('A6').value).toBe('Empresa')
  })
})
