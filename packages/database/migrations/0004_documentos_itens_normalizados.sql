CREATE TABLE documentos_fiscais (
  id TEXT PRIMARY KEY,
  lote_id TEXT NOT NULL,
  ocorrencia_arquivo_id TEXT NOT NULL,
  chave_acesso TEXT NOT NULL CHECK (length(chave_acesso) = 44 AND chave_acesso NOT GLOB '*[^0-9]*'),
  modelo TEXT NOT NULL CHECK (modelo IN ('55', '65')),
  numero TEXT NOT NULL,
  serie TEXT NOT NULL,
  emissao_original TEXT,
  emitente_cnpj TEXT,
  destinatario_cnpj_cpf TEXT,
  uf_origem TEXT,
  uf_destino TEXT,
  ambiente TEXT,
  finalidade TEXT,
  hash_xml TEXT NOT NULL CHECK (length(hash_xml) = 64 AND hash_xml NOT GLOB '*[^0-9a-f]*'),
  dados_normalizados_json TEXT NOT NULL CHECK (json_valid(dados_normalizados_json)),
  situacao_documento TEXT NOT NULL DEFAULT 'NAO_VERIFICADA',
  situacao_calculo TEXT NOT NULL DEFAULT 'PENDENTE',
  carater_resultado TEXT NOT NULL DEFAULT 'PROVISORIO',
  calculada INTEGER NOT NULL DEFAULT 0 CHECK (calculada IN (0, 1)),
  incluida_total INTEGER NOT NULL DEFAULT 0 CHECK (incluida_total IN (0, 1)),
  motivo_exclusao_pendencia TEXT,
  criado_em TEXT NOT NULL CHECK (criado_em GLOB '????-??-??T??:??:??.???Z'),
  FOREIGN KEY (lote_id) REFERENCES lotes(id) ON DELETE RESTRICT,
  FOREIGN KEY (ocorrencia_arquivo_id, lote_id)
    REFERENCES ocorrencias_arquivo(id, lote_id) ON DELETE RESTRICT,
  UNIQUE (ocorrencia_arquivo_id),
  UNIQUE (id, lote_id)
) STRICT;

CREATE TABLE itens_documento (
  id TEXT PRIMARY KEY,
  documento_id TEXT NOT NULL,
  numero_item TEXT NOT NULL CHECK (length(trim(numero_item)) > 0),
  codigo_produto_fornecedor TEXT,
  descricao TEXT,
  ncm TEXT,
  cest TEXT,
  cfop TEXT,
  dados_normalizados_json TEXT NOT NULL CHECK (json_valid(dados_normalizados_json)),
  FOREIGN KEY (documento_id) REFERENCES documentos_fiscais(id) ON DELETE RESTRICT,
  UNIQUE (documento_id, numero_item)
) STRICT;

CREATE INDEX idx_documentos_lote_chave ON documentos_fiscais(lote_id, chave_acesso);
CREATE INDEX idx_documentos_ambiente ON documentos_fiscais(lote_id, ambiente);
CREATE INDEX idx_itens_documento ON itens_documento(documento_id, numero_item);
