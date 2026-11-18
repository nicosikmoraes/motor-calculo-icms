---
issue: 57
status: aprovada
---

# US12 — Gerenciar rascunhos de doação

Issue [#57](https://github.com/nicosikmoraes/motor-calculo-icms/issues/57).
Depende da autenticação da US10 e segue a regra de propriedade da US11.
Aprovada pelo autor em 18/11/2026.

## História

Como apoiador autenticado, quero guardar e organizar propostas de doação antes
de abrir o checkout, para poder revisar quanto pretendo doar e descartar os
rascunhos que perdi o interesse em usar.

## Comportamento

- Uma conta pode ter vários rascunhos. Cada rascunho tem um único dono,
  identificador, valor em BRL e datas de criação e atualização.
- O dono vem do identificador do usuário autenticado. A API permite acesso
  aos próprios rascunhos para os papéis `SUPPORTER` e `ADMIN`.
- O único dado enviado para criar ou editar é `amount`, uma string decimal
  com ponto e duas casas, como `"25.00"`. O intervalo proposto é de
  `"0.01"` a `"9999999999.99"`, representável por `Decimal(12,2)`, para
  armazenar centavos com exatidão. A moeda é sempre `BRL`. As regras de
  aceitação do gateway serão aplicadas quando houver abertura de checkout.
- A listagem da conta traz os rascunhos relacionados, do mais recente para o
  mais antigo. Empates na data de criação usam o identificador para manter
  a ordem estável. Uma conta sem rascunhos recebe uma lista vazia.
- Excluir remove o rascunho da base. Pedidos de doação e tentativas de
  pagamento têm ciclo de vida próprio e são preservados.
- O contrato pertence à API. Conversão de rascunho em pedido, integração
  com Stripe ou webhook e tela de rascunhos ficam fora da US12.

## Contrato HTTP

| Rota | Entrada | Resultado |
| --- | --- | --- |
| `POST /donation-drafts` | `{ "amount": "25.00" }` | 201 com o rascunho criado |
| `GET /donation-drafts` | JWT | 200 com a lista da conta autenticada |
| `GET /donation-drafts/:id` | ID UUID | 200 com o rascunho da conta |
| `PATCH /donation-drafts/:id` | ID UUID e `{ "amount": "40.00" }` | 200 com o rascunho atualizado |
| `DELETE /donation-drafts/:id` | ID UUID | 204 com corpo vazio |

Respostas de leitura e gravação usam o envelope global `{ data: ... }`. Cada
rascunho público traz `id`, `amount`, `currency`, `createdAt` e `updatedAt`.
Erros usam `{ error: ... }`. As rotas devem aparecer no Swagger com Bearer JWT.

## Critérios de aceite

1. Duas criações com token da mesma conta retornam 201 com IDs diferentes.
   A persistência associa ambos os registros à conta via chave estrangeira.
2. A listagem consulta a relação da conta com seus rascunhos pelo Prisma e
   inclui somente os dois registros da própria conta. A consulta pelo ID de
   cada um retorna o mesmo valor e a moeda BRL. A lista de outra conta começa
   vazia.
3. Alterar um rascunho retorna 200 e muda somente seu valor e a data de
   atualização. Uma leitura posterior devolve o novo valor.
4. Excluir um rascunho retorna 204. Consulta, edição e nova exclusão desse ID
   retornam 404. O outro rascunho e os registros de pagamento são preservados.
5. Acessar qualquer rota sem token válido retorna 401. Consultar, alterar ou
   excluir um UUID de outra conta retorna 404, inclusive com papel `ADMIN`,
   e o registro continua acessível ao dono.
6. Um valor fora do contrato, corpo sem valor ou campo extra (inclusive
   `userId` ou `currency`) retorna 400 sem gravar alterações. Um ID com
   formato inválido retorna 400.
7. A migration adiciona a relação `User 1:N DonationDraft` a um banco que já
   tem contas e pedidos. Uma escrita com dono inexistente é recusada pelo
   banco. Os fluxos da US09–US11 continuam verdes no CI.

## Evidência para o ID8

Criar dois rascunhos ligados à conta A, listá-los pela relação em Prisma,
alterar o primeiro, excluir o segundo e repetir a consulta dele. Mostrar
que a conta B não lista nem consegue agir sobre os rascunhos da conta A.
Apontar no mapa a relação no schema, o repositório Prisma e os testes de
persistência. Antes da implementação, aprovar esta spec e registrar o plano
com os testes que devem ficar vermelhos primeiro.
