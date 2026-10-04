import { join } from 'node:path'
import { app, dialog, ipcMain } from 'electron'
import { IPC_CHANNELS } from '@motor/contracts'
import { activeDatabase } from './main-services'
import { BackupService } from './backup-service'

let service: BackupService | undefined
export async function registerBackupHandlers(): Promise<void> {
  service = new BackupService(activeDatabase(), join(app.getPath('userData'), 'backup-settings.json'), app.getVersion())
  await service.initialize()
  const backup = service
  ipcMain.handle(IPC_CHANNELS.GET_BACKUP_STATUS, () => backup.status())
  ipcMain.handle(IPC_CHANNELS.CREATE_BACKUP, async () => {
    const destination = backup.status().destination
    const selection = await dialog.showOpenDialog({ title: 'Escolha a pasta dos backups',
      properties: ['openDirectory', 'createDirectory'], ...(destination ? { defaultPath: destination } : {}) })
    if (selection.canceled || !selection.filePaths[0]) return null
    return backup.create(selection.filePaths[0])
  })
  backup.start()
}
export async function stopBackups(): Promise<void> { await service?.stop() }
