import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC_CHANNELS,
  type BatchPreparation,
  type BatchDetail,
  type BatchListItem,
  type CompanySummary,
  type CreatedBatchSummary,
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
  inspectSources: (sources) =>
    ipcRenderer.invoke(IPC_CHANNELS.INSPECT_SOURCES, sources) as Promise<BatchPreparation>,
  createBatch: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.CREATE_BATCH, input) as Promise<CreatedBatchSummary>,
  listBatches: () =>
    ipcRenderer.invoke(IPC_CHANNELS.LIST_BATCHES) as Promise<readonly BatchListItem[]>,
  getBatchDetail: (batchId) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_BATCH_DETAIL, batchId) as Promise<BatchDetail>,
}

contextBridge.exposeInMainWorld('desktopApi', api)
