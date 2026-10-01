import { describe, expect, it } from 'vitest'
import { AppErrorCode } from '@motor/domain'
import { BatchOperationCancelledError, BatchOperationRegistry } from '../src/main/batch-operation'

describe('operação de importação', () => {
  it('publica progresso serializável e cancela apenas pela janela dona', () => {
    const registry = new BatchOperationRegistry()
    const progress: unknown[] = []
    const session = registry.start('job-1', 7, 'PROCESSING', 3, (event) => progress.push(event))
    session.report('PROCESSING', 1, 3, 'nota.xml')
    expect(() => registry.start('job-2', 7, 'INSPECTING', 1, () => {}))
      .toThrowError(expect.objectContaining({ code: AppErrorCode.IMPORT_OPERATION_BUSY }))

    expect(registry.cancel('job-1', 8)).toBe(false)
    expect(session.cancelled).toBe(false)
    expect(registry.cancel('job-1', 7)).toBe(true)
    expect(session.cancelled).toBe(true)
    expect(() => session.throwIfCancelled()).toThrow(BatchOperationCancelledError)
    expect(progress).toEqual([
      { operationId: 'job-1', phase: 'PROCESSING', completed: 0, total: 3 },
      { operationId: 'job-1', phase: 'PROCESSING', completed: 1, total: 3, currentSource: 'nota.xml' },
      { operationId: 'job-1', phase: 'CANCELLING', completed: 1, total: 3 },
    ])
    expect(() => structuredClone(progress)).not.toThrow()
    registry.finish('job-1')
    expect(registry.cancel('job-1', 7)).toBe(false)
    const next = registry.start('job-2', 7, 'INSPECTING', 1, () => {})
    expect(next.operationId).toBe('job-2')
    registry.finish('job-2')
  })
})
