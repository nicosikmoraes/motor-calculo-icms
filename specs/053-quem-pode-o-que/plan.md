# Plano — US11 / Issue #53 — Quem pode o quê

Spec de referência: [spec.md](spec.md), aprovada pelo autor no commit `891ed9e`.
Este plano foi escrito depois desse commit. Nenhuma tarefa abaixo está
executada quando ele é commitado.

## Decisões técnicas

### Papéis

- `apps/api/src/auth/guard/roles.decorator.ts`: `ROLES_KEY` e `@Roles(...roles)`.
- `apps/api/src/auth/guard/roles.guard.ts`: lê a marca com o `Reflector` (método
  e classe). Sem marca, deixa passar. Com marca, compara `req.user.role` com a
  lista, exatamente, e lança `ForbiddenException('Sem permissão para esta ação')`.
  Se `req.user` não existir numa rota marcada, também responde 403 e nunca 500.
  Isso protege contra uma ordem errada de Guards, que o teste também cobre.
- `AppModule`: `{ provide: APP_GUARD, useClass: RolesGuard }` logo depois do
  `AuthGuard`. Os Guards globais rodam na ordem da lista.

### Dono do pedido

```prisma
model DonationOrder {
  // ...
  userId String? @map("user_id") @db.Uuid
  user   User?   @relation(fields: [userId], references: [id], onDelete: Restrict)
  @@index([userId])
}

model User {
  // ...
  donationOrders DonationOrder[]
}
```

A migration roda sobre uma tabela com dados: a coluna é opcional, não há
`DELETE` nem valor padrão inventado. O SQL gerado é lido antes do commit, e o
falso `ALTER COLUMN "amount"` que o Prisma gerou na US10 é removido de novo se
aparecer. Antes de aplicá-la no banco descartável, um pedido "antigo" é
inserido para conferir que ele sobrevive com `user_id` nulo.

A regra de dono fica no repositório, junto da chave de intenção, na mesma
consulta:

| Porta | Mudança |
| --- | --- |
| `createIntent(input)` | `input.ownerId`; grava `user_id`; se a chave de intenção já pertence a outro dono (ou a um pedido sem dono), lança `DonationIntentTakenError` |
| `getOrderIdByIntentHash(hash, ownerId)` | `AND user_id = ownerId` |
| `getAuthorizedDonation(orderId, hash, ownerId)` | `AND user_id = ownerId` |
| `createRetry({ ..., ownerId })` | `AND user_id = ownerId` |
| `listRecentForAdmin(limit)` | novo: pedidos mais recentes com `LEFT JOIN users` para o e-mail |

Os casos de uso recebem o `ownerId` do controller, que o lê com
`@CurrentUser()`. `DonationIntentTakenError` vira `409` com mensagem própria e
sem dados do pedido existente. Pedido de outra pessoa continua caindo no `null`
que já vira `404`.

### Rota do administrador

`AdminDonationsController` em `apps/api/src/donations/adapters/http/`, com
`GET /admin/donation-orders`, `@Roles('ADMIN')` e `@ApiBearerAuth`, e as
respostas 200, 401 e 403 documentadas. Ela devolve
`{ orderId, amount, currency, status, createdAt, ownerEmail }[]`, os 100 mais
recentes por `created_at`.

### Desktop

- `AuthSession` passa a ser `{ email, role }`, com o papel lido do `/auth/me`.
- Canal `admin:list-donations`: o main chama a rota pela sessão. Um `403` vira
  a mensagem "Sua conta não tem permissão para ver esta página." e não toca na
  sessão; o `401` continua com o tratamento da US10.
- Renderer: `services/admin-donations.ts`, `views/ReceivedDonationsView.vue` e
  a rota `/admin/doacoes` com `meta: { requiresSession: true, requiresRole: 'ADMIN' }`.
- Menu: o `App.vue` lê a sessão (ao montar e depois de entrar ou sair, por um
  pequeno estado compartilhado) e só mostra "Doações recebidas" para `ADMIN`.

> **Registrado depois da implementação.** A rota `/admin/doacoes` usa
> `beforeEnter: requireRole('ADMIN')` e `meta: { requiresSession: true }`; não há
> `requiresRole` no meta, porque a guarda já decide pelo papel e o meta só serve
> para o aviso de sessão expirada saber se tira a pessoa da tela.

## Tarefas

| # | Tarefa | Critérios |
| --- | --- | --- |
| 1 | `@Roles`, `RolesGuard` global depois do `AuthGuard`, testes unitários e de ordem | CA1, CA2 (Guard) |
| 2 | `user_id` em `donation_orders`: schema, migration lida e conferida sobre dados | CA8 |
| 3 | Dono na criação e chave de intenção de outra pessoa (409) | CA4, CA6 |
| 4 | Dono na consulta, no pedido atual e na nova tentativa; pedidos sem dono | CA5, CA7 |
| 5 | `GET /admin/donation-orders` com `@Roles('ADMIN')` e Swagger | CA1, CA2, CA3, CA7, CA11 |
| 6 | Desktop: papel na sessão e menu que respeita o papel | CA9 |
| 7 | Desktop: tela "Doações recebidas" e 403 sem derrubar a sessão | CA9, CA10 |
| 8 | Fechamento: PRD (US11 Live), `architecture.md` (ER com a relação 1:N, decisão sobre o ADMIN e `@Roles`), guias | — |

## Critérios sem tarefa

Nenhum.
