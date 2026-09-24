import type { CreateBatchInput, SelectedSource } from '@motor/contracts'

export function copySelectedSources(
  sources: readonly SelectedSource[],
): SelectedSource[] {
  return sources.map(({ path, kind }) => ({ path, kind }))
}

export function copyCreateBatchInput(input: CreateBatchInput): CreateBatchInput {
  return {
    operationId: input.operationId,
    totalEntries: input.totalEntries,
    assignments: input.assignments.map(({ source, companyId }) => ({ source, companyId })),
    environmentCode: input.environmentCode,
    sources: copySelectedSources(input.sources),
  }
}
