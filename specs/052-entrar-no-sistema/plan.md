# Plano — US10 / Issue #52 — Entrar no sistema

Spec de referência: [spec.md](spec.md), aprovada pelo autor no commit `28071a3`.
Este plano foi escrito depois desse commit. Nenhuma tarefa abaixo está
executada quando ele é commitado.

## Decisões técnicas

### Organização

Novo módulo `apps/api/src/auth/`, no mesmo desenho do módulo de doações:

| Camada | Arquivos previstos |
| --- | --- |
| Domínio e aplicação | `application/register-user.ts`, `application/login.ts`, `application/password-hasher.ts` (porta) |
| Portas | `ports/user-repository.ts` |
| Adaptadores | `adapters/prisma/prisma-user-repository.ts`, `adapters/bcrypt/bcrypt-password-hasher.ts`, `adapters/http/auth.controller.ts`, `adapters/http/auth-api-docs.ts` |
| Tranca | `guard/auth.guard.ts`, `guard/public.decorator.ts`, `guard/current-user.decorator.ts` |
| Configuração | `auth-config.ts` (lê e valida `JWT_SECRET`), `auth.module.ts` |

O `PrismaClient` hoje é criado dentro do `DonationsModule`. Ele passa para um
`PrismaModule` global (`src/common/prisma/prisma.module.ts`), usado pelos dois
módulos, sem mudar o comportamento das doações.

### Persistência

```prisma
enum Role {
  SUPPORTER
  ADMIN
}

model User {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  email        String   @unique
  passwordHash String   @map("password_hash")
  role         Role     @default(SUPPORTER)
  createdAt    DateTime @default(dbgenerated("timezone('UTC'::text, CURRENT_TIMESTAMP)")) @map("created_at") @db.Timestamp(3)
  updatedAt    DateTime @default(dbgenerated("timezone('UTC'::text, CURRENT_TIMESTAMP)")) @updatedAt @map("updated_at") @db.Timestamp(3)

  @@map("users")
}
```

A migration cria uma tabela nova e vazia, então não toca em dados existentes.
A relação com `donation_orders` fica para a US11. O SQL gerado é lido antes do
commit, e `test/verify-empty-database.sql` passa a esperar `users`.

### Contrato HTTP

| Rota | Pública | Entrada | Sucesso | Erros |
| --- | --- | --- | --- | --- |
| `POST /auth/register` | sim | `{ email, password }` | `201 { data: { id, email, role, createdAt } }` | `400` validação ou campo extra; `409` e-mail existente |
| `POST /auth/login` | sim | `{ email, password }` | `200 { data: { accessToken, tokenType, expiresIn } }` | `400` validação; `401` "E-mail ou senha inválidos" |
| `GET /auth/me` | não | Bearer | `200 { data: { id, email, role, createdAt } }` | `401` |

A validação usa DTOs com `class-validator` e o `ValidationPipe` global, que já
tem `whitelist` e `forbidNonWhitelisted`. O limite de 72 bytes é conferido por
um validador próprio (`Buffer.byteLength`), não por `MaxLength`, que conta
caracteres. O `409` sai de um erro nomeado da aplicação, e o `P2002` do filtro
global cobre a corrida entre dois cadastros simultâneos.

O login sem enumeração compara com um hash bcrypt fixo, gerado uma vez na
inicialização do módulo, quando o e-mail não existe.

### Tranca

- `AuthGuard` global via `APP_GUARD`, registrado no `AppModule` antes de
  qualquer outro Guard (a US11 acrescenta o `RolesGuard` depois dele).
- `@Public()` em `AuthController.register`, `AuthController.login`,
  `AppController.getHello`, `StripeWebhookController` e
  `DonationsReturnController`.
- `req.user = { sub, role }`; o decorator `@CurrentUser()` entrega isso às rotas.
- `JwtModule.registerAsync` com `ConfigService`. A validação de `JWT_SECRET`
  (presente, com 32 caracteres ou mais) acontece na fábrica, então a aplicação
  falha ao montar o módulo. `signOptions.expiresIn = 7200`, e
  `verifyAsync` usa o mesmo segredo e o algoritmo `HS256`.
- Teste de rotas fechadas: depois de `app.init()`, os caminhos registrados no
  roteador do Express são percorridos (substituindo `:param` por um UUID), e
  qualquer rota fora da lista pública da spec precisa responder `401` sem token.

### Swagger

`DocumentBuilder().addBearerAuth()` e `@ApiBearerAuth()` nos controllers
protegidos (`AuthController.me`, `DonationOrdersController`). Um teste gera o
documento e confere `components.securitySchemes.bearer`, a segurança em
`/auth/me` e a ausência dela em `/auth/login`.

### Desktop

- Novo `apps/desktop/src/main/api-session.ts`: guarda o token em uma variável
  do módulo e expõe `authorizedFetch(path, init)`, o único lugar que anexa
  `Authorization` e trata `401` (descarta o token e avisa a janela pelo canal
  `auth:session-expired`). O `requestDonation` do `index.ts` passa a usar essa
  função.
- Novos canais IPC: `auth:register`, `auth:login`, `auth:logout`,
  `auth:session` (devolve `{ email } | null`) e o evento `auth:session-expired`.
  O renderer nunca recebe o token.
- Renderer: `services/auth.ts` (camada de serviço) e `views/SignInView.vue`.
  A rota `/apoio` ganha um `beforeEnter` que manda para `/entrar` sem sessão.
  Ao receber `auth:session-expired`, o roteador vai para `/entrar` com o aviso.

### Ambiente e CI

`JWT_SECRET` no `apps/api/.env` local (gerado com `openssl rand -base64 48`),
apenas o nome em `.env.example`, e um valor descartável de teste no `env:` do
job em `ci.yml`. Os testes de e2e assinam tokens com um segredo de teste, via
`vi.stubEnv`.

## Tarefas

| # | Tarefa | Critérios |
| --- | --- | --- |
| 1 | Dependências (`@nestjs/jwt`, `bcrypt`, `@types/bcrypt`), `JWT_SECRET` no ambiente e no CI, `PrismaModule` global e `AuthModule` com a validação do segredo | CA10 |
| 2 | Model `User` + enum `Role`, migration lida antes do commit, `verify-empty-database.sql` | CA1 (persistência) |
| 3 | Cadastro: hasher bcrypt, caso de uso, DTO, `POST /auth/register` | CA1, CA2, CA3 |
| 4 | Login: caso de uso sem enumeração, emissão do token, `POST /auth/login` | CA4, CA5 |
| 5 | `AuthGuard` global, `@Public()`, `@CurrentUser()`, `GET /auth/me`, testes negativos, teste de rotas fechadas e ajuste dos e2e de doação para enviar token | CA6, CA7, CA8, CA9 |
| 6 | Swagger com Bearer | CA11 |
| 7 | Desktop main: `api-session.ts`, canais IPC de autenticação, token anexado e 401 tratados num ponto só | CA13, CA14 |
| 8 | Desktop renderer: serviço de auth, tela de entrar/criar conta, proteção da rota `/apoio` e aviso de sessão expirada | CA12, CA14 |
| 9 | Fechamento: PRD (US10 e seção 3), `architecture.md` (validade, onde mora o token, ER), spec da US09 (login), CHANGELOG/índice | — |

## Critérios sem tarefa

Nenhum.
