import { join } from 'node:path'
import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC_CHANNELS } from '@motor/contracts'
import { activeDatabase, beginDatabaseMaintenance, closeDatabase, endDatabaseMaintenance } from './main-services'
import { BackupService } from './backup-service'
import { disposeCandidate, installRestore, prepareRestore, recoverInterruptedRestore } from './backup-restore'

let service: BackupService | undefined
async function startBackupService(): Promise<BackupService> {
  service = new BackupService(activeDatabase(), join(app.getPath('userData'), 'backup-settings.json'), app.getVersion())
  await service.initialize()
  service.start()
  return service
}
export async function registerBackupHandlers(): Promise<void> {
  await startBackupService()
  ipcMain.handle(IPC_CHANNELS.GET_BACKUP_STATUS, () => service!.status())
  ipcMain.handle(IPC_CHANNELS.SET_BACKUP_RETENTION, async (_event, count: unknown) => {
    activeDatabase()
    if (typeof count !== 'number') throw new Error('Retenção inválida.')
    return service!.setRetention(count)
  })
  ipcMain.handle(IPC_CHANNELS.CREATE_BACKUP, async () => {
    activeDatabase()
    const destination = service!.status().destination
    const selection = await dialog.showOpenDialog({ title: 'Escolha a pasta dos backups',
      properties: ['openDirectory', 'createDirectory'], ...(destination ? { defaultPath: destination } : {}) })
    if (selection.canceled || !selection.filePaths[0]) return null
    activeDatabase()
    return service!.create(selection.filePaths[0])
  })
  ipcMain.handle(IPC_CHANNELS.RESTORE_BACKUP, async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window || event.senderFrame !== event.sender.mainFrame) throw new Error('Solicitação de restauração inválida.')
    activeDatabase()
    const selected = await dialog.showOpenDialog(window, { title: 'Selecione a pasta de uma cópia de backup', properties: ['openDirectory'] })
    if (selected.canceled || !selected.filePaths[0]) return false
    if (service!.status().busy) throw new Error('Aguarde o backup em andamento.')
    const database = beginDatabaseMaintenance()
    await service!.stop()
    const dataDirectory = app.getPath('userData')
    let prepared: Awaited<ReturnType<typeof prepareRestore>> | undefined
    let switching = false
    try {
      prepared = await prepareRestore(selected.filePaths[0], dataDirectory, app.getVersion())
      const confirmation = await dialog.showMessageBox(window, { type: 'warning', title: 'Restaurar backup',
        message: `Restaurar os dados de ${new Date(prepared.createdAt).toLocaleString('pt-BR')}?`,
        detail: 'Os dados atuais serão substituídos. Uma cópia de segurança do estado atual será guardada antes da troca. O aplicativo será reiniciado. Arquivos XML/ZIP externos e preferências de backup não serão substituídos.',
        buttons: ['Cancelar', 'Restaurar e reiniciar'], defaultId: 0, cancelId: 0, noLink: true })
      if (confirmation.response !== 1) return false
      switching = true
      await installRestore(prepared, dataDirectory, database, closeDatabase)
      app.relaunch()
      app.exit(0)
      return true
    } catch (error) {
      if (switching && !database.isOpen) {
        // Fecha o fluxo e recupera a instalação anterior antes do próximo início.
        await recoverInterruptedRestore(dataDirectory)
        dialog.showErrorBox('Restauração não concluída', 'O estado anterior foi recuperado. O aplicativo será reiniciado.')
        app.relaunch(); app.exit(0)
      }
      throw error
    } finally {
      if (prepared) await disposeCandidate(prepared.path).catch(() => undefined)
      if (database.isOpen) {
        endDatabaseMaintenance()
        await startBackupService()
      }
    }
  })
}
export async function stopBackups(): Promise<void> { await service?.stop() }
