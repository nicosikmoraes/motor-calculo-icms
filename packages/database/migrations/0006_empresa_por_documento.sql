ALTER TABLE documentos_fiscais ADD COLUMN empresa_id TEXT REFERENCES empresas(id);
UPDATE documentos_fiscais
SET empresa_id = (SELECT empresa_id FROM lotes WHERE lotes.id = documentos_fiscais.lote_id)
WHERE empresa_id IS NULL;
CREATE INDEX idx_documentos_empresa ON documentos_fiscais(empresa_id);
