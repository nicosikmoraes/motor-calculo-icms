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

  save(input: SaveCalculationRunInput): CalculationRunRecord {
    if (!input.requestId.trim() || !input.batchId.trim() || !input.documentId.trim() || !input.engineVersion.trim() || !input.items.length) {
      throw new Error('Execução de cálculo incompleta.')
    }
    if (new Set(input.items.map((item) => item.itemNumber)).size !== input.items.length) {
      throw new Error('Número de item repetido na execução de cálculo.')
    }
    return this.database.transaction(() => {
      const existing = this.findByRequest(input.requestId, input.documentId)
      if (existing) {
        if (existing.batchId !== input.batchId || existing.engineVersion !== input.engineVersion
          || existing.previousRunId !== input.previousRunId
          || JSON.stringify(existing.items) !== JSON.stringify(input.items)) {
          throw new Error('Solicitação de cálculo reutilizada com conteúdo diferente.')
        }
        return existing
      }
      const document = this.database.get<{ id: string }>(
        'SELECT id FROM documentos_fiscais WHERE id = ? AND lote_id = ?', input.documentId, input.batchId,
      )
      if (!document) throw new Error('Documento não pertence ao lote informado.')
      if (input.previousRunId) {
        const previous = this.database.get<{ id: string }>(
          'SELECT id FROM execucoes_calculo WHERE id = ? AND documento_id = ?', input.previousRunId, input.documentId,
        )
        if (!previous) throw new Error('Execução anterior não pertence ao documento.')
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
        if (item.memory.schemaVersion !== 1
          || (item.memory.status === 'CALCULATED' && (!item.memory.result || !item.memory.rule || !item.memory.steps.length))
          || (item.memory.status !== 'CALCULATED' && item.memory.result)) {
          throw new Error('Memória de cálculo inconsistente.')
        }
        this.database.run(
          `INSERT INTO resultados_item_calculo
           (execucao_id, documento_id, numero_item, status, memoria_json) VALUES (?, ?, ?, ?, ?)`,
          record.id, record.documentId, item.itemNumber, item.memory.status, JSON.stringify(item.memory),
        )
      }
      return record
    })
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
