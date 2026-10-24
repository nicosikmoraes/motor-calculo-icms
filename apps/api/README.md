# API do ContabiliNico

Scaffold NestJS isolado, reservado ao serviço de doações e pagamentos.
O `GET /` responde `Hello World!`. Ainda não há entidades, migrations,
operações de pagamento, gateway ou acesso a documentos fiscais.

Este pacote pertence ao monorepo pnpm existente. Execute os comandos na raiz:

```bash
pnpm install --frozen-lockfile
cp apps/api/.env.example apps/api/.env
pnpm db:up
pnpm db:validate
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

`prisma/schema.prisma` permanece sem modelos; `prisma.config.ts` carrega
`dotenv/config`. O cliente Prisma terá saída em `generated/prisma`, ignorada pelo
Git, quando existir o primeiro modelo aprovado. Os testes HTTP não exigem banco.
Os testes de banco são explícitos para não tornar o app fiscal dependente da API.

A evolução seguirá domínio, casos de uso, portas e adaptadores dentro deste
serviço. Contratos de pagamento compartilhados só nascerão com a primeira
história aprovada. A API não importa pacotes fiscais; esse limite tem teste
automatizado. O SQLite, os XMLs e o motor fiscal continuam locais no desktop.

Veja a [arquitetura](../../docs/architecture.md) e o
[registro da Atividade 08](../../docs/atividade-08.md).
