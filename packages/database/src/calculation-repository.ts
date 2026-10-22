import { AppError, AppErrorCode } from '@motor/domain'
import { CalculationStatusCode } from '@motor/tax-engine'
import { randomUUID } from 'node:crypto'
import type { CalculationMemory } from '@motor/tax-engine'
import type { SqliteDatabase } from './sqlite-database'

export interface CalculationRunRecord {
  id: string
  requestId: string
  batchId: string
  documentId: string
  previousRunId?: string
  engineVersion: string
  createdAt: string
  items: readonly { itemNumber: string; memory: CalculationMemory }[]
}

export interface SaveCalculationRunInput {
  requestId: string
  batchId: string
  documentId: string
  previousRunId?: string
  engineVersion: string
  items: readonly { itemNumber: string; memory: CalculationMemory }[]
}

export class SqliteCalculationRepository {
  constructor(private readonly database: SqliteDatabase) {}

  save(input: SaveCalculationRunInput, additionalWrite?: (record: CalculationRunRecord) => void): CalculationRunRecord {
    return this.database.transaction(() => this.saveInTransaction(input, additionalWrite))
  }

  /** Uma confirmação do lote grava todas as notas ou nenhuma. */
  saveMany(inputs: readonly SaveCalculationRunInput[]): readonly CalculationRunRecord[] {
    return this.database.transaction(() => inputs.map(input => this.saveInTransaction(input)))
  }

  private saveInTransaction(input: SaveCalculationRunInput, additionalWrite?: (record: CalculationRunRecord) => void): CalculationRunRecord {
    if (!input.requestId.trim() || !input.batchId.trim() || !input.documentId.trim() || !input.engineVersion.trim() || !input.items.length) {
      throw new AppError(AppErrorCode.CALCULATION_RUN_INCOMPLETE)
    }
    if (new Set(input.items.map((item) => item.itemNumber)).size !== input.items.length) {
      throw new AppError(AppErrorCode.DUPLICATE_CALCULATION_ITEM)
    }
      const existing = this.findByRequest(input.requestId, input.documentId)
      if (existing) {
        if (existing.batchId !== input.batchId || existing.engineVersion !== input.engineVersion
          || existing.previousRunId !== input.previousRunId
          || JSON.stringify(existing.items) !== JSON.stringify(input.items)) {
          throw new AppError(AppErrorCode.CALCULATION_REQUEST_CONFLICT)
        }
        return existing
      }
      const document = this.database.get<{ id: string }>(
        'SELECT id FROM documentos_fiscais WHERE id = ? AND lote_id = ?', input.documentId, input.batchId,
      )
      if (!document) throw new AppError(AppErrorCode.CALCULATION_DOCUMENT_MISMATCH)
      if (input.previousRunId) {
        const previous = this.database.get<{ id: string }>(
          'SELECT id FROM execucoes_calculo WHERE id = ? AND documento_id = ?', input.previousRunId, input.documentId,
        )
        if (!previous) throw new AppError(AppErrorCode.CALCULATION_PREVIOUS_RUN_MISMATCH)
      }
      const record: CalculationRunRecord = {
        id: randomUUID(), requestId: input.requestId, batchId: input.batchId,
        documentId: input.documentId, engineVersion: input.engineVersion,
        createdAt: new Date().toISOString(),
        ...(input.previousRunId ? { previousRunId: input.previousRunId } : {}),
        items: input.items.map(({ itemNumber, memory }) => ({ itemNumber, memory })),
      }
      this.database.run(
        `INSERT INTO execucoes_calculo
         (id, solicitacao_id, lote_id, documento_id, execucao_anterior_id, versao_motor, criado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        record.id, record.requestId, record.batchId, record.documentId,
        record.previousRunId ?? null, record.engineVersion, record.createdAt,
      )
      for (const item of record.items) {
        const components = [item.memory, ...(item.memory.additionalComponents ?? [])]
        const kinds = components.map(memory => memory.component ?? memory.result?.component ?? 'ICMS')
        if (new Set(kinds).size !== kinds.length || (item.memory.additionalComponents?.length && kinds[0] !== 'ICMS_ST')) {
          throw new AppError(AppErrorCode.CALCULATION_MEMORY_INCONSISTENT)
        }
        for (const [index, memory] of components.entries()) {
          if (memory.schemaVersion !== 1 || !(Object.values(CalculationStatusCode) as readonly string[]).includes(memory.status)
            || !['ICMS', 'ICMS_ST', 'FCP_ST', 'ICMS_ENTRY'].includes(kinds[index]!)
            || (index > 0 && (kinds[index] !== 'FCP_ST' || 'additionalComponents' in memory))
            || (index > 0 && memory.status === CalculationStatusCode.CALCULATED
              && (item.memory.status !== CalculationStatusCode.CALCULATED || memory.result?.base !== item.memory.result?.base))
            || (memory.component && memory.result && memory.component !== memory.result.component)
            || (memory.status === CalculationStatusCode.CALCULATED && (!memory.result || !memory.rule || !memory.steps.length))
            || (memory.status !== CalculationStatusCode.CALCULATED && memory.result)) {
            throw new AppError(AppErrorCode.CALCULATION_MEMORY_INCONSISTENT)
          }
        }
        this.database.run(
          `INSERT INTO resultados_item_calculo
           (execucao_id, documento_id, numero_item, status, memoria_json) VALUES (?, ?, ?, ?, ?)`,
          record.id, record.documentId, item.itemNumber, item.memory.status, JSON.stringify(item.memory),
        )
      }
      additionalWrite?.(record)
      return record
  }

  findByRequest(requestId: string, documentId: string): CalculationRunRecord | undefined {
    const row = this.database.get<{
      id: string; solicitacao_id: string; lote_id: string; documento_id: string;
      execucao_anterior_id: string | null; versao_motor: string; criado_em: string
    }>(`SELECT id, solicitacao_id, lote_id, documento_id, execucao_anterior_id, versao_motor, criado_em
        FROM execucoes_calculo WHERE solicitacao_id = ? AND documento_id = ?`, requestId, documentId)
    if (!row) return undefined
    const items = this.database.all<{ numero_item: string; memoria_json: string }>(
      'SELECT numero_item, memoria_json FROM resultados_item_calculo WHERE execucao_id = ? ORDER BY numero_item', row.id,
    )
    return {
      id: row.id, requestId: row.solicitacao_id, batchId: row.lote_id,
      documentId: row.documento_id, engineVersion: row.versao_motor, createdAt: row.criado_em,
      ...(row.execucao_anterior_id ? { previousRunId: row.execucao_anterior_id } : {}),
      items: items.map((item) => ({ itemNumber: item.numero_item, memory: JSON.parse(item.memoria_json) as CalculationMemory })),
    }
  }

  latestByDocument(documentId: string): CalculationRunRecord | undefined {
    const row = this.database.get<{ solicitacao_id: string }>(
      `SELECT solicitacao_id FROM execucoes_calculo WHERE documento_id = ?
       ORDER BY criado_em DESC, rowid DESC LIMIT 1`, documentId,
    )
    return row ? this.findByRequest(row.solicitacao_id, documentId) : undefined
  }
}
