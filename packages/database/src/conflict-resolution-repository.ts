import type { ConflictResolutionAudit } from '@motor/contracts'
import type { SqliteDatabase } from './sqlite-database'
export interface ConflictResolutionRecord extends ConflictResolutionAudit {
  organizationId: string; accessKey: string; environmentCode: string; requestId: string
  versionsSnapshot: string; snapshot: string
}
export class SqliteConflictResolutionRepository {
  constructor(private readonly database: SqliteDatabase) {}
  listByOrganization(organizationId: string): readonly ConflictResolutionRecord[] {
    return this.database.all<{ id: string; organizacao_id: string; chave_acesso: string; ambiente: string;
      documento_id: string; request_id: string; revisao: number; acao: 'SELECT' | 'REOPEN'; motivo: string;
      versoes_snapshot: string; snapshot: string; computador: string; usuario_sistema: string; criado_em: string }>(
      'SELECT * FROM resolucoes_conflitos WHERE organizacao_id = ? ORDER BY revisao DESC, id', organizationId,
    ).map(r => ({ id: r.id, organizationId: r.organizacao_id, accessKey: r.chave_acesso, environmentCode: r.ambiente,
      documentId: r.documento_id, requestId: r.request_id, revision: r.revisao, action: r.acao, reason: r.motivo,
      versionsSnapshot: r.versoes_snapshot, snapshot: r.snapshot, computer: r.computador, systemUser: r.usuario_sistema, createdAt: r.criado_em }))
  }
  insert(r: ConflictResolutionRecord): void {
    this.database.run(`INSERT INTO resolucoes_conflitos
      (id, organizacao_id, chave_acesso, ambiente, documento_id, request_id, revisao, acao, motivo,
       versoes_snapshot, snapshot, computador, usuario_sistema, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    r.id, r.organizationId, r.accessKey, r.environmentCode, r.documentId, r.requestId, r.revision, r.action, r.reason,
    r.versionsSnapshot, r.snapshot, r.computer, r.systemUser, r.createdAt)
  }
}
