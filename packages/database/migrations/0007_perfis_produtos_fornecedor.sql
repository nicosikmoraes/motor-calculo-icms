CREATE TABLE perfis_fiscais (
  id TEXT PRIMARY KEY,
  organizacao_id TEXT NOT NULL,
  empresa_id TEXT NOT NULL,
  nome TEXT NOT NULL CHECK (length(trim(nome)) > 0),
  vigente_de TEXT NOT NULL CHECK (vigente_de GLOB '????-??-??'),
  vigente_ate TEXT CHECK (vigente_ate IS NULL OR vigente_ate GLOB '????-??-??'),
  criado_em TEXT NOT NULL CHECK (criado_em GLOB '????-??-??T??:??:??.???Z'),
  FOREIGN KEY (empresa_id, organizacao_id) REFERENCES empresas(id, organizacao_id) ON DELETE RESTRICT,
  UNIQUE (id, empresa_id),
  CHECK (vigente_ate IS NULL OR vigente_ate >= vigente_de)
) STRICT;

CREATE TABLE produtos_fornecedor (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL,
  fornecedor_cnpj TEXT NOT NULL CHECK (length(fornecedor_cnpj) = 14 AND fornecedor_cnpj NOT GLOB '*[^0-9]*'),
  codigo_produto TEXT NOT NULL CHECK (length(trim(codigo_produto)) > 0),
  perfil_fiscal_id TEXT NOT NULL,
  criado_em TEXT NOT NULL CHECK (criado_em GLOB '????-??-??T??:??:??.???Z'),
  atualizado_em TEXT NOT NULL CHECK (atualizado_em GLOB '????-??-??T??:??:??.???Z'),
  FOREIGN KEY (perfil_fiscal_id, empresa_id) REFERENCES perfis_fiscais(id, empresa_id) ON DELETE RESTRICT,
  UNIQUE (empresa_id, fornecedor_cnpj, codigo_produto)
) STRICT;

CREATE INDEX idx_perfis_empresa ON perfis_fiscais(empresa_id, vigente_de);
CREATE INDEX idx_produtos_empresa_fornecedor ON produtos_fornecedor(empresa_id, fornecedor_cnpj);
