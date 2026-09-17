export const IPC_CHANNELS = {
  APP_VERSION: 'app:get-version',
  SELECT_SOURCES: 'batch:select-sources',
} as const

export type SourceKind = 'XML' | 'ZIP'

export interface SelectedSource {
  path: string
  kind: SourceKind
}

export interface DesktopApi {
  getVersion(): Promise<string>
  selectSources(): Promise<SelectedSource[]>
}
