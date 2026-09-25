CREATE TABLE execucoes_calculo (
  id TEXT PRIMARY KEY,
  solicitacao_id TEXT NOT NULL,
  lote_id TEXT NOT NULL,
  documento_id TEXT NOT NULL,
  execucao_anterior_id TEXT,
  versao_motor TEXT NOT NULL,
  criado_em TEXT NOT NULL,
  FOREIGN KEY (documento_id, lote_id) REFERENCES documentos_fiscais(id, lote_id) ON DELETE RESTRICT,
  FOREIGN KEY (execucao_anterior_id) REFERENCES execucoes_calculo(id) ON DELETE RESTRICT,
  UNIQUE (solicitacao_id, documento_id),
  UNIQUE (id, documento_id)
) STRICT;

CREATE TABLE resultados_item_calculo (
  execucao_id TEXT NOT NULL,
  documento_id TEXT NOT NULL,
  numero_item TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PENDING_RULE', 'PENDING_DATA', 'UNSUPPORTED', 'CALCULATED')),
  memoria_json TEXT NOT NULL CHECK (json_valid(memoria_json)),
  PRIMARY KEY (execucao_id, numero_item),
  FOREIGN KEY (execucao_id, documento_id) REFERENCES execucoes_calculo(id, documento_id) ON DELETE RESTRICT,
  FOREIGN KEY (documento_id, numero_item) REFERENCES itens_documento(documento_id, numero_item) ON DELETE RESTRICT
) STRICT;

CREATE INDEX idx_execucoes_documento ON execucoes_calculo(documento_id, criado_em DESC, id DESC);

CREATE TRIGGER execucoes_calculo_imutaveis_update BEFORE UPDATE ON execucoes_calculo
BEGIN SELECT RAISE(ABORT, 'Execução de cálculo imutável'); END;
CREATE TRIGGER execucoes_calculo_imutaveis_delete BEFORE DELETE ON execucoes_calculo
BEGIN SELECT RAISE(ABORT, 'Execução de cálculo imutável'); END;
CREATE TRIGGER resultados_item_imutaveis_update BEFORE UPDATE ON resultados_item_calculo
BEGIN SELECT RAISE(ABORT, 'Resultado de cálculo imutável'); END;
CREATE TRIGGER resultados_item_imutaveis_delete BEFORE DELETE ON resultados_item_calculo
BEGIN SELECT RAISE(ABORT, 'Resultado de cálculo imutável'); END;
