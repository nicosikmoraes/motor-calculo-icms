# Desenvolvimento

## Pré-requisitos

- Node.js 22 ou superior;
- pnpm 10.

## Comandos

```bash
pnpm install
pnpm dev
pnpm check
```

`pnpm dev` abre o aplicativo Electron em modo de desenvolvimento. `pnpm check`
executa verificação de tipos, testes e build de produção.

## Estrutura

```text
apps/desktop/       Electron + preload seguro + interface Vue
packages/contracts/ contratos IPC compartilhados
packages/domain/    estados e conceitos de negócio
packages/tax-engine seleção de regras e, futuramente, cálculo fiscal
packages/nfe-parser porta de ingestão e normalização
packages/database/  SQLite local, migrations e repositórios
packages/reporting/ porta de geração de relatórios
```

Os schemas oficiais usados pelo parser ficam em `packages/nfe-parser/schemas`,
com pacote, origem e hashes registrados. Eles são lidos localmente; o parser não
consulta a internet durante o processamento.

Os testes de ingestão usam apenas dados sintéticos. A fixture XML mínima fica em
`packages/nfe-parser/test/fixtures` e o `NfeXmlFixtureBuilder` em
`packages/nfe-parser/test/support`. O builder cria NF-e/NFC-e determinísticas,
múltiplos itens, ICMS declarado e variações controladas com campos ausentes ou
`DOCTYPE`. Valores recebidos pelo builder são escapados antes de entrar no XML.

O inventário em `packages/nfe-parser/src/file-inventory.ts` calcula SHA-256 em
streaming, normaliza caminhos relativos e ordena ocorrências sem depender da ordem
de seleção. Seu contrato está em `docs/contrato-inventario-arquivos.md`.

A inspeção em `packages/nfe-parser/src/zip-security.ts` valida XML inseguro, Zip
Slip, corrupção e expansão excessiva sem escrever entradas no disco. Os testes
geram os arquivos ZIP em memória com `yazl`; essa biblioteca é dependência apenas
de desenvolvimento.

O pacote `database` usa `node:sqlite`, habilita chaves estrangeiras e mantém uma
única conexão controlada pelo processo principal. O arquivo
`motor-icms.sqlite` fica em `app.getPath('userData')`. Migrations seguem o formato
`0001_nome.sql`, são aplicadas em transações e registram checksum em
`schema_migrations`. Ao evoluir um banco que já contém schema de usuário, o
executor cria e valida um backup antes da primeira migration pendente. A primeira
migration de domínio, `0001_nucleo_persistencia.sql`, cria organização, empresa,
lote e ocorrência de arquivo. O SQL é importado como recurso bruto e incorporado
ao bundle do processo principal.

As migrations seguintes acrescentam cancelamento retomável, diagnósticos de
ingestão e snapshots normalizados de NF-e/NFC-e e itens. Campos usados em busca
ficam em colunas; o contrato normalizado completo também é preservado como JSON
validado pelo SQLite.

As portas ainda sem implementação são intencionais. Elas impedem que escolhas
pendentes — como biblioteca decimal e contrato XLSX — sejam incorporadas
silenciosamente à arquitetura.

## Primeiro incremento implementado

- shell desktop navegável;
- renderer sem acesso direto ao Node.js;
- seleção de XML/ZIP via IPC restrito;
- vocabulário inicial de estados do domínio;
- seleção determinística de regra por nível, especificidade e prioridade;
- detecção explícita de regra inexistente e ambígua;
- testes unitários da precedência aprovada;
- parser NF-e/NFC-e 4.00, catálogo de severidades, normalização e builders de XML
  sintético;
- classificação determinística de repetições e conflitos de conteúdo;
- conexão SQLite local e executor versionado de migrations;
- persistência de organização, empresa, lote, ocorrência, diagnóstico, documento
  fiscal normalizado e item.
