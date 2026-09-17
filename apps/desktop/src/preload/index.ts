import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type DesktopApi, type SelectedSource } from '@motor/contracts'

const api: DesktopApi = {
  getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.APP_VERSION) as Promise<string>,
  selectSources: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SELECT_SOURCES) as Promise<SelectedSource[]>,
}

contextBridge.exposeInMainWorld('desktopApi', api)
