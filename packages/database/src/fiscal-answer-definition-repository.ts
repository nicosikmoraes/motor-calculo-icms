import type { SqliteDatabase } from './sqlite-database'

export interface FiscalAnswerDefinitionKey { companyId: string; supplierCnpj: string; productCode: string }
export interface FiscalAnswerDefinition extends FiscalAnswerDefinitionKey {
  id: string
  contextJson: string
  answersJson: string
  sourceRunId: string
  sourceReceivedAt: string
  sourceOperationDate: string
  createdAt: string
}

export class SqliteFiscalAnswerDefinitionRepository {
  constructor(private readonly database: SqliteDatabase) {}

  latest(key: FiscalAnswerDefinitionKey): FiscalAnswerDefinition | undefined {
    return this.database.get<FiscalAnswerDefinition & Record<string, unknown>>(
      `SELECT id, empresa_id AS companyId, fornecedor_cnpj AS supplierCnpj,
       codigo_produto AS productCode, contexto_json AS contextJson, respostas_json AS answersJson,
       execucao_origem_id AS sourceRunId, recebido_origem_em AS sourceReceivedAt,
       data_operacao_origem AS sourceOperationDate, criado_em AS createdAt
       FROM definicoes_respostas_fiscais WHERE empresa_id = ? AND fornecedor_cnpj = ? AND codigo_produto = ?
       ORDER BY criado_em DESC, rowid DESC LIMIT 1`, key.companyId, key.supplierCnpj, key.productCode)
  }

  /** Executado na mesma transação que grava a memória de origem. */
  append(definition: FiscalAnswerDefinition): void {
    this.database.run(`INSERT INTO definicoes_respostas_fiscais
      (id, empresa_id, fornecedor_cnpj, codigo_produto, contexto_json, respostas_json,
       execucao_origem_id, recebido_origem_em, data_operacao_origem, criado_em)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, definition.id, definition.companyId, definition.supplierCnpj,
    definition.productCode, definition.contextJson, definition.answersJson, definition.sourceRunId,
    definition.sourceReceivedAt, definition.sourceOperationDate, definition.createdAt)
  }
}
