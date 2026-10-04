import { mkdtemp, rm, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CORE_MIGRATIONS, SqliteDatabase, SqliteOrganizationRepository, runSqlMigrations } from '@motor/database'
import { IPC_CHANNELS } from '@motor/contracts'
import { BackupService } from '../src/main/backup-service'
const state = vi.hoisted(() => ({ root: '', database: null as any, maintenance: false, busy: false,
  handlers: new Map<string, (...args: any[]) => any>(), window: {}, open: vi.fn(), confirm: vi.fn(), relaunch: vi.fn(), exit: vi.fn() }))
vi.mock('electron', () => ({ app: { getPath: () => state.root, getVersion: () => '0.1.0', relaunch: state.relaunch, exit: state.exit },
  BrowserWindow: { fromWebContents: () => state.window },
  dialog: { showOpenDialog: state.open, showMessageBox: state.confirm, showErrorBox: vi.fn() },
  ipcMain: { handle: (channel: string, handler: (...args: any[]) => any) => state.handlers.set(channel, handler) } }))
vi.mock('../src/main/main-services', () => ({ activeDatabase: () => {
  if (state.maintenance) throw new Error('Manutenção ativa')
  return state.database
}, beginDatabaseMaintenance: () => {
  if (state.busy || state.maintenance) throw new Error('Aguarde ou pause o lote')
  state.maintenance = true; return state.database
}, endDatabaseMaintenance: () => { state.maintenance = false }, closeDatabase: () => state.database.close() }))
import { registerBackupHandlers, stopBackups } from '../src/main/backup-handlers'
const frame = {}, event = { sender: { mainFrame: frame }, senderFrame: frame }
const invoke = (channel: string, ...args: unknown[]) => state.handlers.get(channel)!(event, ...args)
beforeEach(async () => {
  state.root = await mkdtemp(join(tmpdir(), 'backup-handlers-test-'))
  state.database = new SqliteDatabase(join(state.root, 'motor-icms.sqlite'))
  runSqlMigrations(state.database, CORE_MIGRATIONS, { appVersion: '0.1.0' })
  const now = new Date().toISOString()
  new SqliteOrganizationRepository(state.database).create({ id: randomUUID(), name: 'Original', active: true, revision: 1, createdAt: now, updatedAt: now })
  const source = new BackupService(state.database, join(state.root, 'source-settings.json'), '0.1.0')
  await source.initialize()
  const backup = await source.create(join(state.root, 'copies'))
  await source.stop()
  state.database.run('UPDATE organizacoes SET nome = ?', 'Atual')
  state.maintenance = false; state.busy = false; state.handlers.clear()
  state.open.mockReset(); state.confirm.mockReset(); state.relaunch.mockReset(); state.exit.mockReset()
  state.open.mockResolvedValue({ canceled: false, filePaths: [backup.lastBackupPath] })
  await registerBackupHandlers()
})
afterEach(async () => { await stopBackups(); if (state.database.isOpen) state.database.close(); await rm(state.root, { recursive: true, force: true }) })
describe('restauração por IPC', () => {
  it('cancelar a confirmação preserva o banco e remove a cópia preparada', async () => {
    state.confirm.mockResolvedValue({ response: 0 })
    expect(await invoke(IPC_CHANNELS.RESTORE_BACKUP)).toBe(false)
    expect(state.database.get('SELECT nome FROM organizacoes')?.nome).toBe('Atual')
    expect((await readdir(state.root)).filter((name) => name.startsWith('.restore-'))).toEqual([])
    expect(state.maintenance).toBe(false)
    expect(state.relaunch).not.toHaveBeenCalled()
  })
  it('somente a confirmação troca o banco e agenda o reinício', async () => {
    state.confirm.mockResolvedValue({ response: 1 })
    expect(await invoke(IPC_CHANNELS.RESTORE_BACKUP)).toBe(true)
    expect(state.relaunch).toHaveBeenCalledOnce()
    expect(state.exit).toHaveBeenCalledWith(0)
    const restored = new SqliteDatabase(join(state.root, 'motor-icms.sqlite'), { readOnly: true })
    try { expect(restored.get('SELECT nome FROM organizacoes')?.nome).toBe('Original') } finally { restored.close() }
  })
  it('bloqueia a restauração enquanto houver lote ativo e valida retenção recebida', async () => {
    state.busy = true
    await expect(invoke(IPC_CHANNELS.RESTORE_BACKUP)).rejects.toThrow('pause o lote')
    expect(state.database.isOpen).toBe(true)
    expect(state.confirm).not.toHaveBeenCalled()
    await expect(invoke(IPC_CHANNELS.SET_BACKUP_RETENTION, '7')).rejects.toThrow('inválida')
    await expect(invoke(IPC_CHANNELS.SET_BACKUP_RETENTION, -1)).rejects.toThrow('Escolha')
  })
})
