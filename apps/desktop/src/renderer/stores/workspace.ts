import { defineStore } from 'pinia'
import { ref, shallowRef } from 'vue'
import type {
  CompanySummary, CreateCompanyInput, CreateOrganizationInput, OrganizationSummary,
  RegistrationMutationInput, RenameOrganizationInput, UpdateCompanyRegistrationInput, WorkspaceState,
} from '@motor/contracts'
import { createSnapshotLoader } from '../concerns/ipc/snapshot-loader'

export const useWorkspaceStore = defineStore('workspace', () => {
  const workspace = shallowRef<WorkspaceState>({ companies: [] })
  const workspaceReady = ref(false)
  const loader = createSnapshotLoader(() => window.desktopApi.getWorkspace(), (snapshot) => {
    workspace.value = snapshot
    workspaceReady.value = true
  })

  function setOrganization(organization: OrganizationSummary): void {
    loader.invalidate()
    workspace.value = { ...workspace.value, organization }
    workspaceReady.value = true
  }

  function setCompany(company: CompanySummary): void {
    loader.invalidate()
    const companies = workspace.value.companies
    workspace.value = { ...workspace.value, companies: companies.some(({ id }) => id === company.id)
      ? companies.map((entry) => entry.id === company.id ? company : entry) : [...companies, company] }
  }

  async function createOrganization(input: CreateOrganizationInput): Promise<OrganizationSummary> {
    const organization = await window.desktopApi.createOrganization(input)
    setOrganization(organization)
    return organization
  }

  async function renameOrganization(input: RenameOrganizationInput): Promise<OrganizationSummary> {
    const organization = await window.desktopApi.renameOrganization(input)
    setOrganization(organization)
    return organization
  }

  async function createCompany(input: CreateCompanyInput): Promise<CompanySummary> {
    const company = await window.desktopApi.createCompany(input)
    setCompany(company)
    return company
  }

  async function updateCompany(input: UpdateCompanyRegistrationInput): Promise<CompanySummary> {
    const company = await window.desktopApi.updateCompany(input)
    setCompany(company)
    return company
  }

  async function setCompanyActive(input: RegistrationMutationInput, active: boolean): Promise<CompanySummary> {
    const company = active ? await window.desktopApi.reactivateCompany(input) : await window.desktopApi.inactivateCompany(input)
    setCompany(company)
    return company
  }

  return { workspace, workspaceReady, refreshWorkspace: loader.refresh, createOrganization, renameOrganization,
    createCompany, updateCompany, setCompanyActive }
})
