PRAGMA defer_foreign_keys = ON;

CREATE TABLE lotes_novo (
  id TEXT PRIMARY KEY
    CHECK (
      length(id) = 36
      AND substr(id, 9, 1) = '-'
      AND substr(id, 14, 1) = '-'
      AND substr(id, 19, 1) = '-'
      AND substr(id, 24, 1) = '-'
      AND lower(id) = id
      AND id NOT GLOB '*[^0-9a-f-]*'
    ),
  organizacao_id TEXT NOT NULL,
  empresa_id TEXT,
  nome_original TEXT,
  recebido_em TEXT NOT NULL CHECK (recebido_em GLOB '????-??-??T??:??:??.???Z'),
  status TEXT NOT NULL CHECK (status IN (
    'RECEBIDO',
    'VALIDANDO',
    'PROCESSANDO',
    'INTERROMPIDO',
    'CANCELADO',
    'CONCLUIDO',
    'CONCLUIDO_COM_PENDENCIAS',
    'FALHOU'
  )),
  ultimo_cancelamento_em TEXT
    CHECK (
      ultimo_cancelamento_em IS NULL
      OR ultimo_cancelamento_em GLOB '????-??-??T??:??:??.???Z'
    ),
  total_arquivos INTEGER NOT NULL DEFAULT 0 CHECK (total_arquivos >= 0),
  total_notas INTEGER NOT NULL DEFAULT 0 CHECK (total_notas >= 0),
  total_pendencias INTEGER NOT NULL DEFAULT 0 CHECK (total_pendencias >= 0),
  criado_em TEXT NOT NULL CHECK (criado_em GLOB '????-??-??T??:??:??.???Z'),
  atualizado_em TEXT NOT NULL CHECK (atualizado_em GLOB '????-??-??T??:??:??.???Z'),
  FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE RESTRICT,
  FOREIGN KEY (empresa_id, organizacao_id)
    REFERENCES empresas(id, organizacao_id) ON DELETE RESTRICT,
  UNIQUE (id, organizacao_id),
  CHECK (
    status IN ('RECEBIDO', 'VALIDANDO', 'FALHOU')
    OR empresa_id IS NOT NULL
  ),
  CHECK (status <> 'CANCELADO' OR ultimo_cancelamento_em IS NOT NULL)
) STRICT;

