# ContabiliNico

Aplicação local de cálculo e auditoria fiscal para contadores recalcularem ICMS em lote a partir de XMLs de
NF-e/NFC-e, compararem o resultado com os valores declarados e investigarem
divergências com rastreabilidade.

## Autor

- Nicolas Moraes — [@nicosikmoraes](https://github.com/nicosikmoraes)

## Estado do projeto

O projeto está em desenvolvimento. Este repositório já contém uma implementação
desktop anterior à revisão acadêmica. A Entrega 1 registra a concepção e o
planejamento. A Atividade 08 acrescenta o scaffold isolado da API de doações e
pagamentos; as operações de negócio dessa API ainda serão implementadas.

- [Protótipo público — cinco telas com dados fictícios](https://contabilinico-prototipo.balmygrove128.chatgpt.site)
- [Kanban público — histórias vinculadas ao PRD](https://github.com/users/nicosikmoraes/projects/2)

## Stack

- **Aplicativo fiscal:** Electron 38, Vue 3, TypeScript 5.9 e SQLite local.
- **Scaffold da API:** NestJS 12 em ESM, TypeScript 6, Prisma ORM 7 e PostgreSQL 16.
- **Monorepo:** pnpm 10, com um único `pnpm-lock.yaml` na raiz.
- **Qualidade:** Vitest 3 no desktop/pacotes fiscais, Vitest 4 e Oxlint na API.

O desktop processa documentos e cálculos localmente, sem depender da API. O
PostgreSQL é exclusivo da futura área de doações/pagamentos e nasce sem tabelas.
A integração com o gateway ainda não está implementada.

## Em produção

A partir da Entrega 3. O protótipo público demonstra a navegação com dados
fictícios; não representa uma aplicação fiscal em produção.

## Quick Start

Use Node.js 24 LTS atualizado e pnpm 10.32.1. Na raiz:

```bash
pnpm install --frozen-lockfile
pnpm dev
```

`pnpm dev` inicia o aplicativo desktop. Para conferir tipos, testes e os builds
separados do desktop e da API, execute `pnpm check`.

Para o ambiente opcional da API:

```bash
cp apps/api/.env.example apps/api/.env
pnpm db:up
pnpm db:validate
pnpm --filter @motor/api prisma:check-db
pnpm test:db
pnpm dev:api
```

A API responde `Hello World!` em `http://127.0.0.1:3000`. O PostgreSQL de
pagamentos usa `127.0.0.1:5433`; os arquivos fiscais continuam no SQLite do app.
Consulte o [guia de desenvolvimento](docs/desenvolvimento.md) e as
[evidências e adaptações da Atividade 08](docs/atividade-08.md).

## Documentação de produto

Estes documentos resumem os requisitos, as jornadas e a arquitetura do produto:

- [Product Requirements Document — PRD](docs/prd.md)
- [Jornadas de usuário](docs/user-flows.md)
- [Tokens de design](docs/design-tokens.md)
- [Software Design Document — Arquitetura](docs/architecture.md)

O [checklist da disciplina](docs/checklist.md) registra as evidências acadêmicas
de cada entrega. US01–US03 e US05–US09 estão `Ready`; US04 continua `Draft` até
ser dividida por componente fiscal. O PRD é a fonte dos critérios de aceite;
as Issues apontam para ele.

## Documentação do produto

### Negócio e uso

- [Regras de negócio detalhadas](docs/regras-de-negocio.md)
- [Manual do usuário e do contador](docs/manual-do-usuario.md)
- [Critérios de aceite](docs/criterios-de-aceite.md)
- [Ciclo de vida do documento fiscal](docs/ciclo-de-vida-documento-fiscal.md)
- [Decisões pendentes](docs/decisoes-pendentes.md)
- [Conferência de ICMS-ST de entradas, catálogo de MVA e cobertura](docs/icms-st-entradas.md)
- [Antecipação de entrada e Excel mensal no modelo de apuração](docs/apuracao-entradas.md)

### Arquitetura e desenvolvimento

- [Arquitetura inicial](docs/arquitetura-inicial.md)
- [Modelo de dados inicial](docs/modelo-de-dados.md)
- [Decisões técnicas aprovadas](docs/decisoes-tecnicas.md)
- [Roadmap do MVP](docs/roadmap.md)
- [Guia de desenvolvimento](docs/desenvolvimento.md)

### Ingestão fiscal

- [Avaliação de bibliotecas XML](docs/avaliacao-bibliotecas-xml.md)
- [Prova de conceito do parser XML](docs/prova-conceito-parser-xml.md)
- [Catálogo de severidades](docs/catalogo-severidades-ingestao.md)
- [Contrato normalizado de NF-e/NFC-e](docs/contrato-normalizacao-nfe.md)
- [Contrato do inventário](docs/contrato-inventario-arquivos.md)
- [Segurança das entradas XML e ZIP](docs/seguranca-entradas.md)

## Limites e responsabilidade

O sistema é uma ferramenta parametrizável de cálculo e auditoria. A classificação
fiscal, a vigência, o fundamento legal e a aprovação das regras continuam sob a
responsabilidade do profissional fiscal autorizado. O sistema preserva histórico
e evidências, mas não substitui interpretação tributária profissional.
