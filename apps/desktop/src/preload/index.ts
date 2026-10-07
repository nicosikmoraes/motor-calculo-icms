import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC_CHANNELS,
  type BatchPreparation,
  type BatchOperationProgress,
  type BatchDetail,
  type RuleAssessmentRunSummary,
  type BatchListItem,
  type CompanySummary,
  type FiscalProfileSummary,
  type FiscalProfileSuggestion, type CreateSuggestedFiscalProfileResult,
  type BuiltinRulePackSummary, type VersionedRuleSummary, type RuleAuditSummary,
  type SupplierProductSummary,
  type CreatedBatchSummary,
  type DesktopApi, type RecoverableImport, type BackupStatus,
  type OrganizationSummary,
  type SelectedSource,
  type WorkspaceState,
  type RegistrationAuditEvent,
} from '@motor/contracts'
import { copyCreateBatchInput, copySelectedSources } from './serializable-inputs'

const api: DesktopApi = {
  listDocumentReviews: () => ipcRenderer.invoke(IPC_CHANNELS.LIST_DOCUMENT_REVIEWS),
  saveDocumentReview: input => ipcRenderer.invoke(IPC_CHANNELS.SAVE_DOCUMENT_REVIEW, {
    artifactId: input.artifactId, documentId: input.documentId, action: input.action, reason: input.reason,
    expectedSnapshot: input.expectedSnapshot, requestId: input.requestId,
  }),
  getMonthlyConference: (input) => ipcRenderer.invoke(IPC_CHANNELS.GET_MONTHLY_CONFERENCE, { companyId: input.companyId, period: input.period }),
  exportMonthlyExcel: (input) => ipcRenderer.invoke(IPC_CHANNELS.EXPORT_MONTHLY_EXCEL, { companyId: input.companyId, period: input.period }),
  exportBatchExcel: (batchId) => ipcRenderer.invoke(IPC_CHANNELS.EXPORT_BATCH_EXCEL, batchId),
  exportPack: () => ipcRenderer.invoke(IPC_CHANNELS.EXPORT_PACK),
  previewPack: () => ipcRenderer.invoke(IPC_CHANNELS.PREVIEW_PACK),
  importPack: (input) => ipcRenderer.invoke(IPC_CHANNELS.IMPORT_PACK, { token: input.token, choices: { ...input.choices } }),
  discardPack: (token) => ipcRenderer.invoke(IPC_CHANNELS.DISCARD_PACK, token),
  pauseBatchOperation: (operationId) => ipcRenderer.invoke(IPC_CHANNELS.PAUSE_BATCH_OPERATION, operationId) as Promise<boolean>,
  listRecoverableImports: () => ipcRenderer.invoke(IPC_CHANNELS.LIST_RECOVERABLE_IMPORTS) as Promise<readonly RecoverableImport[]>,
  resumeImport: (id, operationId) => ipcRenderer.invoke(IPC_CHANNELS.RESUME_IMPORT, id, operationId) as Promise<CreatedBatchSummary>,
  setBackupRetention: (count) => ipcRenderer.invoke(IPC_CHANNELS.SET_BACKUP_RETENTION, count) as Promise<BackupStatus>,
  restoreBackup: () => ipcRenderer.invoke(IPC_CHANNELS.RESTORE_BACKUP) as Promise<boolean>,
  getBackupStatus: () => ipcRenderer.invoke(IPC_CHANNELS.GET_BACKUP_STATUS) as Promise<BackupStatus>,
  createBackup: () => ipcRenderer.invoke(IPC_CHANNELS.CREATE_BACKUP) as Promise<BackupStatus | null>,
  getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.APP_VERSION) as Promise<string>,
  getWorkspace: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_WORKSPACE) as Promise<WorkspaceState>,
  listRegistrationAudit: (filter) =>
    ipcRenderer.invoke(IPC_CHANNELS.LIST_REGISTRATION_AUDIT, filter ?? {}) as Promise<readonly RegistrationAuditEvent[]>,
  createOrganization: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.CREATE_ORGANIZATION, input) as Promise<OrganizationSummary>,
  renameOrganization: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.RENAME_ORGANIZATION, input) as Promise<OrganizationSummary>,
  createCompany: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.CREATE_COMPANY, input) as Promise<CompanySummary>,
  updateCompany: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_COMPANY, { ...input }) as Promise<CompanySummary>,
  inactivateCompany: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.INACTIVATE_COMPANY, { ...input }) as Promise<CompanySummary>,
  reactivateCompany: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.REACTIVATE_COMPANY, { ...input }) as Promise<CompanySummary>,
  listFiscalProfiles: (companyId) =>
    ipcRenderer.invoke(IPC_CHANNELS.LIST_FISCAL_PROFILES, companyId) as Promise<readonly FiscalProfileSummary[]>,
  listFiscalProfileSuggestions: (companyId) =>
    ipcRenderer.invoke(IPC_CHANNELS.LIST_FISCAL_PROFILE_SUGGESTIONS, companyId) as Promise<readonly FiscalProfileSuggestion[]>,
  createSuggestedFiscalProfile: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.CREATE_SUGGESTED_FISCAL_PROFILE, { ...input }) as Promise<CreateSuggestedFiscalProfileResult>,
  getBuiltinRulePack: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_BUILTIN_RULE_PACK) as Promise<BuiltinRulePackSummary>,
  listVersionedRules: () =>
    ipcRenderer.invoke(IPC_CHANNELS.LIST_VERSIONED_RULES) as Promise<readonly VersionedRuleSummary[]>,
  createRuleDraft: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.CREATE_RULE_DRAFT, { ...input }) as Promise<VersionedRuleSummary>,
  updateRuleDraft: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_RULE_DRAFT, { ...input }) as Promise<VersionedRuleSummary>,
  createRuleVersion: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.CREATE_RULE_VERSION, { ...input }) as Promise<VersionedRuleSummary>,
  approveRule: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.APPROVE_RULE, { ...input }) as Promise<VersionedRuleSummary>,
  revokeRule: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.REVOKE_RULE, { ...input }) as Promise<VersionedRuleSummary>,
  listRuleAudit: (versionId) =>
    ipcRenderer.invoke(IPC_CHANNELS.LIST_RULE_AUDIT, versionId) as Promise<readonly RuleAuditSummary[]>,
  createFiscalProfile: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.CREATE_FISCAL_PROFILE, { ...input }) as Promise<FiscalProfileSummary>,
  updateFiscalProfile: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_FISCAL_PROFILE, { ...input }) as Promise<FiscalProfileSummary>,
  inactivateFiscalProfile: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.INACTIVATE_FISCAL_PROFILE, { ...input }) as Promise<FiscalProfileSummary>,
  reactivateFiscalProfile: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.REACTIVATE_FISCAL_PROFILE, { ...input }) as Promise<FiscalProfileSummary>,
  listSupplierProducts: (companyId) =>
    ipcRenderer.invoke(IPC_CHANNELS.LIST_SUPPLIER_PRODUCTS, companyId) as Promise<readonly SupplierProductSummary[]>,
  saveSupplierProduct: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_SUPPLIER_PRODUCT, { ...input }) as Promise<SupplierProductSummary>,
  updateSupplierProduct: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_SUPPLIER_PRODUCT, { ...input }) as Promise<SupplierProductSummary>,
  inactivateSupplierProduct: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.INACTIVATE_SUPPLIER_PRODUCT, { ...input }) as Promise<SupplierProductSummary>,
  reactivateSupplierProduct: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.REACTIVATE_SUPPLIER_PRODUCT, { ...input }) as Promise<SupplierProductSummary>,
  selectSources: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SELECT_SOURCES) as Promise<SelectedSource[]>,
  inspectSources: (sources, operationId) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.INSPECT_SOURCES,
      copySelectedSources(sources),
      operationId,
    ) as Promise<BatchPreparation>,
  createBatch: (input) =>
    ipcRenderer.invoke(
      IPC_CHANNELS.CREATE_BATCH,
      copyCreateBatchInput(input),
    ) as Promise<CreatedBatchSummary>,
  cancelBatchOperation: (operationId) =>
    ipcRenderer.invoke(IPC_CHANNELS.CANCEL_BATCH_OPERATION, operationId) as Promise<boolean>,
  onBatchProgress: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: BatchOperationProgress): void => listener(progress)
    ipcRenderer.on(IPC_CHANNELS.BATCH_PROGRESS, handler)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.BATCH_PROGRESS, handler)
  },
  listBatches: () =>
    ipcRenderer.invoke(IPC_CHANNELS.LIST_BATCHES) as Promise<readonly BatchListItem[]>,
  getBatchDetail: (batchId, runId) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_BATCH_DETAIL, batchId, runId) as Promise<BatchDetail>,
  reassessBatchRules: (batchId) =>
    ipcRenderer.invoke(IPC_CHANNELS.REASSESS_BATCH_RULES, batchId) as Promise<RuleAssessmentRunSummary>,
  getItemFiscalContext: (batchId, documentId, itemNumber) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_ITEM_FISCAL_CONTEXT, batchId, documentId, itemNumber),
  saveItemFiscalAnswers: (input) => ipcRenderer.invoke(IPC_CHANNELS.SAVE_ITEM_FISCAL_ANSWERS, {
    batchId: input.batchId, documentId: input.documentId, itemNumber: input.itemNumber,
    requestId: input.requestId, expectedRunId: input.expectedRunId, answers: { ...input.answers },
    reuseScope: input.reuseScope, expectedDefinitionId: input.expectedDefinitionId,
  }),
  applyReusableFiscalAnswers: (batchId) => ipcRenderer.invoke(IPC_CHANNELS.APPLY_REUSABLE_FISCAL_ANSWERS, batchId),
}

contextBridge.exposeInMainWorld('desktopApi', api)
