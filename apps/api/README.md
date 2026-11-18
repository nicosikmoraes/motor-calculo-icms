# API do ContabiliNico

As regras para organizar e ampliar o código estão no
[guia de arquitetura do repositório](../../docs/arquitetura-do-codigo.md).

API NestJS para contas de apoiador e doações pelo Stripe. A aplicação fiscal
usa seu próprio banco local.

## Onde encontrar o código

- [`src/http/controllers/`](src/http/controllers/) reúne os controllers por
  área. [`auth/`](src/http/controllers/auth/) cuida de contas e login,
  [`donations/`](src/http/controllers/donations/) reúne pedidos, administração
  de doações, retorno do checkout e webhook Stripe, e
  [`health/`](src/http/controllers/health/) verifica se a API responde.
  O NestJS combina o prefixo em `@Controller(...)` com o caminho em
  `@Get(...)` ou `@Post(...)`. Por exemplo, `@Controller('auth')` e
  `@Post('login')` registram `POST /auth/login`.
- [`src/http/decorators/`](src/http/decorators/) reúne os decorators próprios
  e compartilhados da API (`@Public()`, `@Roles()` e `@CurrentUser()`).
- [`src/http/dto/`](src/http/dto/) agrupa os formatos de entrada e resposta
  em `auth/` e `donations/`. O formato de erro compartilhado fica na raiz
  dos DTOs. Filtros, interceptores e configuração do Swagger ficam em `src/http/`.
- [`src/auth/`](src/auth/) e [`src/donations/`](src/donations/) guardam casos de
  uso, portas e adaptadores para serviços externos. Os módulos NestJS ligam
  seus controllers a essas dependências.
- [`donations/adapters/prisma/queries/`](src/donations/adapters/prisma/queries/)
  reúne as consultas de pedidos e a listagem administrativa. As leituras que
  precisam ocorrer na transação de escrita ficam no respectivo repositório.
- O [adaptador do webhook](src/donations/adapters/stripe/stripe-webhook.adapter.ts)
  confere a assinatura sobre o corpo bruto e traduz o evento. O
  [caso de uso](src/donations/application/handle-payment-event.ts) decide se
  deve registrar recusa, expiração ou confirmação a partir dos dados verificados.
- [`test/unit/`](test/unit/) guarda testes unitários e de arquitetura,
  [`test/e2e/`](test/e2e/) testa a API via HTTP e [`test/db/`](test/db/) usa
  PostgreSQL. Os utilitários de teste ficam em [`test/support/`](test/support/).

## Rotas

Com a API rodando, abra o [Swagger em `/docs`](http://127.0.0.1:3000/docs)
para consultar as rotas e os formatos de entrada e resposta.

| Método e caminho | Acesso | O que faz |
| --- | --- | --- |
| `GET /` | Público | Confirma que o processo responde com `{ "data": { "status": "ok" } }`. |
| `POST /auth/register` | Público | Cria conta de apoiador. |
| `POST /auth/login` | Público | Emite token JWT. |
| `GET /auth/me` | Autenticado | Consulta a conta do usuário atual. |
| `POST /donation-drafts` | Autenticado | Cria um rascunho para a conta atual. |
| `GET /donation-drafts` | Autenticado | Lista os rascunhos da conta atual. |
| `GET /donation-drafts/:id` | Dono | Consulta um rascunho. |
| `PATCH /donation-drafts/:id` | Dono | Atualiza o valor de um rascunho. |
| `DELETE /donation-drafts/:id` | Dono | Exclui um rascunho e retorna 204 sem corpo. |
| `POST /donation-orders` | Autenticado | Cria pedido e abre o checkout. |
| `GET /donation-orders/current` | Dono | Consulta o pedido pela chave de intenção. |
| `GET /donation-orders/:id` | Dono | Consulta o pedido pelo ID e pela chave de intenção. |
| `POST /donation-orders/:id/attempts` | Dono | Retoma ou abre outra tentativa de pagamento. |
| `GET /admin/donation-orders` | Administrador | Lista doações para usuários com papel `ADMIN`. |
| `POST /webhooks/stripe` | Stripe, com assinatura | Recebe eventos do gateway. |
| `GET /donations/return` | Público | Exibe em HTML o retorno do checkout. |

Envie `Authorization: Bearer <token>` nas rotas autenticadas, de dono e de
administrador. A consulta de saúde em `GET /` verifica apenas o processo HTTP.

Criação e edição de rascunhos recebem apenas `{ "amount": "25.00" }`. O
valor é uma string decimal com duas casas, em BRL. Um rascunho de outra
conta responde 404. O fluxo de pagamento usa as rotas de pedidos.

## Desenvolvimento

Este pacote pertence ao monorepo pnpm existente. Execute os comandos na raiz:

```bash
pnpm install --frozen-lockfile
cp apps/api/.env.example apps/api/.env   # e preencha JWT_SECRET (openssl rand -base64 48)
pnpm db:up
pnpm db:validate
pnpm --filter @motor/api prisma:generate
pnpm --filter @motor/api prisma:migrate-deploy
pnpm --filter @motor/api prisma:check-db
pnpm test:api
pnpm test:db
pnpm dev:api
```

A API usa `127.0.0.1:3000`; o PostgreSQL 16 local usa `127.0.0.1:5433`.
O `.env` é privado, e `.env.example` contém apenas a configuração descartável
compatível com o Compose de desenvolvimento.

O scaffold foi criado pelo `@nestjs/cli` 12.0.10 em ESM, sem Git interno,
instalação própria ou NestJS Observe. A API usa TypeScript 6, Vitest 4 e Oxlint;
o desktop conserva seu TypeScript 5.9 e Vitest 3. SWC preserva nos testes os
metadados de decorators usados na injeção de dependências.

`prisma/schema.prisma` define os modelos de persistência de doações e
`prisma.config.ts` carrega `dotenv/config`. O cliente Prisma é gerado em
`apps/api/src/generated/prisma`, caminho ignorado pelo Git. Os testes HTTP não
exigem banco. Os testes de banco são explícitos para não tornar o app fiscal
dependente da API.

Os [testes de arquitetura](test/unit/api-boundary.spec.ts) verificam a separação
entre API e desktop fiscal e mantêm casos de uso, domínio e portas independentes
da infraestrutura HTTP, do NestJS, do Stripe e do Prisma. O SQLite, os XMLs e
o motor fiscal ficam no desktop.

Veja a [arquitetura](../../docs/architecture.md) e o
[registro da Atividade 08](../../docs/atividade-08.md).
