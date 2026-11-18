import type { SelectedSource } from '@motor/contracts'
import { AppError, AppErrorCode } from '@motor/domain'
import { inputRecord, requiredInputText } from '../../validation/input'

const approvedSourcePaths = new Set<string>()

export function approveSelectedSources(sources: readonly SelectedSource[]): void {
  approvedSourcePaths.clear()
  for (const source of sources) approvedSourcePaths.add(source.path)
}

/** Aceita somente os caminhos liberados pelo seletor nativo de arquivos. */
export function validatedSources(rawSources: unknown): SelectedSource[] {
  if (!Array.isArray(rawSources)) throw new AppError(AppErrorCode.INVALID_SOURCE_LIST)
  return rawSources.map((value): SelectedSource => {
    const source = inputRecord(value)
    const path = requiredInputText(source.path, 'Caminho do arquivo')
    const kind = source.kind
    if (kind !== 'XML' && kind !== 'ZIP') throw new AppError(AppErrorCode.INVALID_SOURCE_KIND)
    if (!approvedSourcePaths.has(path)) throw new AppError(AppErrorCode.SOURCE_NOT_APPROVED)
    return { path, kind }
  })
}
