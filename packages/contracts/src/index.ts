export const IPC_CHANNELS = {
  APP_VERSION: 'app:get-version',
  EXPORT_PACK: 'interchange:export',
  PREVIEW_PACK: 'interchange:preview',
  IMPORT_PACK: 'interchange:import',
  DISCARD_PACK: 'interchange:discard',
  GET_WORKSPACE: 'workspace:get',
  LIST_REGISTRATION_AUDIT: 'registrations:audit-list',
  CREATE_ORGANIZATION: 'workspace:create-organization',
  RENAME_ORGANIZATION: 'workspace:rename-organization',
  CREATE_COMPANY: 'companies:create',
  UPDATE_COMPANY: 'companies:update',
  INACTIVATE_COMPANY: 'companies:inactivate',
  REACTIVATE_COMPANY: 'companies:reactivate',
  LIST_FISCAL_PROFILES: 'fiscal-profiles:list',
  LIST_FISCAL_PROFILE_SUGGESTIONS: 'fiscal-profiles:list-suggestions',
  CREATE_SUGGESTED_FISCAL_PROFILE: 'fiscal-profiles:create-suggestion',
  GET_BUILTIN_RULE_PACK: 'fiscal-rules:built-in-pack',
  LIST_VERSIONED_RULES: 'fiscal-rules:list-versioned',
  CREATE_RULE_DRAFT: 'fiscal-rules:create-draft',
  UPDATE_RULE_DRAFT: 'fiscal-rules:update-draft',
  CREATE_RULE_VERSION: 'fiscal-rules:new-version',
  APPROVE_RULE: 'fiscal-rules:approve',
  REVOKE_RULE: 'fiscal-rules:revoke',
  LIST_RULE_AUDIT: 'fiscal-rules:list-audit',
  CREATE_FISCAL_PROFILE: 'fiscal-profiles:create',
  UPDATE_FISCAL_PROFILE: 'fiscal-profiles:update',
  INACTIVATE_FISCAL_PROFILE: 'fiscal-profiles:inactivate',
  REACTIVATE_FISCAL_PROFILE: 'fiscal-profiles:reactivate',
  LIST_SUPPLIER_PRODUCTS: 'supplier-products:list',
  SAVE_SUPPLIER_PRODUCT: 'supplier-products:save',
  UPDATE_SUPPLIER_PRODUCT: 'supplier-products:update',
  INACTIVATE_SUPPLIER_PRODUCT: 'supplier-products:inactivate',
  REACTIVATE_SUPPLIER_PRODUCT: 'supplier-products:reactivate',
  SELECT_SOURCES: 'batch:select-sources',
  INSPECT_SOURCES: 'batch:inspect-sources',
  CREATE_BATCH: 'batch:create',
  CANCEL_BATCH_OPERATION: 'batch:cancel-operation',
  BATCH_PROGRESS: 'batch:progress',
  LIST_BATCHES: 'batch:list',
  GET_BATCH_DETAIL: 'batch:get-detail',
  REASSESS_BATCH_RULES: 'batch:reassess-rules',
} as const

export interface OrganizationSummary {
  id: string
  revision: number
  name: string
}

export interface CompanySummary {
  id: string
  revision: number
  legalName: string
  tradeName?: string
  cnpj: string
  state: string
  active: boolean
}

export enum RegistrationEntityCode {
  ORGANIZATION = 'ORGANIZATION', COMPANY = 'COMPANY',
  FISCAL_PROFILE = 'FISCAL_PROFILE', SUPPLIER_PRODUCT = 'SUPPLIER_PRODUCT',
}
export enum RegistrationOperationCode {
  CREATE = 'CREATE', UPDATE = 'UPDATE',
  INACTIVATE = 'INACTIVATE', REACTIVATE = 'REACTIVATE',
}
export interface RegistrationAuditEvent {
  id: string
  entity: RegistrationEntityCode
  entityId: string
  operation: RegistrationOperationCode
  revision: number
  changes: Readonly<Record<string, { before: string | number | boolean | null; after: string | number | boolean | null }>>
  computer: string
  systemUser: string
  createdAt: string
}
export interface RegistrationAuditFilter {
  entity?: RegistrationEntityCode
  entityId?: string
  operation?: RegistrationOperationCode
  from?: string
  until?: string
  limit?: number
}

