import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC_CHANNELS, type SelectedSource } from '@motor/contracts'
import {
  CORE_MIGRATIONS,
  SqliteDatabase,
  runSqlMigrationsWithBackup,
} from '@motor/database'

const allowedExtensions = new Set(['.xml', '.zip'])
let database: SqliteDatabase | undefined

async function openDatabase(): Promise<void> {
  const dataDirectory = app.getPath('userData')
  const backupDirectory = join(dataDirectory, 'backups')
  await mkdir(backupDirectory, { recursive: true })

  database = new SqliteDatabase(join(dataDirectory, 'motor-icms.sqlite'))
  try {
    await runSqlMigrationsWithBackup(database, CORE_MIGRATIONS, {
      appVersion: app.getVersion(),
      backupPath: join(backupDirectory, `pre-migration-${Date.now()}-${randomUUID()}.sqlite`),
    })
  } catch (error) {
    database.close()
    database = undefined
    throw error
  }
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#f4f1e8',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  window.once('ready-to-show', () => window.show())

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.APP_VERSION, () => app.getVersion())
  ipcMain.handle(IPC_CHANNELS.SELECT_SOURCES, async (): Promise<SelectedSource[]> => {
    const result = await dialog.showOpenDialog({
      title: 'Selecionar XMLs ou arquivo ZIP',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Documentos fiscais', extensions: ['xml', 'zip'] },
      ],
    })

    if (result.canceled) return []

    return result.filePaths
      .filter((path) => allowedExtensions.has(path.slice(path.lastIndexOf('.')).toLowerCase()))
      .map((path) => ({ path, kind: path.toLowerCase().endsWith('.zip') ? 'ZIP' : 'XML' }))
  })
}

app.whenReady().then(async () => {
  try {
    await openDatabase()
    registerIpcHandlers()
    createWindow()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha desconhecida.'
    dialog.showErrorBox('Não foi possível abrir o banco de dados', message)
    app.quit()
    return
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  database?.close()
  database = undefined
})
