import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC_CHANNELS, type SelectedSource } from '@motor/contracts'

const allowedExtensions = new Set(['.xml', '.zip'])

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

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