export interface WorkspaceState {
  organization?: OrganizationSummary
  companies: readonly CompanySummary[]
}

/** Contrato de edição versionada, usado quando a migration de revisões estiver ativa. */
export interface RegistrationMutationInput {
  id: string
  expectedRevision: number
}

export interface RegistrationMutationResult {
  id: string
  revision: number
}

export interface UpdateOrganizationRegistrationInput extends RegistrationMutationInput {
  name: string
}

export interface UpdateCompanyRegistrationInput extends RegistrationMutationInput {
  legalName: string
  tradeName?: string
  state: string
}

export interface UpdateFiscalProfileRegistrationInput extends RegistrationMutationInput {
  name: string
  validFrom: string
  validUntil?: string
}

export interface UpdateSupplierProductRegistrationInput extends RegistrationMutationInput {
  profileId: string
}

export interface CreateOrganizationInput {
  name: string
}

export interface RenameOrganizationInput {
  name: string
  expectedRevision: number
}

export interface CreateCompanyInput {
  legalName: string
  tradeName?: string
  cnpj: string
  state: string
}

/** Proposta cadastral extraída de XMLs; não representa regra ou alíquota aprovada. */
export interface FiscalProfileSuggestion {
  key: string
  name: string
  validFrom: string
  ncm: string
  cest?: string
  originCode?: string
  documentCount: number
  products: readonly { supplierCnpj: string; productCode: string; description?: string }[]
}

export interface CreateSuggestedFiscalProfileInput {
  companyId: string
  suggestionKey: string
}

export interface CreateSuggestedFiscalProfileResult {
  profile: FiscalProfileSummary
  linkedProducts: number
}

export interface FiscalProfileSummary {
  active: boolean
  id: string
  revision: number
  companyId: string
  name: string
  validFrom: string
  validUntil?: string
}

export interface CreateFiscalProfileInput {
  companyId: string
  name: string
  validFrom: string
  validUntil?: string
}

export interface SupplierProductSummary {
  active: boolean
  id: string
  revision: number
  companyId: string
  supplierCnpj: string
  productCode: string
  profileId: string
}

export interface SaveSupplierProductInput {
  expectedRevision?: number
  companyId: string
  supplierCnpj: string
  productCode: string
  profileId: string
}

export enum SourceKindCode {
  XML = 'XML',
  ZIP = 'ZIP',
}
export type SourceKind = `${SourceKindCode}`
export interface SelectedSource {
  path: string
  kind: SourceKind
}

export interface BatchCompanyCandidate {
  cnpj: string
  legalName?: string
  state?: string
  roles: readonly ('ISSUER' | 'RECIPIENT')[]
  documentCount: number
  matchedCompanyId?: string
}

export interface BatchSourceIssue {
  source: string
  code: string
  message: string
}

export interface BatchPreparation {
  documents: readonly BatchPreparedDocument[]
  artifacts: readonly { source: string; kind: 'PROTOCOL' | 'EVENT'; accessKey: string; eventType?: string }[]
  candidates: readonly BatchCompanyCandidate[]
  issues: readonly BatchSourceIssue[]
  inspectedXmlCount: number
  totalEntries: number
  environmentCodes: readonly ('1' | '2')[]
}

export interface BatchPreparedDocument {
  source: string
  accessKey: string
  number: string
  issuerCnpj?: string
  recipientCnpj?: string
}

export interface CreateBatchInput {
  operationId: string
  artifactCompanyId?: string
  totalEntries: number
  assignments: readonly { source: string; companyId: string }[]
  environmentCode: '1' | '2'
  sources: readonly SelectedSource[]
}

export enum BatchOperationPhaseCode {
  INSPECTING = 'INSPECTING',
  PROCESSING = 'PROCESSING',
  SAVING = 'SAVING',
  CANCELLING = 'CANCELLING',
}

export interface BatchOperationProgress {
  operationId: string
  phase: `${BatchOperationPhaseCode}`
  completed: number
  total: number
  currentSource?: string
}

export interface CreatedBatchSummary {
  id: string
  status: string
  totalFiles: number
  totalDocuments: number
  totalPendencies: number
}

export interface BatchListItem extends CreatedBatchSummary {
  companyId?: string
  companyName?: string
  originalName?: string
  receivedAt: string
  environmentCode?: '1' | '2'
}

