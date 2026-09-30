import { randomUUID } from 'node:crypto'
import type { SqliteDatabase } from './sqlite-database'

export type PersistedRuleStatus = 'DRAFT' | 'APPROVED' | 'REVOKED'
export interface VersionedRuleRecord {
  id: string
  familyId: string
  organizationId: string
  version: number
  revision: number
  status: PersistedRuleStatus
  name: string
  level: string
  priority: number
  priorityReason?: string
  validFrom: string
  validUntil?: string
  legalBasis?: string
  conditions: Readonly<Record<string, string>>
  createdAt: string
  updatedAt: string
  approvedAt?: string
  approvedBy?: string
  revokedAt?: string
  revokedBy?: string
  revocationReason?: string
}
export interface RuleAuditEvent {
  id: string
  versionId: string
  operation: 'CREATE_DRAFT' | 'UPDATE_DRAFT' | 'NEW_VERSION' | 'APPROVE' | 'REVOKE'
  revision: number
  changes: Readonly<Record<string, { before: string | number | null; after: string | number | null }>>
  computer: string
  systemUser: string
  createdAt: string
}

type RuleRow = {
  id: string; familia_id: string; organizacao_id: string; numero: number; revisao: number
  estado: 'DRAFT' | 'APPROVED'; nome: string; nivel: string; prioridade: number; justificativa_prioridade: string | null
  vigente_de: string; vigente_ate: string | null; fundamento_legal: string | null
  condicoes_json: string; criado_em: string; atualizado_em: string
  aprovado_em: string | null; aprovado_por: string | null
  revogado_em: string | null; revogado_por: string | null; motivo: string | null
}
const RULE_SELECT = `SELECT v.id, v.familia_id, f.organizacao_id, v.numero, v.revisao, v.estado,
 v.nome, v.nivel, v.prioridade, v.justificativa_prioridade, v.vigente_de, v.vigente_ate, v.fundamento_legal,
 v.condicoes_json, v.criado_em, v.atualizado_em, v.aprovado_em, v.aprovado_por,
 r.revogado_em, r.revogado_por, r.motivo
 FROM versoes_regras_fiscais v
 JOIN familias_regras_fiscais f ON f.id = v.familia_id
 LEFT JOIN revogacoes_regras_fiscais r ON r.versao_id = v.id`

function mapRule(row: RuleRow): VersionedRuleRecord {
  return {
    id: row.id, familyId: row.familia_id, organizationId: row.organizacao_id,
    version: row.numero, revision: row.revisao,
    status: row.revogado_em ? 'REVOKED' : row.estado,
    name: row.nome, level: row.nivel, priority: row.prioridade,
    ...(row.justificativa_prioridade ? { priorityReason: row.justificativa_prioridade } : {}),
    validFrom: row.vigente_de, ...(row.vigente_ate ? { validUntil: row.vigente_ate } : {}),
    ...(row.fundamento_legal ? { legalBasis: row.fundamento_legal } : {}),
    conditions: JSON.parse(row.condicoes_json) as Record<string, string>,
    createdAt: row.criado_em, updatedAt: row.atualizado_em,
    ...(row.aprovado_em ? { approvedAt: row.aprovado_em } : {}),
    ...(row.aprovado_por ? { approvedBy: row.aprovado_por } : {}),
    ...(row.revogado_em ? { revokedAt: row.revogado_em } : {}),
    ...(row.revogado_por ? { revokedBy: row.revogado_por } : {}),
    ...(row.motivo ? { revocationReason: row.motivo } : {}),
  }
}

/** Persiste versões sem permitir edição de uma versão aprovada ou revogada. */
export class SqliteVersionedRuleRepository {
  constructor(private readonly database: SqliteDatabase) {}

  createFamily(id: string, organizationId: string, createdAt: string): void {
    this.database.run('INSERT INTO familias_regras_fiscais (id, organizacao_id, criado_em) VALUES (?, ?, ?)',
      id, organizationId, createdAt)
  }

