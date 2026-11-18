import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, dialog } from 'electron'
import { IPC_CHANNELS } from '@motor/contracts'
import { AppErrorMessage } from '@motor/domain'
import { registerIpcRoutes } from '../ipc/routes'
import { stopBackups } from '../modules/backup/adapters/backup-runtime'
import { stopImportWorkers } from '../modules/batches/adapters/worker/import-worker-client'
import { closeDatabase, openDatabase } from '../platform/sqlite/database-runtime'
import { createWindowManager } from './main-window'

export function startDesktop(runtimeDirectory: string, icon: string): void {
  if (!app.isPackaged) {
    const devUserDataDirectory = process.env.CONTABILINICO_DEV_DATA_DIRECTORY ?? join(runtimeDirectory, '../../../.dev-user-data')
    mkdirSync(devUserDataDirectory, { recursive: true })
    app.setPath('userData', devUserDataDirectory)
    app.setName('ContabiliNico Dev')
  }

  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
  }

  const windows = createWindowManager(runtimeDirectory, icon)
  let initialized = false
  app.on('second-instance', () => {
    if (initialized) windows.open()
  })

  void app.whenReady().then(async () => {
    try {
      await openDatabase()
      await registerIpcRoutes(() => {
        const window = windows.current()
        if (window && !window.isDestroyed()) window.webContents.send(IPC_CHANNELS.AUTH_SESSION_EXPIRED)
      })
      windows.open()
      initialized = true
    } catch (error) {
      const message = error instanceof Error ? error.message : AppErrorMessage.UNKNOWN_FAILURE
      dialog.showErrorBox(AppErrorMessage.DATABASE_OPEN_TITLE, message)
      app.quit()
      return
    }

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) windows.open()
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
}
