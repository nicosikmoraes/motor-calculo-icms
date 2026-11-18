import { join } from 'node:path'
import { BrowserWindow } from 'electron'

export function createWindowManager(runtimeDirectory: string, icon: string) {
  let currentWindow: BrowserWindow | undefined

  function open(): void {
    if (currentWindow && !currentWindow.isDestroyed()) {
      currentWindow.show()
      currentWindow.focus()
      return
    }

    const window = new BrowserWindow({
      icon, width: 1280, height: 800, minWidth: 960, minHeight: 640,
      show: true, backgroundColor: '#f4f1e8',
      webPreferences: {
        preload: join(runtimeDirectory, '../preload/index.cjs'),
        contextIsolation: true, nodeIntegration: false, sandbox: true,
      },
    })
    currentWindow = window
    window.on('closed', () => {
      if (currentWindow === window) currentWindow = undefined
    })

    if (process.env.ELECTRON_RENDERER_URL) void window.loadURL(process.env.ELECTRON_RENDERER_URL)
    else void window.loadFile(join(runtimeDirectory, '../renderer/index.html'))
  }

  return { open, current: () => currentWindow }
}
