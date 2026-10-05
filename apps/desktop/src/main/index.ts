import { stopImportWorkers } from './import-worker-client'
import { registerBackupHandlers, stopBackups } from './backup-handlers'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC_CHANNELS } from '@motor/contracts'
import { AppErrorMessage } from '@motor/domain'
import { registerInterchangeHandlers } from './interchange-handlers'
import { registerCatalogHandlers } from './catalog-handlers'
import { registerBatchInspectionHandlers } from './batch-inspection-handlers'
import { registerBatchCreateHandler } from './batch-create-handler'
import { registerBatchQueryHandlers } from './batch-query-handlers'
import { registerBatchReassessmentHandler } from './batch-reassessment-handler'
import { registerReportHandlers } from './report-handlers'
import { registerItemFiscalHandlers } from './item-fiscal-handlers'
import { batchOperations, closeDatabase, openDatabase, requiredInputText } from './main-services'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
let mainWindow: BrowserWindow | undefined

/** Cria a janela isolada e carrega o frontend de desenvolvimento ou produção. */
function createWindow(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
    return
  }
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    show: true,
    backgroundColor: '#f4f1e8',
    webPreferences: {
      preload: join(currentDirectory, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  mainWindow = window

  window.on('closed', () => {
    if (mainWindow === window) mainWindow = undefined
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(currentDirectory, '../renderer/index.html'))
  }
}

/** Liga cada grupo de comandos da interface ao seu fluxo no processo principal. */
function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.CANCEL_BATCH_OPERATION,
    (event, rawOperationId: unknown): boolean =>
      batchOperations.cancel(requiredInputText(rawOperationId, 'Identificador da operação'), event.sender.id))
  ipcMain.handle(IPC_CHANNELS.PAUSE_BATCH_OPERATION,
    (event, rawId: unknown) => batchOperations.pause(requiredInputText(rawId, 'Operação'), event.sender.id))
  registerCatalogHandlers()
  registerInterchangeHandlers()
  registerBatchInspectionHandlers()
  registerBatchCreateHandler()
  registerBatchQueryHandlers()
  registerBatchReassessmentHandler()
  registerItemFiscalHandlers()
  registerReportHandlers()
}

// Uma segunda instância reutiliza a janela já aberta e não concorre pelo SQLite nem pelo estágio.
const primaryInstance = app.requestSingleInstanceLock()
if (!primaryInstance) app.quit()
else app.on('second-instance', () => {
  if (app.isReady()) createWindow()
})

// O banco e suas migrations precisam estar prontos antes de a interface abrir.
if (primaryInstance) app.whenReady().then(async () => {
  try {
    await openDatabase()
    registerIpcHandlers()
    await registerBackupHandlers()
    createWindow()
  } catch (error) {
    const message = error instanceof Error ? error.message : AppErrorMessage.UNKNOWN_FAILURE
    dialog.showErrorBox(AppErrorMessage.DATABASE_OPEN_TITLE, message)
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

let shutdownReady = false
let shutdownPending = false
app.on('before-quit', (event) => {
  if (shutdownReady) return
  event.preventDefault()
  if (shutdownPending) return
  shutdownPending = true
  void stopImportWorkers().then(stopBackups).finally(() => {
    closeDatabase()
    shutdownReady = true
    app.quit()
  })
})
