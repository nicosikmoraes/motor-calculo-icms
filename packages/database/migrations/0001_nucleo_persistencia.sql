CREATE TABLE organizacoes (
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
  nome TEXT NOT NULL CHECK (length(trim(nome)) > 0),
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  criado_em TEXT NOT NULL CHECK (criado_em GLOB '????-??-??T??:??:??.???Z'),
  atualizado_em TEXT NOT NULL CHECK (atualizado_em GLOB '????-??-??T??:??:??.???Z')
) STRICT;

CREATE TABLE empresas (
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
  razao_social TEXT NOT NULL CHECK (length(trim(razao_social)) > 0),
  nome_fantasia TEXT,
  cnpj TEXT NOT NULL
    CHECK (length(cnpj) = 14 AND cnpj NOT GLOB '*[^0-9]*'),
  uf TEXT NOT NULL
    CHECK (uf IN (
      'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
      'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
      'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
    )),
  ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
  inativada_em TEXT CHECK (inativada_em IS NULL OR inativada_em GLOB '????-??-??T??:??:??.???Z'),
  criado_em TEXT NOT NULL CHECK (criado_em GLOB '????-??-??T??:??:??.???Z'),
  atualizado_em TEXT NOT NULL CHECK (atualizado_em GLOB '????-??-??T??:??:??.???Z'),
  FOREIGN KEY (organizacao_id) REFERENCES organizacoes(id) ON DELETE RESTRICT,
  UNIQUE (organizacao_id, cnpj),
  UNIQUE (id, organizacao_id),
  CHECK ((ativo = 1 AND inativada_em IS NULL) OR (ativo = 0 AND inativada_em IS NOT NULL))
) STRICT;

CREATE TABLE lotes (
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
    'CONCLUIDO',
    'CONCLUIDO_COM_PENDENCIAS',
    'FALHOU'
  )),
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
  )
) STRICT;

CREATE TABLE ocorrencias_arquivo (
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
  FOREIGN KEY (lote_id) REFERENCES lotes(id) ON DELETE RESTRICT,
  FOREIGN KEY (ocorrencia_original_id, lote_id)
    REFERENCES ocorrencias_arquivo(id, lote_id) ON DELETE RESTRICT,
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

CREATE INDEX idx_empresas_cnpj ON empresas(cnpj);
CREATE INDEX idx_empresas_organizacao_ativas ON empresas(organizacao_id, ativo);
CREATE INDEX idx_lotes_organizacao_recebido ON lotes(organizacao_id, recebido_em DESC);
CREATE INDEX idx_lotes_empresa_recebido ON lotes(empresa_id, recebido_em DESC);
CREATE INDEX idx_ocorrencias_lote_hash ON ocorrencias_arquivo(lote_id, hash_conteudo);
CREATE INDEX idx_ocorrencias_lote_chave ON ocorrencias_arquivo(lote_id, chave_acesso);
