export const IPC_CHANNELS = {
  APP_VERSION: 'app:get-version',
  GET_WORKSPACE: 'workspace:get',
  CREATE_ORGANIZATION: 'workspace:create-organization',
  RENAME_ORGANIZATION: 'workspace:rename-organization',
  CREATE_COMPANY: 'companies:create',
  SELECT_SOURCES: 'batch:select-sources',
  INSPECT_SOURCES: 'batch:inspect-sources',
  CREATE_BATCH: 'batch:create',
  LIST_BATCHES: 'batch:list',
  GET_BATCH_DETAIL: 'batch:get-detail',
} as const

export interface OrganizationSummary {
  id: string
  name: string
}

export interface CompanySummary {
  id: string
  legalName: string
  tradeName?: string
  cnpj: string
  state: string
  active: boolean
}

export interface WorkspaceState {
  organization?: OrganizationSummary
  companies: readonly CompanySummary[]
}

export interface CreateOrganizationInput {
  name: string
}

export interface RenameOrganizationInput {
  name: string
}

export interface CreateCompanyInput {
  legalName: string
  tradeName?: string
  cnpj: string
  state: string
}

export type SourceKind = 'XML' | 'ZIP'

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
  candidates: readonly BatchCompanyCandidate[]
  issues: readonly BatchSourceIssue[]
  inspectedXmlCount: number
  environmentCodes: readonly ('1' | '2')[]
}

export interface CreateBatchInput {
  companyId: string
  environmentCode: '1' | '2'
  sources: readonly SelectedSource[]
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

export interface FiscalItemSummary {
  itemNumber: string
  supplierProductCode?: string
  description?: string
  ncm?: string
  cfop?: string
  productAmount?: string
  declaredIcmsAmount?: string
}

export interface FiscalDocumentSummary {
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

export interface BatchDetail {
  batch: BatchListItem
  occurrences: readonly BatchOccurrenceSummary[]
  diagnostics: readonly BatchDiagnosticSummary[]
  documents: readonly FiscalDocumentSummary[]
}

export interface DesktopApi {
  getVersion(): Promise<string>
  getWorkspace(): Promise<WorkspaceState>
  createOrganization(input: CreateOrganizationInput): Promise<OrganizationSummary>
  renameOrganization(input: RenameOrganizationInput): Promise<OrganizationSummary>
  createCompany(input: CreateCompanyInput): Promise<CompanySummary>
  selectSources(): Promise<SelectedSource[]>
  inspectSources(sources: readonly SelectedSource[]): Promise<BatchPreparation>
  createBatch(input: CreateBatchInput): Promise<CreatedBatchSummary>
  listBatches(): Promise<readonly BatchListItem[]>
  getBatchDetail(batchId: string): Promise<BatchDetail>
}
