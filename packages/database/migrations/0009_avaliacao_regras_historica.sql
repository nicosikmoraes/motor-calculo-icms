ALTER TABLE itens_documento ADD COLUMN avaliacao_regras_json TEXT
  CHECK (avaliacao_regras_json IS NULL OR json_valid(avaliacao_regras_json));
