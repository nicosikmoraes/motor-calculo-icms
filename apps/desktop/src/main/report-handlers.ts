import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { IPC_CHANNELS } from '@motor/contracts'
import { buildReportData, generateExcelReport } from '@motor/reporting'
import { activeDatabase, batchOperations, requiredInputText } from './main-services'
import { queryBatchDetail } from './batch-query-handlers'
import { writeExcelFile } from './report-file-io'

export function registerReportHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.EXPORT_BATCH_EXCEL, async (event, rawBatchId: unknown) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window || event.senderFrame !== event.sender.mainFrame) throw new Error('Solicitação de exportação inválida.')
    const batchId = requiredInputText(rawBatchId, 'Lote')
    if (batchId.length > 128) throw new Error('Identificador do lote inválido.')
    if (batchOperations.busy) throw new Error('Aguarde ou pause a importação antes de exportar o lote.')
    // Snapshot antes do diálogo: nenhuma transação SQLite permanece aberta enquanto o usuário escolhe o destino.
    const report = buildReportData(queryBatchDetail(activeDatabase(), batchId), { generatedAt: new Date().toISOString(), appVersion: app.getVersion() })
    const selected = await dialog.showSaveDialog(window, { title: 'Exportar conferência do lote para Excel',
      defaultPath: `conferencia-${batchId.replace(/[^a-zA-Z0-9_-]/g, '_')}.xlsx`, filters: [{ name: 'Planilha Excel', extensions: ['xlsx'] }] })
    if (selected.canceled || !selected.filePath || event.sender.isDestroyed()) return null
    if (!selected.filePath.toLowerCase().endsWith('.xlsx')) throw new Error('Salve o relatório com a extensão .xlsx.')
    const bytes = await generateExcelReport(report)
    if (event.sender.isDestroyed()) return null
    await writeExcelFile(selected.filePath, bytes)
    return { path: selected.filePath }
  })
}
