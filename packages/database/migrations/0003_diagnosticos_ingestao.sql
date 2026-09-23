CREATE TABLE diagnosticos_ingestao (
  id TEXT PRIMARY KEY,
  lote_id TEXT NOT NULL,
  ocorrencia_id TEXT,
  origem TEXT NOT NULL CHECK (length(trim(origem)) > 0),
  codigo TEXT NOT NULL CHECK (length(trim(codigo)) > 0),
  mensagem TEXT NOT NULL CHECK (length(trim(mensagem)) > 0),
  criado_em TEXT NOT NULL CHECK (criado_em GLOB '????-??-??T??:??:??.???Z'),
  FOREIGN KEY (lote_id) REFERENCES lotes(id) ON DELETE RESTRICT,
  FOREIGN KEY (ocorrencia_id, lote_id)
    REFERENCES ocorrencias_arquivo(id, lote_id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX idx_diagnosticos_lote ON diagnosticos_ingestao(lote_id, codigo);