export interface BatchOccurrenceSummary {
  id: string
  originalName: string
  relativePath: string
  kind: string
  origin: string
  contentHash: string
  sizeBytes: number
  accessKey?: string
  ingestionStatus: string
  repetition: string
  contentConflict: string
  eligibleForTotals: boolean
}

export interface BatchDiagnosticSummary {
  id: string
  source: string
  code: string
  message: string
}

export enum ItemClassificationReasonCode {
  COMPANY_MISSING = 'COMPANY_MISSING',
  ISSUER_CNPJ_MISSING = 'ISSUER_CNPJ_MISSING',
  PRODUCT_CODE_MISSING = 'PRODUCT_CODE_MISSING',
  PRODUCT_NOT_LINKED = 'PRODUCT_NOT_LINKED',
  PRODUCT_INACTIVE = 'PRODUCT_INACTIVE',
  PROFILE_NOT_FOUND = 'PROFILE_NOT_FOUND',
  PROFILE_INACTIVE = 'PROFILE_INACTIVE',
  ISSUE_DATE_MISSING = 'ISSUE_DATE_MISSING',
  PROFILE_NOT_YET_VALID = 'PROFILE_NOT_YET_VALID',
  PROFILE_EXPIRED = 'PROFILE_EXPIRED',
  PROFILE_ACTIVE = 'PROFILE_ACTIVE',
}
export type ItemClassificationReason = `${ItemClassificationReasonCode}`
export enum FiscalRuleStatusCode {
  DRAFT = 'DRAFT',
  APPROVED = 'APPROVED',
  REVOKED = 'REVOKED',
}

export interface RuleDraftFields {
  name: string
  level: string
  priority: number
  priorityReason?: string
  validFrom: string
  validUntil?: string
  legalBasis?: string
  conditions: Readonly<Record<string, string>>
}
export interface CreateRuleDraftInput extends RuleDraftFields {}
export interface UpdateRuleDraftInput extends RuleDraftFields {
  id: string
  expectedRevision: number
}
export interface RuleVersionMutationInput {
  id: string
  expectedRevision: number
}
export interface RevokeRuleInput extends RuleVersionMutationInput {
  reason: string
}
export interface VersionedRuleSummary extends RuleDraftFields {
  id: string
  familyId: string
  version: number
  revision: number
  status: `${FiscalRuleStatusCode}`
  createdAt: string
  updatedAt: string
  approvedAt?: string
  revokedAt?: string
  revocationReason?: string
}
export interface RuleAuditSummary {
  id: string
  versionId: string
  operation: 'CREATE_DRAFT' | 'UPDATE_DRAFT' | 'NEW_VERSION' | 'APPROVE' | 'REVOKE'
  revision: number
  changes: Readonly<Record<string, { before: string | number | null; after: string | number | null }>>
  computer: string
  systemUser: string
  createdAt: string
}

export enum RuleAssessmentKindCode {
  SELECTED = 'SELECTED',
  AMBIGUOUS = 'AMBIGUOUS',
  DRAFT_MATCH = 'DRAFT_MATCH',
  NO_MATCH = 'NO_MATCH',
}

/** Motivos persistidos com a avaliação; podem coexistir no mesmo item. */
export enum RuleAssessmentPendingCode {
  REGRA_NAO_ENCONTRADA = 'REGRA_NAO_ENCONTRADA',
  REGRA_AMBIGUA = 'REGRA_AMBIGUA',
  PRODUTO_NAO_CLASSIFICADO = 'PRODUTO_NAO_CLASSIFICADO',
  DIVERGENCIA_CADASTRAL = 'DIVERGENCIA_CADASTRAL',
}

export enum FiscalItemClassificationCode {
  CLASSIFICADO = 'CLASSIFICADO',
  PENDENTE = 'PENDENTE',
  FORA_DA_VIGENCIA = 'FORA_DA_VIGENCIA',
}

export interface BuiltinRuleSummary {
  id: string
  version: number
  name: string
  status: `${FiscalRuleStatusCode}`
  validFrom: string
  validUntil?: string
  legalBasis: string
  sourceUrl: string
  proposedRate: string
  reviewNote: string
  reviewStage: 'CONDITIONS_AND_RATE_APPROVED'
  reviewedOn: string
  conditions: Readonly<Record<string, string>>
}

export interface BuiltinRulePackSummary {
  id: string
  version: number
  rules: readonly BuiltinRuleSummary[]
}