  insertDraft(input: {
    id: string; familyId: string; version: number; name: string; level: string; priority: number; priorityReason?: string
    validFrom: string; validUntil?: string; legalBasis?: string
    conditions: Readonly<Record<string, string>>; timestamp: string
  }): void {
    this.database.run(`INSERT INTO versoes_regras_fiscais
      (id, familia_id, numero, estado, nome, nivel, prioridade, justificativa_prioridade, vigente_de, vigente_ate,
       fundamento_legal, condicoes_json, criado_em, atualizado_em)
      VALUES (?, ?, ?, 'DRAFT', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.id, input.familyId, input.version, input.name, input.level, input.priority, input.priorityReason ?? null,
    input.validFrom, input.validUntil ?? null, input.legalBasis ?? null,
    JSON.stringify(input.conditions), input.timestamp, input.timestamp)
  }

  get(id: string): VersionedRuleRecord | undefined {
    const row = this.database.get<RuleRow>(`${RULE_SELECT} WHERE v.id = ?`, id)
    return row ? mapRule(row) : undefined
  }

  list(organizationId: string): readonly VersionedRuleRecord[] {
    return this.database.all<RuleRow>(`${RULE_SELECT} WHERE f.organizacao_id = ?
      ORDER BY f.criado_em DESC, v.numero DESC`, organizationId).map(mapRule)
  }

  listFamily(familyId: string): readonly VersionedRuleRecord[] {
    return this.database.all<RuleRow>(`${RULE_SELECT} WHERE v.familia_id = ?
      ORDER BY v.numero DESC`, familyId).map(mapRule)
  }

  updateDraft(id: string, revision: number, values: {
    name: string; level: string; priority: number; priorityReason?: string; validFrom: string; validUntil?: string
    legalBasis?: string; conditions: Readonly<Record<string, string>>; updatedAt: string
  }): boolean {
    this.database.run(`UPDATE versoes_regras_fiscais SET nome = ?, nivel = ?, prioridade = ?, justificativa_prioridade = ?,
      vigente_de = ?, vigente_ate = ?, fundamento_legal = ?, condicoes_json = ?,
      atualizado_em = ?, revisao = revisao + 1
      WHERE id = ? AND revisao = ? AND estado = 'DRAFT'`,
    values.name, values.level, values.priority, values.priorityReason ?? null, values.validFrom, values.validUntil ?? null,
    values.legalBasis ?? null, JSON.stringify(values.conditions), values.updatedAt, id, revision)
    return this.changed()
  }

  approve(id: string, revision: number, approvedAt: string, approvedBy: string): boolean {
    this.database.run(`UPDATE versoes_regras_fiscais SET estado = 'APPROVED',
      aprovado_em = ?, aprovado_por = ?, atualizado_em = ?, revisao = revisao + 1
      WHERE id = ? AND revisao = ? AND estado = 'DRAFT'`,
    approvedAt, approvedBy, approvedAt, id, revision)
    return this.changed()
  }

  revoke(id: string, reason: string, revokedAt: string, revokedBy: string): void {
    this.database.run(`INSERT INTO revogacoes_regras_fiscais
      (versao_id, motivo, revogado_em, revogado_por) VALUES (?, ?, ?, ?)`,
    id, reason, revokedAt, revokedBy)
  }

  appendEvent(input: Omit<RuleAuditEvent, 'id'>): RuleAuditEvent {
    const event = { ...input, id: randomUUID() }
    this.database.run(`INSERT INTO eventos_auditoria_regras
      (id, versao_id, operacao, revisao, alteracoes_json, computador, usuario_sistema, criado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, event.id, event.versionId, event.operation,
    event.revision, JSON.stringify(event.changes), event.computer, event.systemUser, event.createdAt)
    return event
  }

  listEvents(versionId: string): readonly RuleAuditEvent[] {
    return this.database.all<{
      id: string; versao_id: string; operacao: RuleAuditEvent['operation']; revisao: number
      alteracoes_json: string; computador: string; usuario_sistema: string; criado_em: string
    }>(`SELECT * FROM eventos_auditoria_regras WHERE versao_id = ?
      ORDER BY criado_em DESC, rowid DESC`, versionId).map((row) => ({
      id: row.id, versionId: row.versao_id, operation: row.operacao, revision: row.revisao,
      changes: JSON.parse(row.alteracoes_json) as RuleAuditEvent['changes'],
      computer: row.computador, systemUser: row.usuario_sistema, createdAt: row.criado_em,
    }))
  }

  private changed(): boolean {
    return Number(this.database.get<{ changes: number | bigint }>('SELECT changes() AS changes')?.changes ?? 0) === 1
  }
}
