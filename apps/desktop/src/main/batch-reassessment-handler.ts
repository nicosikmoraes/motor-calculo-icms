import { ipcMain } from 'electron'
import { IPC_CHANNELS, type RuleAssessmentRunSummary } from '@motor/contracts'
import { SqliteBatchRepository, SqliteOrganizationRepository } from '@motor/database'
import { AppError, AppErrorCode } from '@motor/domain'
import { BUILTIN_ICMS_OWN_PACK } from '@motor/tax-engine'
import { assessBuiltinRules } from './rule-pack-assessment'
import { activeDatabase, requiredInputText } from './main-services'

/** Reavalia todos os itens normalizados de um lote e preserva a avaliação da importação. */
export function registerBatchReassessmentHandler(): void {
  ipcMain.handle(
    IPC_CHANNELS.REASSESS_BATCH_RULES,
    (_event, rawBatchId: unknown): RuleAssessmentRunSummary => {
      const batchId = requiredInputText(rawBatchId, 'Lote')
      const connection = activeDatabase()
      const organization = new SqliteOrganizationRepository(connection).findSingle()
      const batches = new SqliteBatchRepository(connection)
      const batch = batches.findById(batchId)
      if (!organization || !batch || batch.organizationId !== organization.id) {
        throw new AppError(AppErrorCode.BATCH_NOT_FOUND)
      }
      const assessedAt = new Date().toISOString()
      const assessments = batches.listNormalizedDocuments(batchId).flatMap((document) =>
        document.normalized.items.map((item) => ({
          documentId: document.id,
          itemNumber: item.itemNumber,
          assessment: assessBuiltinRules(document.normalized, item, assessedAt),
        })),
      )
      return batches.createRuleAssessmentRun(
        batchId, BUILTIN_ICMS_OWN_PACK.id, BUILTIN_ICMS_OWN_PACK.version,
        assessedAt, assessments,
      )
    },
  )
}
