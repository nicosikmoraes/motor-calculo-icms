export const IPC_CHANNELS = {
  APP_VERSION: 'app:get-version',
  GET_WORKSPACE: 'workspace:get',
  CREATE_ORGANIZATION: 'workspace:create-organization',
  RENAME_ORGANIZATION: 'workspace:rename-organization',
  CREATE_COMPANY: 'companies:create',
  SELECT_SOURCES: 'batch:select-sources',
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

export interface DesktopApi {
  getVersion(): Promise<string>
  getWorkspace(): Promise<WorkspaceState>
  createOrganization(input: CreateOrganizationInput): Promise<OrganizationSummary>
  renameOrganization(input: RenameOrganizationInput): Promise<OrganizationSummary>
  createCompany(input: CreateCompanyInput): Promise<CompanySummary>
  selectSources(): Promise<SelectedSource[]>
}
