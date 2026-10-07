CREATE TABLE revisoes_documentais (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  artefato_id TEXT NOT NULL REFERENCES artefatos_documentais(id) ON DELETE RESTRICT,
  documento_id TEXT NOT NULL REFERENCES documentos_fiscais(id) ON DELETE RESTRICT,
  revisao INTEGER NOT NULL CHECK (revisao > 0),
  acao TEXT NOT NULL CHECK (acao IN ('ASSOCIATE', 'APPROVE_CCE', 'REOPEN_CCE')),
  motivo TEXT NOT NULL CHECK (length(trim(motivo)) BETWEEN 1 AND 2000),
  snapshot TEXT NOT NULL CHECK (length(snapshot) = 64),
  computador TEXT NOT NULL,
  usuario_sistema TEXT NOT NULL,
  criado_em TEXT NOT NULL CHECK (criado_em GLOB '????-??-??T??:??:??.???Z'),
  UNIQUE (artefato_id, revisao)
) STRICT;
CREATE INDEX idx_revisoes_documentais_artefato ON revisoes_documentais(artefato_id, revisao DESC);
CREATE TRIGGER revisoes_documentais_imutaveis_update BEFORE UPDATE ON revisoes_documentais
BEGIN SELECT RAISE(ABORT, 'Revisões documentais são imutáveis.'); END;
CREATE TRIGGER revisoes_documentais_imutaveis_delete BEFORE DELETE ON revisoes_documentais
BEGIN SELECT RAISE(ABORT, 'Revisões documentais são imutáveis.'); END;
CREATE TRIGGER revisoes_documentais_escopo BEFORE INSERT ON revisoes_documentais
WHEN NOT EXISTS (
  SELECT 1 FROM artefatos_documentais a
  JOIN lotes origem ON origem.id = a.lote_id
  JOIN documentos_fiscais d ON d.id = NEW.documento_id
  JOIN lotes destino ON destino.id = d.lote_id
  WHERE a.id = NEW.artefato_id AND a.tipo = 'EVENT'
    AND origem.organizacao_id = destino.organizacao_id
    AND a.chave_acesso = d.chave_acesso
    AND json_extract(a.dados_json, '$.environmentCode') = d.ambiente
)
BEGIN SELECT RAISE(ABORT, 'Evento e nota incompatíveis.'); END;
