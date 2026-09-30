-- Perfis e produtos existentes continuam ativos após a atualização.
ALTER TABLE perfis_fiscais ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1));
ALTER TABLE perfis_fiscais ADD COLUMN inativado_em TEXT CHECK (inativado_em IS NULL OR inativado_em GLOB '????-??-??T??:??:??.???Z');
ALTER TABLE perfis_fiscais ADD COLUMN atualizado_em TEXT;
UPDATE perfis_fiscais SET atualizado_em = criado_em WHERE atualizado_em IS NULL;

ALTER TABLE produtos_fornecedor ADD COLUMN ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1));
ALTER TABLE produtos_fornecedor ADD COLUMN inativado_em TEXT CHECK (inativado_em IS NULL OR inativado_em GLOB '????-??-??T??:??:??.???Z');

CREATE INDEX idx_perfis_empresa_ativos ON perfis_fiscais(empresa_id, ativo);
CREATE INDEX idx_produtos_empresa_ativos ON produtos_fornecedor(empresa_id, ativo);
