import { stopImportWorkers } from './import-worker-client'
import { registerBackupHandlers, stopBackups } from './backup-handlers'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { IPC_CHANNELS, type CreateDonationInput } from '@motor/contracts'
import { AppErrorMessage } from '@motor/domain'
import { registerInterchangeHandlers } from './interchange-handlers'
import { registerCatalogHandlers } from './catalog-handlers'
import { registerBatchInspectionHandlers } from './batch-inspection-handlers'
import { registerBatchCreateHandler } from './batch-create-handler'
import { registerBatchQueryHandlers } from './batch-query-handlers'
import { registerBatchReassessmentHandler } from './batch-reassessment-handler'
import { registerReportHandlers } from './report-handlers'
import { registerItemFiscalHandlers } from './item-fiscal-handlers'
import { registerConflictResolutionHandlers } from './conflict-resolution-handlers'
import { registerDocumentReviewHandlers } from './document-review-handlers'
import { batchOperations, closeDatabase, openDatabase, requiredInputText } from './main-services'
import { allowedDonationCheckoutUrl } from './donation-checkout'

const currentDirectory = dirname(fileURLToPath(import.meta.url))
let mainWindow: BrowserWindow | undefined

// A versão de desenvolvimento roda isolada da instalação e não compartilha o SQLite do usuário.
if (!app.isPackaged) {
  const devUserDataDirectory = process.env.CONTABILINICO_DEV_DATA_DIRECTORY ?? join(currentDirectory, '../../../.dev-user-data')
  mkdirSync(devUserDataDirectory, { recursive: true })
  app.setPath('userData', devUserDataDirectory)
  app.setName('ContabiliNico Dev')
}

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
  const donationApi = (): URL => {
    const url = new URL(process.env.DONATION_API_URL ?? 'http://127.0.0.1:3000')
    if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
      throw new Error('Serviço de doações indisponível. Tente novamente mais tarde')
    }
    return url
  }
  const requestDonation = async (path: string, init: RequestInit): Promise<any> => {
    try {
      const response = await fetch(new URL(path, donationApi()), init)
      let body: any = null
      try { body = await response.json() } catch { /* Não propague corpo bruto do serviço. */ }
      if (response.status === 404 && path === '/donation-orders/current') return null
      if (response.status === 422 && body?.reason === 'VALOR_NAO_ACEITO') return body
      if (!response.ok || response.status === 202) throw new Error(typeof body?.message === 'string'
        ? body.message : 'Não foi possível retomar o pagamento agora')
      return body
    } catch (error) {
      if (error instanceof Error && error.message !== 'fetch failed') throw error
      throw new Error('Serviço de doações indisponível. Tente novamente mais tarde')
    }
  }
  const validIdentity = (value: unknown): value is string => typeof value === 'string' && value.length >= 16 && value.length <= 256
  ipcMain.handle(IPC_CHANNELS.GET_CURRENT_DONATION, async (_event, rawIntent: unknown) => {
    if (!validIdentity(rawIntent)) return null
    return requestDonation('/donation-orders/current', { headers: { 'X-Donation-Intent': rawIntent } })
  })
  ipcMain.handle(IPC_CHANNELS.CREATE_DONATION, async (_event, rawInput: unknown) => {
    if (!rawInput || typeof rawInput !== 'object') throw new Error('Informe um valor em reais de pelo menos R$ 0,50, com até duas casas decimais')
    const input = rawInput as CreateDonationInput
    if (!validIdentity(input.intent) || !validIdentity(input.operation) || typeof input.amount !== 'string' || input.currency !== 'BRL') {
      throw new Error('Informe um valor em reais de pelo menos R$ 0,50, com até duas casas decimais')
    }
    return requestDonation('/donation-orders', { method: 'POST', headers: { 'Content-Type': 'application/json',
      'X-Donation-Intent': input.intent, 'Idempotency-Key': input.operation },
    body: JSON.stringify({ amount: input.amount, currency: input.currency }) })
  })
  ipcMain.handle(IPC_CHANNELS.RETRY_DONATION, async (_event, rawInput: unknown) => {
    if (!rawInput || typeof rawInput !== 'object') throw new Error('Informe uma identidade de operação válida')
    const input = rawInput as { orderId?: unknown; intent?: unknown; operation?: unknown }
    if (!validIdentity(input.intent) || !validIdentity(input.operation) || typeof input.orderId !== 'string'
      || !/^[0-9a-f-]{36}$/i.test(input.orderId)) throw new Error('Informe uma identidade de operação válida')
    return requestDonation(`/donation-orders/${encodeURIComponent(input.orderId)}/attempts`, { method: 'POST', headers: {
      'X-Donation-Intent': input.intent, 'Idempotency-Key': input.operation } })
  })
  ipcMain.handle(IPC_CHANNELS.OPEN_DONATION_CHECKOUT, async (_event, rawUrl: unknown) => {
    const checkoutUrl = allowedDonationCheckoutUrl(rawUrl)
    if (!checkoutUrl) throw new Error('Checkout inválido')
    await shell.openExternal(checkoutUrl)
  })
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
  registerDocumentReviewHandlers()
  registerConflictResolutionHandlers()
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
