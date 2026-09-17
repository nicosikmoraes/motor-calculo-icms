/// <reference types="vite/client" />

import type { DesktopApi } from '@motor/contracts'

declare global {
  interface Window {
    desktopApi: DesktopApi
  }
}

export {}
