CREATE TABLE execucoes_avaliacao_regras (
  id TEXT PRIMARY KEY,
  lote_id TEXT NOT NULL,
  numero_execucao INTEGER NOT NULL CHECK (numero_execucao > 0),
  pacote_id TEXT NOT NULL CHECK (length(trim(pacote_id)) > 0),
  pacote_versao INTEGER NOT NULL CHECK (pacote_versao > 0),
  avaliada_em TEXT NOT NULL CHECK (avaliada_em GLOB '????-??-??T??:??:??.???Z'),
  FOREIGN KEY (lote_id) REFERENCES lotes(id) ON DELETE RESTRICT,
  UNIQUE (lote_id, numero_execucao),
  UNIQUE (id, lote_id)
) STRICT;

CREATE TABLE avaliacoes_regras_itens (
  execucao_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  avaliacao_json TEXT NOT NULL CHECK (json_valid(avaliacao_json)),
  PRIMARY KEY (execucao_id, item_id),
  FOREIGN KEY (execucao_id) REFERENCES execucoes_avaliacao_regras(id) ON DELETE RESTRICT,
  FOREIGN KEY (item_id) REFERENCES itens_documento(id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX idx_execucoes_avaliacao_lote ON execucoes_avaliacao_regras(lote_id, numero_execucao);
