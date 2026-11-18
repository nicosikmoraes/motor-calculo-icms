# ContabiliNico

Aplicação local de cálculo e auditoria fiscal para contadores recalcularem ICMS em lote a partir de XMLs de
NF-e/NFC-e, compararem o resultado com os valores declarados e investigarem
divergências com rastreabilidade.

## Autor

- Nicolas Moraes — [@nicosikmoraes](https://github.com/nicosikmoraes)

## Estado do projeto

O desktop processa documentos fiscais localmente. A API atende contas de
apoiador, login, permissões e doações com Stripe em ambiente de teste. A API
também permite guardar e descartar rascunhos antes de abrir o checkout. As
histórias US09 a US12 e seus critérios de aceite estão no
[PRD](docs/prd.md).

- [Protótipo público — cinco telas com dados fictícios](https://contabilinico-prototipo.balmygrove128.chatgpt.site)
- [Kanban público — histórias vinculadas ao PRD](https://github.com/users/nicosikmoraes/projects/2)

## Stack

- **Aplicativo fiscal:** Electron 38, Vue 3, TypeScript 5.9 e SQLite local.
- **API:** NestJS 12 em ESM, TypeScript 6, Prisma ORM 7 e PostgreSQL 16.
- **Monorepo:** pnpm 10, com um único `pnpm-lock.yaml` na raiz.
- **Qualidade:** Vitest 3 no desktop/pacotes fiscais, Vitest 4 e Oxlint na API.

O SQLite guarda documentos e cálculos no desktop. O PostgreSQL guarda as
contas, os pedidos de doação e as tentativas de pagamento da API.

## Em produção

A partir da Entrega 3. O protótipo público demonstra a navegação com dados
fictícios; não representa uma aplicação fiscal em produção.

## Quick Start

Use Node.js 24 LTS e pnpm 10.32.1. Para a API, inicie também o Docker com o
plugin Compose. Execute os comandos na raiz do clone.

1. Instale as dependências do monorepo conforme o lockfile.

```bash
pnpm install --frozen-lockfile
```

2. Crie `apps/api/.env` a partir de `apps/api/.env.example`. No PowerShell,
   use `Copy-Item apps/api/.env.example apps/api/.env`. No Bash, use
   `cp apps/api/.env.example apps/api/.env`. Gere um segredo local com
   `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64'))"`
   e cole o resultado no campo `JWT_SECRET` do `.env`. O valor de exemplo da
   chave Stripe é suficiente para subir a API, testar as contas e abrir o
   Swagger. Para abrir um checkout de teste, configure as credenciais e URLs
   do seu ambiente Stripe conforme a [Atividade 10](docs/atividade-10.md).

3. Suba o PostgreSQL 16, valide o schema, gere o cliente e aplique as migrations
   versionadas. O Compose usa `127.0.0.1:5433`. Se você mudar
   `PAYMENTS_DB_PORT`, ajuste a mesma porta no `DATABASE_URL` do `.env`.

```bash
pnpm db:up
pnpm db:validate
pnpm --filter @motor/api prisma:generate
pnpm --filter @motor/api prisma:migrate-deploy
pnpm --filter @motor/api prisma:check-db
docker compose ps
```

4. Inicie a API. O endereço padrão é `http://127.0.0.1:3000`.

```bash
pnpm dev:api
```

Abra o [Swagger](http://127.0.0.1:3000/docs). Cadastre um usuário de teste em
`POST /auth/register` e chame `POST /auth/login` com os mesmos dados. Copie
`data.accessToken` para **Authorize** e chame `GET /auth/me`. A raiz
`GET /` retorna `{"data":{"status":"ok"}}`. Para rodar a API compilada,
use `pnpm --filter @motor/api build` e depois `pnpm start:api`.

5. Em outro terminal, rode os testes unitários e HTTP, os testes de
   persistência e o lint. `pnpm test:api` já inclui a suíte de ponta a ponta.

```bash
pnpm test:api
pnpm test:db
pnpm lint
```

Pare a API com Ctrl+C e encerre o banco com `pnpm db:down`. Consulte as
[rotas da API](apps/api/README.md#rotas) e a
[revisão da Entrega 2](docs/entrega-2.md).

Para abrir o desktop, rode `pnpm dev` após instalar as dependências. Para
conferir os tipos, testes e builds do monorepo, use `pnpm check`.

## Documentação de produto

Estes documentos resumem os requisitos, as jornadas e a arquitetura do produto:

- [Product Requirements Document — PRD](docs/prd.md)
- [Jornadas de usuário](docs/user-flows.md)
- [Tokens de design](docs/design-tokens.md)
- [Software Design Document — Arquitetura](docs/architecture.md)

O [checklist da disciplina](docs/checklist.md) registra os indicadores de cada
entrega. O PRD é a fonte dos critérios de aceite e mostra o estado das histórias.

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

- [Guia de arquitetura do código e regras para novas alterações](docs/arquitetura-do-codigo.md)
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
