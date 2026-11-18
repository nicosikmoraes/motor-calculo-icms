import { join } from 'node:path'
import { app } from 'electron'
import { activeDatabase } from '../../../platform/sqlite/database-runtime'
import { BackupService } from './files/backup-service'

let service: BackupService | undefined

export async function startBackupService(): Promise<void> {
  service = new BackupService(activeDatabase(), join(app.getPath('userData'), 'backup-settings.json'), app.getVersion())
  await service.initialize()
  service.start()
}

export function activeBackupService(): BackupService {
  if (!service) throw new Error('Serviço de backup não iniciado.')
  return service
}

export async function stopBackups(): Promise<void> { await service?.stop() }
