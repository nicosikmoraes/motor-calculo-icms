import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC_CHANNELS,
  type BatchPreparation,
  type BatchOperationProgress,
  type BatchDetail,
  type BatchListItem,
  type CompanySummary,
  type FiscalProfileSummary,
  type SupplierProductSummary,
  type CreatedBatchSummary,
  type DesktopApi,
  type OrganizationSummary,
  type SelectedSource,
  type WorkspaceState,
} from '@motor/contracts'
import { copyCreateBatchInput, copySelectedSources } from './serializable-inputs'

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
  listFiscalProfiles: (companyId) =>
    ipcRenderer.invoke(IPC_CHANNELS.LIST_FISCAL_PROFILES, companyId) as Promise<readonly FiscalProfileSummary[]>,
  createFiscalProfile: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.CREATE_FISCAL_PROFILE, { ...input }) as Promise<FiscalProfileSummary>,
  listSupplierProducts: (companyId) =>
    ipcRenderer.invoke(IPC_CHANNELS.LIST_SUPPLIER_PRODUCTS, companyId) as Promise<readonly SupplierProductSummary[]>,
  saveSupplierProduct: (input) =>
    ipcRenderer.invoke(IPC_CHANNELS.SAVE_SUPPLIER_PRODUCT, { ...input }) as Promise<SupplierProductSummary>,
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
  getBatchDetail: (batchId) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_BATCH_DETAIL, batchId) as Promise<BatchDetail>,
}

contextBridge.exposeInMainWorld('desktopApi', api)
