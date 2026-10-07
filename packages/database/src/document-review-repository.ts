import type { DocumentReviewAudit } from '@motor/contracts'
import type { SqliteDatabase } from './sqlite-database'

export interface DocumentReviewRecord extends DocumentReviewAudit {
  artifactId: string
  documentId: string
  requestId: string
  snapshot: string
}

export class SqliteDocumentReviewRepository {
  constructor(private readonly database: SqliteDatabase) {}

  listByOrganization(organizationId: string): readonly DocumentReviewRecord[] {
    return this.database.all<{ id: string; request_id: string; artefato_id: string; documento_id: string;
      revisao: number; acao: DocumentReviewAudit['action']; motivo: string; snapshot: string;
      computador: string; usuario_sistema: string; criado_em: string }>(
      `SELECT r.* FROM revisoes_documentais r JOIN artefatos_documentais a ON a.id = r.artefato_id
       JOIN lotes l ON l.id = a.lote_id WHERE l.organizacao_id = ? ORDER BY r.revisao DESC, r.id`, organizationId,
    ).map(r => ({ id: r.id, requestId: r.request_id, artifactId: r.artefato_id, documentId: r.documento_id,
      revision: r.revisao, action: r.acao, reason: r.motivo, snapshot: r.snapshot,
      computer: r.computador, systemUser: r.usuario_sistema, createdAt: r.criado_em }))
  }

  insert(record: DocumentReviewRecord): void {
    this.database.run(`INSERT INTO revisoes_documentais
      (id, request_id, artefato_id, documento_id, revisao, acao, motivo, snapshot, computador, usuario_sistema, criado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, record.id, record.requestId, record.artifactId,
    record.documentId, record.revision, record.action, record.reason, record.snapshot,
    record.computer, record.systemUser, record.createdAt)
  }
}
