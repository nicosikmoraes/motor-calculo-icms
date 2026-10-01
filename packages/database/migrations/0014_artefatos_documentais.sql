CREATE TABLE artefatos_documentais (
  id TEXT PRIMARY KEY,
  lote_id TEXT NOT NULL,
  ocorrencia_arquivo_id TEXT NOT NULL,
  documento_id TEXT,
  tipo TEXT NOT NULL CHECK (tipo IN ('PROTOCOL', 'EVENT')),
  chave_acesso TEXT NOT NULL CHECK (length(chave_acesso) = 44 AND chave_acesso NOT GLOB '*[^0-9]*'),
  versao TEXT NOT NULL,
  tipo_evento TEXT,
  sequencia TEXT,
  protocolo TEXT,
  codigo_status TEXT,
  associacao TEXT NOT NULL CHECK (associacao IN ('ASSOCIATED', 'ORPHAN', 'AMBIGUOUS')),
  hash_xml TEXT NOT NULL CHECK (length(hash_xml) = 64 AND hash_xml NOT GLOB '*[^0-9a-f]*'),
  dados_json TEXT NOT NULL CHECK (json_valid(dados_json)),
  criado_em TEXT NOT NULL CHECK (criado_em GLOB '????-??-??T??:??:??.???Z'),
  FOREIGN KEY (lote_id) REFERENCES lotes(id) ON DELETE RESTRICT,
  FOREIGN KEY (ocorrencia_arquivo_id, lote_id)
    REFERENCES ocorrencias_arquivo(id, lote_id) ON DELETE RESTRICT,
  FOREIGN KEY (documento_id, lote_id)
    REFERENCES documentos_fiscais(id, lote_id) ON DELETE RESTRICT,
  CHECK (associacao = 'ASSOCIATED' OR documento_id IS NULL),
  CHECK (associacao <> 'ASSOCIATED' OR documento_id IS NOT NULL),
  CHECK (tipo = 'EVENT' OR (tipo_evento IS NULL AND sequencia IS NULL))
) STRICT;
CREATE INDEX idx_artefatos_chave ON artefatos_documentais(lote_id, chave_acesso, tipo_evento, sequencia);
CREATE INDEX idx_artefatos_documento ON artefatos_documentais(documento_id, tipo);
CREATE INDEX idx_artefatos_orfaos ON artefatos_documentais(associacao, chave_acesso);
