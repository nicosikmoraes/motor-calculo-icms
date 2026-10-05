CREATE TABLE definicoes_respostas_fiscais (
  id TEXT PRIMARY KEY,
  empresa_id TEXT NOT NULL REFERENCES empresas(id) ON DELETE RESTRICT,
  fornecedor_cnpj TEXT NOT NULL CHECK (length(fornecedor_cnpj) = 14 AND fornecedor_cnpj NOT GLOB '*[^0-9]*'),
  codigo_produto TEXT NOT NULL CHECK (length(trim(codigo_produto)) > 0),
  contexto_json TEXT NOT NULL CHECK (json_valid(contexto_json)),
  respostas_json TEXT NOT NULL CHECK (json_valid(respostas_json)),
  execucao_origem_id TEXT NOT NULL REFERENCES execucoes_calculo(id) ON DELETE RESTRICT,
  recebido_origem_em TEXT NOT NULL,
  data_operacao_origem TEXT NOT NULL,
  criado_em TEXT NOT NULL
);
CREATE INDEX definicoes_respostas_fiscais_chave ON definicoes_respostas_fiscais
  (empresa_id, fornecedor_cnpj, codigo_produto, criado_em DESC);
CREATE TRIGGER definicoes_respostas_fiscais_sem_update BEFORE UPDATE ON definicoes_respostas_fiscais
BEGIN SELECT RAISE(ABORT, 'Definição fiscal imutável'); END;
CREATE TRIGGER definicoes_respostas_fiscais_sem_delete BEFORE DELETE ON definicoes_respostas_fiscais
BEGIN SELECT RAISE(ABORT, 'Definição fiscal imutável'); END;