export interface RuleEvaluationSummary {
  ruleId: string
  ruleName: string
  status: BuiltinRuleSummary['status']
  proposedRate?: string
  reviewStage?: BuiltinRuleSummary['reviewStage']
  source?: 'BUILTIN' | 'LOCAL'
  familyId?: string
  version?: number
  level?: string
  priority?: number
  legalBasis?: string
  conditions?: Readonly<Record<string, string>>
  selectionRank?: number
  exclusionReasons: readonly string[]
  mismatchedConditions: readonly string[]
}

export interface ItemRuleAssessment {
  packId: string
  packVersion: number
  assessedAt: string
  context: Readonly<Record<string, string>>
  kind: `${RuleAssessmentKindCode}`
  selectedRuleId?: string
  selectedRuleVersion?: number
  tiedRuleIds?: readonly string[]
  pendingCodes?: readonly `${RuleAssessmentPendingCode}`[]
  pendingDetail?: ItemClassificationReason
  evaluated: readonly RuleEvaluationSummary[]
}

export interface FiscalItemSummary {
  itemNumber: string
  classification: `${FiscalItemClassificationCode}`
  classificationReason: ItemClassificationReason
  ruleAssessment?: ItemRuleAssessment
  originalRuleAssessment?: ItemRuleAssessment
  profileValidFrom?: string
  profileValidUntil?: string
  fiscalProfileName?: string
  supplierProductCode?: string
  description?: string
  ncm?: string
  cfop?: string
  productAmount?: string
  declaredIcmsAmount?: string
  calculation: ItemCalculationSummary
}

export enum CalculationStatusCode {
  PENDING_RULE = 'PENDING_RULE',
  PENDING_DATA = 'PENDING_DATA',
  UNSUPPORTED = 'UNSUPPORTED',
  CALCULATED = 'CALCULATED',
}

export enum CalculationInputTreatmentCode {
  INCLUDED = 'INCLUDED',
  EXCLUDED = 'EXCLUDED',
  UNDECIDED = 'UNDECIDED',
}

export interface ItemCalculationSummary {
  status: `${CalculationStatusCode}`
  reason?: string
  runId?: string
  engineVersion?: string
  rule?: { id: string; version: number; legalBasis: string }
  inputs: readonly { name: string; value?: string; source: string; treatment: `${CalculationInputTreatmentCode}`; reason?: string }[]
  steps: readonly { name: string; operation: string; inputs: Readonly<Record<string, string>>; result: string; rounding?: { scale: number; mode: string } }[]
  result?: { base: string; rate: string; amount: string }
  declared?: { base?: string; rate?: string; amount?: string }
}

export interface DocumentArtifactSummary {
  id: string
  occurrenceId: string
  documentId?: string
  kind: 'PROTOCOL' | 'EVENT'
  envelope: string
  accessKey: string
  version: string
  association: 'ASSOCIATED' | 'ORPHAN' | 'AMBIGUOUS'
  eventType?: string
  sequence?: string
  statusCode?: string
  statusReason?: string
  protocolNumber?: string
  occurredAt?: string
  responseMatches?: boolean
}

export interface FiscalDocumentSummary {
  companyId?: string
  companyName?: string
  id: string
  accessKey: string
  model: string
  number: string
  series: string
  issuedAt?: string
  environmentCode?: string
  eligibleForProcessing: boolean
  pendingReason?: string
  issuerName?: string
  issuerTaxId?: string
  recipientName?: string
  recipientTaxId?: string
  items: readonly FiscalItemSummary[]
}

export interface RuleAssessmentRunSummary {
  id: string
  number: number
  packId: string
  packVersion: number
  assessedAt: string
  itemCount: number
}

export interface BatchDetail {
  batch: BatchListItem
  occurrences: readonly BatchOccurrenceSummary[]
  diagnostics: readonly BatchDiagnosticSummary[]
  artifacts: readonly DocumentArtifactSummary[]
  documents: readonly FiscalDocumentSummary[]
  ruleAssessmentRuns: readonly RuleAssessmentRunSummary[]
  originalAssessmentPack?: { id: string; version: number }
}

