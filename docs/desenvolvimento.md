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
packages/database/  portas de persistência
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

As portas sem implementação são intencionais. Elas impedem que escolhas ainda
registradas em `decisoes-pendentes.md` — como biblioteca SQLite, parser XML,
decimal exato e contrato XLSX — sejam incorporadas silenciosamente à arquitetura.

## Primeiro incremento implementado

- shell desktop navegável;
- renderer sem acesso direto ao Node.js;
- seleção de XML/ZIP via IPC restrito;
- vocabulário inicial de estados do domínio;
- seleção determinística de regra por nível, especificidade e prioridade;
- detecção explícita de regra inexistente e ambígua;
- testes unitários da precedência aprovada;
- parser NF-e/NFC-e 4.00, catálogo de severidades, normalização e builders de XML
  sintético.
