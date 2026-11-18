---
issue: 53
status: implementada
---

# US11 — Quem pode o quê

Fonte: Atividade 13 (JWT, Guards e papéis), segunda metade do corte natural.
Depende da [US10](../052-entrar-no-sistema/spec.md), já mesclada: contas,
token com `sub` e `role` e o `AuthGuard` global.

## O problema

Depois da US10, a API sabe **quem** está chamando, mas não decide **o que**
cada pessoa pode fazer. Qualquer conta autenticada que tenha a chave de
intenção alcança o pedido de doação, porque o pedido não tem dono. Também não
existe área do mantenedor: ninguém consegue ver as doações recebidas sem abrir
o banco.

## A história

**Como** mantenedor do projeto, **eu quero** que cada papel só alcance o que
lhe cabe **para que** um apoiador nunca veja nem altere a doação de outro e só
o administrador consulte todas.

## Decisões desta especificação

- **Dois Guards em sequência.** O `AuthGuard` (US10) responde "quem é você"
  (401). O `RolesGuard`, registrado logo depois dele na lista de `APP_GUARD`,
  responde "você pode" (403). O papel vem do token: rebaixar um administrador
  só vale quando o token dele expira, em no máximo 2 horas.
- **Comparação exata de papel.** `@Roles(Role.ADMIN)` deixa passar só `ADMIN`.
  Nenhuma rota usa `@Roles(SUPPORTER)`: as rotas de doação não exigem papel,
  valem para qualquer pessoa autenticada e são protegidas pela regra de dono.
  Por isso o administrador também pode doar e ver as próprias doações.
- **Rota sem `@Roles` continua aberta a qualquer pessoa autenticada.** Estar
  logado é o padrão exigido; ter um papel específico é a exceção declarada.
- **Regra de dono: relação 1:N.** Um usuário tem muitos pedidos, e cada pedido
  é de no máximo um usuário (`donation_orders.user_id`). Criar um pedido grava
  o dono a partir do token, nunca do corpo. Consultar ou retomar exige a chave
  de intenção **e** que o pedido seja de quem chama.
- **Pedido de outra pessoa responde 404**, a mesma resposta de pedido
  inexistente e de chave errada que a US09 já usa. Responder 403 revelaria que
  o pedido existe. O 403 desta história é o do papel.
- **Pedidos antigos ficam sem dono.** A coluna entra como opcional, porque a
  tabela já tem linhas. A migration não apaga nem inventa dono. Pedidos sem dono
  só aparecem na lista do administrador.
- **A lista do administrador mostra o e-mail do dono.** É o dado de que o
  mantenedor precisa para agradecer ou conciliar uma doação, e só o `ADMIN` o
  vê. Pedidos sem dono aparecem com `ownerEmail: null`.
- **No desktop, o menu respeita o papel.** A sessão passa a carregar o papel
  (`{ email, role }`), e o item "Doações recebidas" só aparece para `ADMIN`.
  Esconder o item é conveniência: quem protege é o `RolesGuard`.
- **Não existe rota para promover administrador.** O primeiro `ADMIN` continua
  sendo promovido à mão, no banco (Prisma Studio), como na US10.

## Critérios de aceite

1. **Dado** um token de `SUPPORTER`, **quando** a pessoa chama
   `GET /admin/donation-orders`, **então** a API responde `403` com
   `{ error: { statusCode: 403, message: "Sem permissão para esta ação" } }`, e
   a rota não executa.
2. **Dado** nenhum token, ou um token inválido, **quando** alguém chama
   `GET /admin/donation-orders`, **então** a resposta é `401`, nunca `403` nem
   `500`.
3. **Dado** um token de `ADMIN`, **quando** ele chama
   `GET /admin/donation-orders`, **então** a API responde `200` com os 100
   pedidos mais recentes, cada um com `orderId`, `amount`, `currency`, `status`,
   `createdAt` e `ownerEmail` (que é `null` para pedido sem dono), sem hash de
   senha, chave de intenção nem dado de cartão.
4. **Dado** uma pessoa autenticada, **quando** ela cria um pedido de doação,
   **então** o pedido é gravado com `user_id` igual ao `sub` do token, e nenhum
   campo do corpo consegue definir outro dono.
5. **Dado** um pedido de A, **quando** B chama `GET /donation-orders/:id`,
   `GET /donation-orders/current` ou `POST /donation-orders/:id/attempts`,
   mesmo com a chave de intenção certa, **então** a resposta é `404`, nada muda
   no pedido e nenhuma chamada ao Stripe acontece.
6. **Dado** uma chave de intenção já usada por um pedido de A, **quando** B
   tenta criar um pedido com ela, **então** a API responde `409`, sem devolver
   nenhum dado do pedido de A e sem criar outro.
7. **Dado** um pedido antigo sem dono, **quando** qualquer apoiador o consulta
   ou retoma, **então** recebe `404`, e o pedido aparece na lista do
   administrador com `ownerEmail: null`.
8. **Dado** um banco com pedidos já existentes, **quando** a migration roda,
   **então** ela acrescenta `user_id` opcional com chave estrangeira para
   `users` (sem apagar em cascata) e um índice, e todas as linhas antigas
   continuam lá, com `user_id` nulo.
9. **Dado** o desktop com sessão de `SUPPORTER`, **quando** a pessoa olha o
   menu, **então** não existe o item "Doações recebidas"; com sessão de
   `ADMIN`, o item aparece e leva à lista.
10. **Dado** a tela "Doações recebidas", **quando** a API responde `403` (por
    exemplo, o papel foi rebaixado e um token novo foi emitido), **então** a
    tela mostra "Sua conta não tem permissão para ver esta página." e a sessão
    continua aberta. O `403` não é tratado como sessão expirada.
11. **Dado** a página `/docs`, **quando** ela é aberta, **então** a rota de
    administrador aparece com cadeado e com as respostas `401` e `403`
    documentadas.

## Fora de escopo

- Rota ou tela para promover ou rebaixar papéis.
- Paginação, filtros e exportação da lista do administrador.
- Reembolso, cancelamento ou edição de pedidos pelo administrador.
- Atribuir dono aos pedidos antigos.
- Consultar o banco a cada requisição para pegar o papel atual (a troca
  "efeito imediato x autenticação sem estado" fica registrada no
  `architecture.md`).

## Dúvidas em aberto

Nenhuma.
