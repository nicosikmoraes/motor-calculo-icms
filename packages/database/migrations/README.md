# Migrations SQLite

As migrations de produção usam arquivos SQL imutáveis com o formato
`0001_nome_descritivo.sql`.

Regras:

- a numeração é crescente e não pode se repetir;
- uma migration publicada nunca é editada;
- correções entram em um novo arquivo;
- `BEGIN`, `COMMIT` e `ROLLBACK` não são escritos no SQL: o executor controla a
  transação;
- migrations `down` não são executadas sobre bancos de usuário;
- o checksum SHA-256 é registrado em `schema_migrations`.
- ao evoluir um banco com schema de usuário, o chamador usa o executor com backup
  validado e fornece um caminho de destino diferente do banco principal.

`0001_nucleo_persistencia.sql` contém o primeiro recorte aprovado: organização,
empresa, lote e ocorrência de arquivo. Novas entidades entram somente por novos
arquivos numerados; a `0001` não deve ser editada depois de publicada.

`0002_cancelamento_lote.sql` acrescenta o estado `CANCELADO` e preserva a data do
último cancelamento para distinguir uma interrupção solicitada de uma queda do
aplicativo. A migration reconstrói `lotes` sem perder ocorrências relacionadas.

`0003_diagnosticos_ingestao.sql` persiste pendências e rejeições do lote, com
vínculo opcional à ocorrência quando ela possui conteúdo inventariável.
