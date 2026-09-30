import { ipcMain } from 'electron'
import { IPC_CHANNELS, type RuleAssessmentRunSummary } from '@motor/contracts'
import { SqliteBatchRepository, SqliteOrganizationRepository, SqliteFiscalCatalogRepository, SqliteVersionedRuleRepository } from '@motor/database'
import { AppError, AppErrorCode } from '@motor/domain'
import { BUILTIN_ICMS_OWN_PACK } from '@motor/tax-engine'
import { assessFiscalRules, LOCAL_RULE_PACK_ID, LOCAL_RULE_PACK_VERSION } from './rule-pack-assessment'
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
      const catalog = new SqliteFiscalCatalogRepository(connection)
      const versionedRules = new SqliteVersionedRuleRepository(connection).list(organization.id)
      const documents = batches.listNormalizedDocuments(batchId)
      const companyIds = [...new Set(documents.map((document) => document.companyId).filter((id): id is string => Boolean(id)))]
      const profilesByCompany = new Map(companyIds.map((id) => [id, catalog.listProfiles(id)] as const))
      const productsByCompany = new Map(companyIds.map((id) => [id, catalog.listSupplierProducts(id)] as const))
      const assessedAt = new Date().toISOString()
      const assessments = documents.flatMap((document) =>
        document.normalized.items.map((item) => ({
          documentId: document.id,
          itemNumber: item.itemNumber,
          assessment: assessFiscalRules(document.normalized, item, versionedRules, document.companyId,
            profilesByCompany.get(document.companyId ?? ''), productsByCompany.get(document.companyId ?? ''), assessedAt),
        })),
      )
      return batches.createRuleAssessmentRun(
        batchId, versionedRules.length ? LOCAL_RULE_PACK_ID : BUILTIN_ICMS_OWN_PACK.id,
        versionedRules.length ? LOCAL_RULE_PACK_VERSION : BUILTIN_ICMS_OWN_PACK.version,
        assessedAt, assessments,
      )
    },
  )
}
