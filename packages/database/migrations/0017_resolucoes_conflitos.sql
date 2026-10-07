CREATE TABLE resolucoes_conflitos (
  id TEXT PRIMARY KEY,
  organizacao_id TEXT NOT NULL REFERENCES organizacoes(id) ON DELETE RESTRICT,
  chave_acesso TEXT NOT NULL CHECK (length(chave_acesso) = 44 AND chave_acesso NOT GLOB '*[^0-9]*'),
  ambiente TEXT NOT NULL CHECK (ambiente IN ('1', '2')),
  documento_id TEXT NOT NULL REFERENCES documentos_fiscais(id) ON DELETE RESTRICT,
  request_id TEXT NOT NULL UNIQUE,
  revisao INTEGER NOT NULL CHECK (revisao > 0),
  acao TEXT NOT NULL CHECK (acao IN ('SELECT', 'REOPEN')),
  motivo TEXT NOT NULL CHECK (length(trim(motivo)) BETWEEN 1 AND 2000),
  versoes_snapshot TEXT NOT NULL CHECK (length(versoes_snapshot) = 64),
  snapshot TEXT NOT NULL CHECK (length(snapshot) = 64),
  computador TEXT NOT NULL,
  usuario_sistema TEXT NOT NULL,
  criado_em TEXT NOT NULL CHECK (criado_em GLOB '????-??-??T??:??:??.???Z'),
  UNIQUE (organizacao_id, chave_acesso, ambiente, revisao)
) STRICT;
CREATE TRIGGER resolucoes_conflitos_imutaveis_update BEFORE UPDATE ON resolucoes_conflitos
BEGIN SELECT RAISE(ABORT, 'Resoluções de conflitos são imutáveis.'); END;
CREATE TRIGGER resolucoes_conflitos_imutaveis_delete BEFORE DELETE ON resolucoes_conflitos
BEGIN SELECT RAISE(ABORT, 'Resoluções de conflitos são imutáveis.'); END;
CREATE TRIGGER resolucoes_conflitos_escopo BEFORE INSERT ON resolucoes_conflitos
WHEN NOT EXISTS (
  SELECT 1 FROM documentos_fiscais d JOIN lotes l ON l.id = d.lote_id
  WHERE d.id = NEW.documento_id AND l.organizacao_id = NEW.organizacao_id
    AND d.chave_acesso = NEW.chave_acesso AND d.ambiente = NEW.ambiente
)
BEGIN SELECT RAISE(ABORT, 'Nota incompatível com o conflito.'); END;
