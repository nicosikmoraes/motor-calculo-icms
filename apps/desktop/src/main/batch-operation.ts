import { AppError, AppErrorCode, AppErrorMessage } from '@motor/domain'
import type { BatchOperationProgress } from '@motor/contracts'

export class BatchOperationCancelledError extends Error {
  readonly code: AppErrorCode
  constructor() {
    super(AppErrorMessage.IMPORT_CANCELLED)
    this.code = AppErrorCode.IMPORT_CANCELLED
    this.name = 'BatchOperationCancelledError'
  }
}

export interface BatchOperationSession {
  readonly operationId: string
  readonly ownerId: number
  readonly signal: AbortSignal
  readonly cancelled: boolean
  readonly completed: number
  readonly total: number
  report(phase: BatchOperationProgress['phase'], completed: number, total: number, currentSource?: string): void
  throwIfCancelled(): void
}

export class BatchOperationRegistry {
  private readonly sessions = new Map<string, BatchOperationSession>()

  start(
    operationId: string,
    ownerId: number,
    phase: BatchOperationProgress['phase'],
    total: number,
    send: (progress: BatchOperationProgress) => void,
  ): BatchOperationSession {
    if (!operationId || this.sessions.has(operationId)) throw new AppError(AppErrorCode.INVALID_OPERATION)
    // Uma única operação ativa impede que importações concorrentes disputem memória e banco.
    if (this.sessions.size > 0) throw new AppError(AppErrorCode.IMPORT_OPERATION_BUSY)
    const controller = new AbortController()
    let completed = 0
    let expected = Math.max(0, total)
    const session: BatchOperationSession = {
      operationId,
      ownerId,
      get signal() { return controller.signal },
      get cancelled() { return controller.signal.aborted },
      get completed() { return completed },
      get total() { return expected },
      report(nextPhase, nextCompleted, nextTotal, currentSource) {
        completed = Math.max(0, nextCompleted)
        expected = Math.max(completed, nextTotal)
        send({
          operationId,
          phase: nextPhase,
          completed,
          total: expected,
          ...(currentSource ? { currentSource } : {}),
        })
      },
      throwIfCancelled() {
        if (controller.signal.aborted) throw new BatchOperationCancelledError()
      },
    }
    this.sessions.set(operationId, session)
    this.controllers.set(operationId, controller)
    session.report(phase, 0, total)
    return session
  }

  cancel(operationId: string, ownerId: number): boolean {
    const session = this.sessions.get(operationId)
    if (!session || session.ownerId !== ownerId) return false
    if (!session.cancelled) {
      const completed = session.completed
      const total = session.total
      this.controllers.get(operationId)?.abort()
      session.report('CANCELLING', completed, total)
    }
    return true
  }

  finish(operationId: string): void {
    this.sessions.delete(operationId)
    this.controllers.delete(operationId)
  }

  private readonly controllers = new Map<string, AbortController>()
}
