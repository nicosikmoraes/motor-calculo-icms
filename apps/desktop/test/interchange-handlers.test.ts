import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC_CHANNELS } from '@motor/contracts'
import { createIcmsPack, parseIcmsPack, serializeIcmsPack } from '@motor/interchange'
import { CORE_MIGRATIONS, SqliteDatabase, SqliteOrganizationRepository, runSqlMigrations } from '@motor/database'
const state = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => any>(), database: null as any,
  openDialog: vi.fn(), saveDialog: vi.fn(), window: {} }))
vi.mock('electron', () => ({ app: { getVersion: () => 'test' },
  BrowserWindow: { fromWebContents: () => state.window },
  dialog: { showOpenDialog: state.openDialog, showSaveDialog: state.saveDialog },
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => any) => state.handlers.set(channel, handler) } }))
vi.mock('../src/main/main-services', () => ({ activeDatabase: () => state.database,
  inputRecord: (raw: unknown) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Entrada inválida')
    return raw
  } }))
import { registerInterchangeHandlers } from '../src/main/interchange-handlers'
const now = '2026-10-01T23:00:00.000Z'
let directory: string, path: string
const frame = {}, event = { sender: { id: 1, mainFrame: frame, isDestroyed: () => false, once: vi.fn() }, senderFrame: frame }
const invoke = (channel: string, ...args: unknown[]) => state.handlers.get(channel)!(event, ...args)
const packageJson = () => serializeIcmsPack(createIcmsPack({ companies: [{ id: '00000000-0000-4000-8000-000000000002',
  legalName: 'Empresa sintética', cnpj: '11222333000181', state: 'PR', active: true }], profiles: [], products: [], rules: [] },
  { createdAt: now, appVersion: 'test' }))
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'pack-handlers-')); path = join(directory, 'cadastros.icmspack')
  state.database = new SqliteDatabase(':memory:')
  runSqlMigrations(state.database, CORE_MIGRATIONS, { appVersion: 'test' })
  new SqliteOrganizationRepository(state.database).createSingle({ id: '00000000-0000-4000-8000-000000000001',
    name: 'Destino', active: true, createdAt: now, updatedAt: now })
  state.handlers.clear(); state.openDialog.mockReset(); state.saveDialog.mockReset()
  registerInterchangeHandlers()
  await writeFile(path, packageJson())
  state.openDialog.mockResolvedValue({ canceled: false, filePaths: [path] })
})
afterEach(async () => { state.database.close(); await rm(directory, { recursive: true, force: true }) })
describe('fluxo IPC de transferência com seletores nativos', () => {
  it('mostra prévia sem escrita e importa o snapshot confirmado uma única vez', async () => {
    const preview = await invoke(IPC_CHANNELS.PREVIEW_PACK)
    expect(preview).toMatchObject({ fileName: 'cadastros.icmspack', counts: { companies: 1 }, rows: [{ status: 'NEW' }] })
    expect(state.database.get('SELECT count(*) AS total FROM empresas').total).toBe(0)
    await writeFile(path, 'Arquivo alterado após a revisão')
    expect(await invoke(IPC_CHANNELS.IMPORT_PACK, { token: preview.token, choices: {} })).toEqual({ created: 1, updated: 0, kept: 0 })
    expect(() => invoke(IPC_CHANNELS.IMPORT_PACK, { token: preview.token, choices: {} })).toThrow(/inválida/)
    expect(state.database.get('SELECT count(*) AS total FROM empresas').total).toBe(1)
  })
  it('cancelamento de seleção e de revisão não altera cadastros', async () => {
    state.openDialog.mockResolvedValueOnce({ canceled: true, filePaths: [] })
    expect(await invoke(IPC_CHANNELS.PREVIEW_PACK)).toBeNull()
    const preview = await invoke(IPC_CHANNELS.PREVIEW_PACK)
    invoke(IPC_CHANNELS.DISCARD_PACK, preview.token)
    expect(() => invoke(IPC_CHANNELS.IMPORT_PACK, { token: preview.token, choices: {} })).toThrow()
    expect(state.database.get('SELECT count(*) AS total FROM empresas').total).toBe(0)
  })
  it('recusa iframe e token de outra janela antes da escrita', async () => {
    await expect(state.handlers.get(IPC_CHANNELS.PREVIEW_PACK)!({ ...event, senderFrame: {} })).rejects.toThrow(/inválida/)
    const preview = await invoke(IPC_CHANNELS.PREVIEW_PACK)
    expect(() => state.handlers.get(IPC_CHANNELS.IMPORT_PACK)!({ ...event, sender: { ...event.sender, id: 2 } },
      { token: preview.token, choices: {} })).toThrow(/inválida/)
    expect(state.database.get('SELECT count(*) AS total FROM empresas').total).toBe(0)
  })
  it('exporta somente para destino escolhido e mantém arquivo após cancelamento', async () => {
    const preview = await invoke(IPC_CHANNELS.PREVIEW_PACK)
    invoke(IPC_CHANNELS.IMPORT_PACK, { token: preview.token, choices: {} })
    state.saveDialog.mockResolvedValueOnce({ canceled: true })
    expect(await invoke(IPC_CHANNELS.EXPORT_PACK)).toBeNull()
    state.saveDialog.mockResolvedValueOnce({ canceled: false, filePath: path })
    expect(await invoke(IPC_CHANNELS.EXPORT_PACK)).toMatchObject({ path, counts: { companies: 1 } })
    expect(parseIcmsPack(await readFile(path, 'utf8')).payload.companies[0]?.legalName).toBe('Empresa sintética')
    state.saveDialog.mockResolvedValueOnce({ canceled: false, filePath: join(directory, 'banco.sqlite') })
    await expect(invoke(IPC_CHANNELS.EXPORT_PACK)).rejects.toThrow(/extensão/)
  })
})
