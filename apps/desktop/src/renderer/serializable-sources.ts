import type { SelectedSource } from '@motor/contracts'

/** ContextBridge clona argumentos antes de executar o preload. */
export function serializableSources(sources: readonly SelectedSource[]): SelectedSource[] {
  return sources.map(({ path, kind }) => ({ path, kind }))
}
