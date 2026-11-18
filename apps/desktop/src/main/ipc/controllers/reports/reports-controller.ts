import { app, BrowserWindow, dialog } from 'electron'
import type { RegisterIpcRoute } from '../../route-registry'
import { IPC_CHANNELS } from '@motor/contracts'
import { buildReportData, generateExcelReport } from '@motor/reporting'
import { activeDatabase } from '../../../platform/sqlite/database-runtime'
import { batchOperations } from '../../../platform/operations/batch-operations'
import { requiredInputText } from '../../validation/input'
import { queryBatchDetail } from '../../../modules/batches/queries/batch-queries'
import { writeExcelFile } from '../../../modules/reports/adapters/report-file-io'
import { queryMonthlyConference, queryMonthlyReport, validateMonthlyInput } from '../../../modules/reports/queries/monthly-conference'

export function registerReportHandlers(register: RegisterIpcRoute): void {
  register(IPC_CHANNELS.GET_MONTHLY_CONFERENCE, (event, raw: unknown) => {
    if (!BrowserWindow.fromWebContents(event.sender) || event.senderFrame !== event.sender.mainFrame) throw new Error('Solicitação de conferência inválida.')
    if (batchOperations.busy) throw new Error('Aguarde ou pause a importação antes de consultar a conferência mensal.')
    return queryMonthlyConference(activeDatabase(), validateMonthlyInput(raw))
  })
  register(IPC_CHANNELS.EXPORT_MONTHLY_EXCEL, async (event, raw: unknown) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window || event.senderFrame !== event.sender.mainFrame) throw new Error('Solicitação de exportação inválida.')
    if (batchOperations.busy) throw new Error('Aguarde ou pause a importação antes de exportar a conferência mensal.')
    const input = validateMonthlyInput(raw)
    const report = queryMonthlyReport(activeDatabase(), input, app.getVersion())
    const selected = await dialog.showSaveDialog(window, { title: 'Exportar conferência mensal para Excel',
      defaultPath: `conferencia-mensal-${report.documents.find(document => document.companyCnpj)?.companyCnpj ?? input.companyId.replace(/[^a-zA-Z0-9_-]/g, '_')}-${input.period}.xlsx`, filters: [{ name: 'Planilha Excel', extensions: ['xlsx'] }] })
    if (selected.canceled || !selected.filePath || event.sender.isDestroyed()) return null
    if (!selected.filePath.toLowerCase().endsWith('.xlsx')) throw new Error('Salve o relatório com a extensão .xlsx.')
    const bytes = await generateExcelReport(report)
    if (event.sender.isDestroyed()) return null
    await writeExcelFile(selected.filePath, bytes)
    return { path: selected.filePath }
  })
  register(IPC_CHANNELS.EXPORT_BATCH_EXCEL, async (event, rawBatchId: unknown) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (!window || event.senderFrame !== event.sender.mainFrame) throw new Error('Solicitação de exportação inválida.')
    const batchId = requiredInputText(rawBatchId, 'Lote')
    if (batchId.length > 128) throw new Error('Identificador do lote inválido.')
    if (batchOperations.busy) throw new Error('Aguarde ou pause a importação antes de exportar o lote.')
    // Snapshot antes do diálogo: nenhuma transação SQLite permanece aberta enquanto o usuário escolhe o destino.
    const report = buildReportData(queryBatchDetail(activeDatabase(), batchId), { generatedAt: new Date().toISOString(), appVersion: app.getVersion() })
    const selected = await dialog.showSaveDialog(window, { title: 'Exportar conferência do lote para Excel',
      defaultPath: `conferencia-${report.batch.companyCnpj ?? 'multiplas-empresas'}-${batchId.replace(/[^a-zA-Z0-9_-]/g, '_')}.xlsx`, filters: [{ name: 'Planilha Excel', extensions: ['xlsx'] }] })
    if (selected.canceled || !selected.filePath || event.sender.isDestroyed()) return null
    if (!selected.filePath.toLowerCase().endsWith('.xlsx')) throw new Error('Salve o relatório com a extensão .xlsx.')
    const bytes = await generateExcelReport(report)
    if (event.sender.isDestroyed()) return null
    await writeExcelFile(selected.filePath, bytes)
    return { path: selected.filePath }
  })
}
