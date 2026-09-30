-- Versões de seleção fiscal. Resultados tributários aguardam MD-05/MD-06.
CREATE TABLE familias_regras_fiscais (
  id TEXT PRIMARY KEY,
  organizacao_id TEXT NOT NULL REFERENCES organizacoes(id) ON DELETE RESTRICT,
  criado_em TEXT NOT NULL CHECK (criado_em GLOB '????-??-??T??:??:??.???Z')
) STRICT;

CREATE TABLE versoes_regras_fiscais (
  id TEXT PRIMARY KEY,
  familia_id TEXT NOT NULL REFERENCES familias_regras_fiscais(id) ON DELETE RESTRICT,
  numero INTEGER NOT NULL CHECK (numero > 0),
  revisao INTEGER NOT NULL DEFAULT 1 CHECK (revisao > 0),
  estado TEXT NOT NULL CHECK (estado IN ('DRAFT', 'APPROVED')),
  nome TEXT NOT NULL CHECK (length(trim(nome)) > 0),
  nivel TEXT NOT NULL CHECK (nivel IN ('DEFAULT_OPERATION', 'NCM', 'NCM_CEST', 'FISCAL_PROFILE', 'COMPANY', 'PRODUCT_COMPANY_EXCEPTION')),
  prioridade INTEGER NOT NULL DEFAULT 0 CHECK (prioridade >= 0),
  justificativa_prioridade TEXT,
  vigente_de TEXT NOT NULL CHECK (vigente_de GLOB '????-??-??'),
  vigente_ate TEXT CHECK (vigente_ate IS NULL OR vigente_ate GLOB '????-??-??'),
  fundamento_legal TEXT,
  condicoes_json TEXT NOT NULL CHECK (json_valid(condicoes_json) AND json_type(condicoes_json) = 'object'),
  criado_em TEXT NOT NULL CHECK (criado_em GLOB '????-??-??T??:??:??.???Z'),
  atualizado_em TEXT NOT NULL CHECK (atualizado_em GLOB '????-??-??T??:??:??.???Z'),
  aprovado_em TEXT CHECK (aprovado_em IS NULL OR aprovado_em GLOB '????-??-??T??:??:??.???Z'),
  aprovado_por TEXT,
  UNIQUE (familia_id, numero),
  CHECK (vigente_ate IS NULL OR vigente_ate >= vigente_de),
  CHECK (prioridade = 0 OR length(trim(coalesce(justificativa_prioridade, ''))) > 0),
  CHECK (estado = 'DRAFT' OR length(trim(coalesce(fundamento_legal, ''))) > 0),
  CHECK ((estado = 'DRAFT' AND aprovado_em IS NULL AND aprovado_por IS NULL)
    OR (estado = 'APPROVED' AND aprovado_em IS NOT NULL AND aprovado_por IS NOT NULL))
) STRICT;
CREATE UNIQUE INDEX idx_regras_um_rascunho ON versoes_regras_fiscais(familia_id) WHERE estado = 'DRAFT';
CREATE INDEX idx_regras_familia_numero ON versoes_regras_fiscais(familia_id, numero DESC);
CREATE INDEX idx_regras_aprovadas_vigencia ON versoes_regras_fiscais(estado, vigente_de, vigente_ate);

CREATE TABLE revogacoes_regras_fiscais (
  versao_id TEXT PRIMARY KEY REFERENCES versoes_regras_fiscais(id) ON DELETE RESTRICT,
  motivo TEXT NOT NULL CHECK (length(trim(motivo)) > 0),
  revogado_em TEXT NOT NULL CHECK (revogado_em GLOB '????-??-??T??:??:??.???Z'),
  revogado_por TEXT NOT NULL
) STRICT;

CREATE TABLE eventos_auditoria_regras (
  id TEXT PRIMARY KEY,
  versao_id TEXT NOT NULL REFERENCES versoes_regras_fiscais(id) ON DELETE RESTRICT,
  operacao TEXT NOT NULL CHECK (operacao IN ('CREATE_DRAFT', 'UPDATE_DRAFT', 'NEW_VERSION', 'APPROVE', 'REVOKE')),
  revisao INTEGER NOT NULL CHECK (revisao > 0),
  alteracoes_json TEXT NOT NULL CHECK (json_valid(alteracoes_json) AND json_type(alteracoes_json) = 'object'),
  computador TEXT NOT NULL,
  usuario_sistema TEXT NOT NULL,
  criado_em TEXT NOT NULL CHECK (criado_em GLOB '????-??-??T??:??:??.???Z')
) STRICT;
CREATE INDEX idx_auditoria_regras_versao ON eventos_auditoria_regras(versao_id, criado_em DESC);

CREATE TRIGGER regra_aprovada_imutavel BEFORE UPDATE ON versoes_regras_fiscais
WHEN OLD.estado = 'APPROVED'
BEGIN SELECT RAISE(ABORT, 'Versão aprovada é imutável'); END;
CREATE TRIGGER regra_sem_exclusao BEFORE DELETE ON versoes_regras_fiscais
BEGIN SELECT RAISE(ABORT, 'Versão de regra não pode ser excluída'); END;
CREATE TRIGGER revogacao_apenas_aprovada BEFORE INSERT ON revogacoes_regras_fiscais
WHEN (SELECT estado FROM versoes_regras_fiscais WHERE id = NEW.versao_id) <> 'APPROVED'
BEGIN SELECT RAISE(ABORT, 'Somente versão aprovada pode ser revogada'); END;
CREATE TRIGGER revogacao_sem_update BEFORE UPDATE ON revogacoes_regras_fiscais
BEGIN SELECT RAISE(ABORT, 'Revogação é imutável'); END;
CREATE TRIGGER revogacao_sem_delete BEFORE DELETE ON revogacoes_regras_fiscais
BEGIN SELECT RAISE(ABORT, 'Revogação é imutável'); END;
CREATE TRIGGER auditoria_regras_sem_update BEFORE UPDATE ON eventos_auditoria_regras
BEGIN SELECT RAISE(ABORT, 'Auditoria de regras é imutável'); END;
CREATE TRIGGER auditoria_regras_sem_delete BEFORE DELETE ON eventos_auditoria_regras
BEGIN SELECT RAISE(ABORT, 'Auditoria de regras é imutável'); END;
