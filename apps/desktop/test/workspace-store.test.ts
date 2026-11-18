import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { CompanySummary, WorkspaceState } from '@motor/contracts'
import { useWorkspaceStore } from '../src/renderer/stores/workspace'

const company: CompanySummary = {
  id: 'company-1', legalName: 'Empresa', cnpj: '11222333000181', state: 'PR', active: true, revision: 1,
}
const workspace: WorkspaceState = {
  organization: { id: 'office-1', name: 'Escritório', revision: 1 }, companies: [],
}
const api = { getWorkspace: vi.fn<() => Promise<WorkspaceState>>(), createCompany: vi.fn() }

beforeEach(() => {
  setActivePinia(createPinia())
  vi.resetAllMocks()
  vi.stubGlobal('window', { desktopApi: api })
})
afterEach(() => vi.unstubAllGlobals())

it('usa uma leitura IPC para duas telas que pedem os cadastros ao mesmo tempo', async () => {
  api.getWorkspace.mockResolvedValueOnce(workspace)
  const dashboardStore = useWorkspaceStore()
  const companiesStore = useWorkspaceStore()

  await Promise.all([dashboardStore.refreshWorkspace(), companiesStore.refreshWorkspace()])

  expect(api.getWorkspace).toHaveBeenCalledTimes(1)
  expect(companiesStore.workspace).toEqual(workspace)
  expect(dashboardStore.workspaceReady).toBe(true)
})

it('mantém a empresa criada quando uma leitura anterior chega depois do cadastro', async () => {
  api.getWorkspace.mockResolvedValueOnce(workspace)
  const store = useWorkspaceStore()
  await store.refreshWorkspace()

  let resolveOldWorkspace!: (value: WorkspaceState) => void
  api.getWorkspace.mockReturnValueOnce(new Promise((resolve) => { resolveOldWorkspace = resolve }))
  const oldRefresh = store.refreshWorkspace()
  api.createCompany.mockResolvedValueOnce(company)
  await store.createCompany({ legalName: company.legalName, cnpj: company.cnpj, state: company.state })
  resolveOldWorkspace(workspace)
  await oldRefresh

  expect(useWorkspaceStore().workspace.companies).toEqual([company])
})