CREATE TABLE ocorrencias_arquivo_novo (
  id TEXT PRIMARY KEY
    CHECK (
      length(id) = 36
      AND substr(id, 9, 1) = '-'
      AND substr(id, 14, 1) = '-'
      AND substr(id, 19, 1) = '-'
      AND substr(id, 24, 1) = '-'
      AND lower(id) = id
      AND id NOT GLOB '*[^0-9a-f-]*'
    ),
  lote_id TEXT NOT NULL,
  nome_original TEXT NOT NULL CHECK (length(trim(nome_original)) > 0),
  caminho_relativo TEXT NOT NULL CHECK (length(trim(caminho_relativo)) > 0),
  tipo_detectado TEXT NOT NULL CHECK (tipo_detectado IN ('XML', 'ZIP', 'UNKNOWN')),
  origem TEXT NOT NULL CHECK (origem IN ('SELECTED_FILE', 'FOLDER_FILE', 'ZIP_ENTRY')),
  nome_container TEXT,
  hash_conteudo TEXT NOT NULL
    CHECK (
      length(hash_conteudo) = 64
      AND lower(hash_conteudo) = hash_conteudo
      AND hash_conteudo NOT GLOB '*[^0-9a-f]*'
    ),
  tamanho_bytes INTEGER NOT NULL CHECK (tamanho_bytes >= 0),
  ordem_no_envio INTEGER NOT NULL CHECK (ordem_no_envio > 0),
  chave_acesso TEXT
    CHECK (
      chave_acesso IS NULL
      OR (length(chave_acesso) = 44 AND chave_acesso NOT GLOB '*[^0-9]*')
    ),
  status_ingestao TEXT NOT NULL DEFAULT 'INVENTARIADA'
    CHECK (status_ingestao IN ('INVENTARIADA', 'PROCESSADA', 'PENDENTE', 'REJEITADA', 'IGNORADA')),
  repeticao TEXT NOT NULL DEFAULT 'NAO_CLASSIFICADA'
    CHECK (repeticao IN ('NAO_CLASSIFICADA', 'ORIGINAL', 'REPETIDA', 'NAO_CLASSIFICAVEL')),
  conflito_conteudo TEXT NOT NULL DEFAULT 'NAO_CLASSIFICADO'
    CHECK (conflito_conteudo IN (
      'NAO_CLASSIFICADO', 'SEM_CONFLITO', 'CONFLITO_CONTEUDO', 'NAO_CLASSIFICAVEL'
    )),
  ocorrencia_original_id TEXT,
  elegivel_totais_ocorrencia INTEGER NOT NULL DEFAULT 0
    CHECK (elegivel_totais_ocorrencia IN (0, 1)),
  recebido_em TEXT NOT NULL CHECK (recebido_em GLOB '????-??-??T??:??:??.???Z'),
  FOREIGN KEY (lote_id) REFERENCES lotes_novo(id) ON DELETE RESTRICT,
  FOREIGN KEY (ocorrencia_original_id, lote_id)
    REFERENCES ocorrencias_arquivo_novo(id, lote_id) ON DELETE RESTRICT,
  UNIQUE (lote_id, ordem_no_envio),
  UNIQUE (id, lote_id),
  CHECK (ocorrencia_original_id IS NULL OR ocorrencia_original_id <> id),
  CHECK (
    (repeticao = 'REPETIDA' AND ocorrencia_original_id IS NOT NULL)
    OR (repeticao <> 'REPETIDA' AND ocorrencia_original_id IS NULL)
  ),
  CHECK (repeticao <> 'REPETIDA' OR elegivel_totais_ocorrencia = 0),
  CHECK (conflito_conteudo <> 'CONFLITO_CONTEUDO' OR elegivel_totais_ocorrencia = 0)
) STRICT;

INSERT INTO lotes_novo (
  id, organizacao_id, empresa_id, nome_original, recebido_em, status,
  ultimo_cancelamento_em, total_arquivos, total_notas, total_pendencias,
  criado_em, atualizado_em
)
SELECT
  id, organizacao_id, empresa_id, nome_original, recebido_em, status,
  NULL, total_arquivos, total_notas, total_pendencias, criado_em, atualizado_em
FROM lotes;

INSERT INTO ocorrencias_arquivo_novo (
  id, lote_id, nome_original, caminho_relativo, tipo_detectado, origem,
  nome_container, hash_conteudo, tamanho_bytes, ordem_no_envio, chave_acesso,
  status_ingestao, repeticao, conflito_conteudo, ocorrencia_original_id,
  elegivel_totais_ocorrencia, recebido_em
)
SELECT
  id, lote_id, nome_original, caminho_relativo, tipo_detectado, origem,
  nome_container, hash_conteudo, tamanho_bytes, ordem_no_envio, chave_acesso,
  status_ingestao, repeticao, conflito_conteudo, ocorrencia_original_id,
  elegivel_totais_ocorrencia, recebido_em
FROM ocorrencias_arquivo;

DROP TABLE ocorrencias_arquivo;
DROP TABLE lotes;
ALTER TABLE lotes_novo RENAME TO lotes;
ALTER TABLE ocorrencias_arquivo_novo RENAME TO ocorrencias_arquivo;

CREATE INDEX idx_lotes_organizacao_recebido ON lotes(organizacao_id, recebido_em DESC);
CREATE INDEX idx_lotes_empresa_recebido ON lotes(empresa_id, recebido_em DESC);
CREATE INDEX idx_ocorrencias_lote_hash ON ocorrencias_arquivo(lote_id, hash_conteudo);
CREATE INDEX idx_ocorrencias_lote_chave ON ocorrencias_arquivo(lote_id, chave_acesso);