export type PackEntity = 'companies' | 'profiles' | 'products' | 'rules'
export type PackConflictChoice = 'KEEP_LOCAL' | 'USE_PACKAGE'
export interface PackPreviewRow {
  key: string
  entity: PackEntity
  label: string
  status: 'NEW' | 'SAME' | 'CONFLICT' | 'BLOCKED'
  reason?: string
  canUsePackage: boolean
  differences: readonly { field: string; local: string; incoming: string }[]
}
export interface PackImportPreview {
  token: string
  fileName: string
  createdAt: string
  appVersion: string
  counts: Record<PackEntity, number>
  rows: readonly PackPreviewRow[]
}
export interface PackImportInput {
  token: string
  choices: Readonly<Record<string, PackConflictChoice>>
}
export interface PackImportResult { created: number; updated: number; kept: number }
export interface PackExportResult { path: string; counts: Record<PackEntity, number> }

export interface DesktopApi {
  exportPack(): Promise<PackExportResult | null>
  previewPack(): Promise<PackImportPreview | null>
  importPack(input: PackImportInput): Promise<PackImportResult>
  discardPack(token: string): Promise<void>
  getVersion(): Promise<string>
  getWorkspace(): Promise<WorkspaceState>
  listRegistrationAudit(filter?: RegistrationAuditFilter): Promise<readonly RegistrationAuditEvent[]>
  createOrganization(input: CreateOrganizationInput): Promise<OrganizationSummary>
  renameOrganization(input: RenameOrganizationInput): Promise<OrganizationSummary>
  createCompany(input: CreateCompanyInput): Promise<CompanySummary>
  updateCompany(input: UpdateCompanyRegistrationInput): Promise<CompanySummary>
  inactivateCompany(input: RegistrationMutationInput): Promise<CompanySummary>
  reactivateCompany(input: RegistrationMutationInput): Promise<CompanySummary>
  listFiscalProfiles(companyId: string): Promise<readonly FiscalProfileSummary[]>
  listFiscalProfileSuggestions(companyId: string): Promise<readonly FiscalProfileSuggestion[]>
  createSuggestedFiscalProfile(input: CreateSuggestedFiscalProfileInput): Promise<CreateSuggestedFiscalProfileResult>
  getBuiltinRulePack(): Promise<BuiltinRulePackSummary>
  listVersionedRules(): Promise<readonly VersionedRuleSummary[]>
  createRuleDraft(input: CreateRuleDraftInput): Promise<VersionedRuleSummary>
  updateRuleDraft(input: UpdateRuleDraftInput): Promise<VersionedRuleSummary>
  createRuleVersion(input: RuleVersionMutationInput): Promise<VersionedRuleSummary>
  approveRule(input: RuleVersionMutationInput): Promise<VersionedRuleSummary>
  revokeRule(input: RevokeRuleInput): Promise<VersionedRuleSummary>
  listRuleAudit(versionId: string): Promise<readonly RuleAuditSummary[]>
  createFiscalProfile(input: CreateFiscalProfileInput): Promise<FiscalProfileSummary>
  updateFiscalProfile(input: UpdateFiscalProfileRegistrationInput): Promise<FiscalProfileSummary>
  inactivateFiscalProfile(input: RegistrationMutationInput): Promise<FiscalProfileSummary>
  reactivateFiscalProfile(input: RegistrationMutationInput): Promise<FiscalProfileSummary>
  listSupplierProducts(companyId: string): Promise<readonly SupplierProductSummary[]>
  saveSupplierProduct(input: SaveSupplierProductInput): Promise<SupplierProductSummary>
  updateSupplierProduct(input: UpdateSupplierProductRegistrationInput): Promise<SupplierProductSummary>
  inactivateSupplierProduct(input: RegistrationMutationInput): Promise<SupplierProductSummary>
  reactivateSupplierProduct(input: RegistrationMutationInput): Promise<SupplierProductSummary>
  selectSources(): Promise<SelectedSource[]>
  inspectSources(sources: readonly SelectedSource[], operationId: string): Promise<BatchPreparation>
  createBatch(input: CreateBatchInput): Promise<CreatedBatchSummary>
  cancelBatchOperation(operationId: string): Promise<boolean>
  onBatchProgress(listener: (progress: BatchOperationProgress) => void): () => void
  listBatches(): Promise<readonly BatchListItem[]>
  getBatchDetail(batchId: string, runId?: string): Promise<BatchDetail>
  reassessBatchRules(batchId: string): Promise<RuleAssessmentRunSummary>
}
