import { randomUUID } from 'node:crypto'
import { AppError, AppErrorCode, RegistrationEntityCode, RegistrationOperationCode } from '@motor/domain'
import type { SqliteDatabase } from './sqlite-database'

export interface RegistrationChange {
  before: string | number | boolean | null
  after: string | number | boolean | null
}

export interface RegistrationAuditEvent {
  id: string
  entity: RegistrationEntityCode
  entityId: string
  operation: RegistrationOperationCode
  revision: number
  changes: Readonly<Record<string, RegistrationChange>>
  computer: string
  systemUser: string
  createdAt: string
}

export interface RegistrationAuditFilter {
  entity?: RegistrationEntityCode
  entityId?: string
  operation?: RegistrationOperationCode
  from?: string
  until?: string
  limit?: number
}

interface AuditRow extends Record<string, unknown> {
  id: string; entidade: RegistrationEntityCode; entidade_id: string
  operacao: RegistrationOperationCode; revisao: number; alteracoes_json: string
  computador: string; usuario_sistema: string; criado_em: string
}

/** Calcula seis meses de calendário em UTC, ajustando o último dia do mês. */
export function auditRetentionCutoff(now: Date): string {
  const year = now.getUTCFullYear()
  const month = now.getUTCMonth() - 6
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const cutoff = new Date(now.getTime())
  cutoff.setUTCFullYear(year, month, Math.min(now.getUTCDate(), lastDay))
  return cutoff.toISOString()
}

/** Eventos são gravados na mesma conexão e transação da alteração cadastral. */
export class SqliteRegistrationAuditRepository {
  constructor(private readonly database: SqliteDatabase) {}

  append(event: Omit<RegistrationAuditEvent, 'id'>): RegistrationAuditEvent {
    const saved = { ...event, id: randomUUID() }
    this.database.run(
      `INSERT INTO eventos_auditoria_cadastro
       (id, entidade, entidade_id, operacao, revisao, alteracoes_json, computador, usuario_sistema, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      saved.id, saved.entity, saved.entityId, saved.operation, saved.revision,
      JSON.stringify(saved.changes), saved.computer, saved.systemUser, saved.createdAt,
    )
    return saved
  }

  /** Remove somente eventos anteriores ao limite, mantendo o instante exato. */
  purgeBefore(exclusiveCutoff: string, executedAt: string): number {
    return this.database.transaction(() => {
      this.database.run('UPDATE auditoria_retencao_controle SET permite_exclusao = 1 WHERE id = 1')
      this.database.run('DELETE FROM eventos_auditoria_cadastro WHERE criado_em < ?', exclusiveCutoff)
      const removed = Number(this.database.get<{ changes: number | bigint }>('SELECT changes() AS changes')?.changes ?? 0)
      this.database.run('UPDATE auditoria_retencao_controle SET permite_exclusao = 0 WHERE id = 1')
      this.database.run(`INSERT INTO auditoria_retencao_execucoes
        (id, executado_em, limite_exclusivo, removidos) VALUES (?, ?, ?, ?)`,
        randomUUID(), executedAt, exclusiveCutoff, removed)
      return removed
    })
  }

  list(filter: RegistrationAuditFilter = {}): readonly RegistrationAuditEvent[] {
    const limit = filter.limit ?? 100
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500) {
      throw new AppError(AppErrorCode.INVALID_IPC_INPUT)
    }
    const where: string[] = []
    const params: (string | number)[] = []
    if (filter.entity) { where.push('entidade = ?'); params.push(filter.entity) }
    if (filter.entityId) { where.push('entidade_id = ?'); params.push(filter.entityId) }
    if (filter.operation) { where.push('operacao = ?'); params.push(filter.operation) }
    if (filter.from) { where.push('criado_em >= ?'); params.push(filter.from) }
    if (filter.until) { where.push('criado_em <= ?'); params.push(filter.until) }
    const rows = this.database.all<AuditRow>(
      `SELECT id, entidade, entidade_id, operacao, revisao, alteracoes_json,
              computador, usuario_sistema, criado_em
       FROM eventos_auditoria_cadastro ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY criado_em DESC, rowid DESC LIMIT ?`, ...params, limit,
    )
    return rows.map((row) => ({
      id: row.id, entity: row.entidade, entityId: row.entidade_id,
      operation: row.operacao, revision: row.revisao,
      changes: JSON.parse(row.alteracoes_json) as Record<string, RegistrationChange>,
      computer: row.computador, systemUser: row.usuario_sistema, createdAt: row.criado_em,
    }))
  }
}
