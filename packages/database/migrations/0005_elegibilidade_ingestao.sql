ALTER TABLE lotes
  ADD COLUMN ambiente TEXT CHECK (ambiente IS NULL OR ambiente IN ('1', '2'));

ALTER TABLE documentos_fiscais
  ADD COLUMN elegivel_processamento INTEGER NOT NULL DEFAULT 0
  CHECK (elegivel_processamento IN (0, 1));

CREATE INDEX idx_documentos_lote_elegibilidade
  ON documentos_fiscais(lote_id, elegivel_processamento);
