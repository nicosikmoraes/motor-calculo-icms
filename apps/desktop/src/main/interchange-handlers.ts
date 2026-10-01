import { basename } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC_CHANNELS, type PackImportPreview, type PackImportInput } from '@motor/contracts'
import { SqliteInterchangeRepository } from '@motor/database'
import { parseIcmsPack, serializeIcmsPack, planPackImport, packStateFingerprint } from '@motor/interchange'
import { activeDatabase, inputRecord } from './main-services'
import { readPackFile, writePackFile } from './pack-file-io'
import { PackPreviewSessions } from './pack-preview-session'

const sessions = new PackPreviewSessions()
const tracked = new Set<number>()
function windowFor(event: Electron.IpcMainInvokeEvent): BrowserWindow {
  const window = BrowserWindow.fromWebContents(event.sender)
  if (!window || event.senderFrame !== event.sender.mainFrame) throw new Error('Solicitação de transferência inválida.')
  if (!tracked.has(event.sender.id)) {
    const owner = event.sender.id
    tracked.add(owner)
    event.sender.once('destroyed', () => { sessions.clearOwner(owner); tracked.delete(owner) })
  }
  return window
}
export function registerInterchangeHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.EXPORT_PACK, async (event) => {
    const window = windowFor(event)
    const pack = new SqliteInterchangeRepository(activeDatabase()).exportPack(app.getVersion(), new Date().toISOString())
    const selected = await dialog.showSaveDialog(window, { title: 'Exportar cadastros',
      defaultPath: 'cadastros.icmspack', filters: [{ name: 'Cadastros ContabiliNico', extensions: ['icmspack'] }] })
    if (selected.canceled || !selected.filePath) return null
    if (!selected.filePath.toLowerCase().endsWith('.icmspack')) throw new Error('Salve o arquivo com a extensão .icmspack.')
    await writePackFile(selected.filePath, serializeIcmsPack(pack))
    return { path: selected.filePath, counts: Object.fromEntries(Object.entries(pack.manifest.sections).map(([key, value]) => [key, value.count])) }
  })
  ipcMain.handle(IPC_CHANNELS.PREVIEW_PACK, async (event): Promise<PackImportPreview | null> => {
    const window = windowFor(event)
    const selected = await dialog.showOpenDialog(window, { title: 'Revisar pacote de cadastros', properties: ['openFile'],
      filters: [{ name: 'Cadastros ContabiliNico', extensions: ['icmspack'] }] })
    const path = selected.filePaths[0]
    if (selected.canceled || !path) return null
    const json = await readPackFile(path)
    if (event.sender.isDestroyed()) return null
    const pack = parseIcmsPack(json)
    const state = new SqliteInterchangeRepository(activeDatabase()).snapshot()
    const plan = planPackImport(pack, state)
    const token = sessions.create(event.sender.id, json, packStateFingerprint(state))
    return { token, fileName: basename(path), createdAt: pack.manifest.createdAt, appVersion: pack.manifest.appVersion,
      counts: Object.fromEntries(Object.entries(pack.manifest.sections).map(([key, value]) => [key, value.count])) as PackImportPreview['counts'], rows: plan.rows }
  })
  ipcMain.handle(IPC_CHANNELS.IMPORT_PACK, (event, raw: unknown) => {
    windowFor(event)
    const input = inputRecord(raw) as unknown as PackImportInput
    const session = sessions.get(input.token, event.sender.id)
    const choices = inputRecord(input.choices) as PackImportInput['choices']
    const result = new SqliteInterchangeRepository(activeDatabase()).importPack(session.json, session.fingerprint, choices, new Date().toISOString())
    sessions.discard(input.token, event.sender.id)
    return result
  })
  ipcMain.handle(IPC_CHANNELS.DISCARD_PACK, (event, token: unknown) => {
    windowFor(event); sessions.discard(token, event.sender.id)
  })
}
