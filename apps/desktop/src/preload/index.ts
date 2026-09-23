import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC_CHANNELS,
  type CompanySummary,
  type DesktopApi,
  type OrganizationSummary,
  type SelectedSource,
  type WorkspaceState,
} from '@motor/contracts'

const api: DesktopApi = {
  getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.APP_VERSION) as Promise<string>,
  getWorkspace: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_WORKSPACE) as Promise<WorkspaceState>,
  createOrganization: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.CREATE_ORGANIZATION, input) as Promise<OrganizationSummary>,
  renameOrganization: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.RENAME_ORGANIZATION, input) as Promise<OrganizationSummary>,
  createCompany: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.CREATE_COMPANY, input) as Promise<CompanySummary>,
  selectSources: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SELECT_SOURCES) as Promise<SelectedSource[]>,
}

contextBridge.exposeInMainWorld('desktopApi', api)
