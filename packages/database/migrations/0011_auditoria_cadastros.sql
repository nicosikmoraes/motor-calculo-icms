-- Revisão 1 representa o cadastro existente antes desta migration.
ALTER TABLE organizacoes ADD COLUMN revisao INTEGER NOT NULL DEFAULT 1 CHECK (revisao > 0);
ALTER TABLE empresas ADD COLUMN revisao INTEGER NOT NULL DEFAULT 1 CHECK (revisao > 0);
ALTER TABLE perfis_fiscais ADD COLUMN revisao INTEGER NOT NULL DEFAULT 1 CHECK (revisao > 0);
ALTER TABLE produtos_fornecedor ADD COLUMN revisao INTEGER NOT NULL DEFAULT 1 CHECK (revisao > 0);

CREATE TABLE eventos_auditoria_cadastro (
  id TEXT PRIMARY KEY,
  entidade TEXT NOT NULL CHECK (entidade IN ('ORGANIZATION', 'COMPANY', 'FISCAL_PROFILE', 'SUPPLIER_PRODUCT')),
  entidade_id TEXT NOT NULL,
  operacao TEXT NOT NULL CHECK (operacao IN ('CREATE', 'UPDATE', 'INACTIVATE', 'REACTIVATE')),
  revisao INTEGER NOT NULL CHECK (revisao > 0),
  alteracoes_json TEXT NOT NULL CHECK (json_valid(alteracoes_json) AND json_type(alteracoes_json) = 'object'),
  computador TEXT NOT NULL,
  usuario_sistema TEXT NOT NULL,
  criado_em TEXT NOT NULL CHECK (criado_em GLOB '????-??-??T??:??:??.???Z')
) STRICT;
CREATE INDEX idx_auditoria_entidade ON eventos_auditoria_cadastro(entidade, entidade_id, criado_em DESC);
CREATE INDEX idx_auditoria_periodo ON eventos_auditoria_cadastro(criado_em DESC, operacao);

-- Controle interno libera exclusão somente durante o expurgo transacional.
CREATE TABLE auditoria_retencao_controle (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  permite_exclusao INTEGER NOT NULL DEFAULT 0 CHECK (permite_exclusao IN (0, 1))
) STRICT;
INSERT INTO auditoria_retencao_controle (id, permite_exclusao) VALUES (1, 0);
CREATE TABLE auditoria_retencao_execucoes (
  id TEXT PRIMARY KEY,
  executado_em TEXT NOT NULL,
  limite_exclusivo TEXT NOT NULL,
  removidos INTEGER NOT NULL CHECK (removidos >= 0)
) STRICT;

CREATE TRIGGER auditoria_cadastro_sem_update BEFORE UPDATE ON eventos_auditoria_cadastro
BEGIN SELECT RAISE(ABORT, 'Eventos de auditoria são imutáveis'); END;
CREATE TRIGGER auditoria_cadastro_sem_delete BEFORE DELETE ON eventos_auditoria_cadastro
WHEN (SELECT permite_exclusao FROM auditoria_retencao_controle WHERE id = 1) <> 1
BEGIN SELECT RAISE(ABORT, 'Eventos de auditoria são imutáveis'); END;
