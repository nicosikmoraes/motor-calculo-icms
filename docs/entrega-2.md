# Revisão da Entrega 2 · Backend e TDD

A revisão cobre as histórias US09 (doação), US10 (login), US11 (papéis e dono
do pedido) e US12 (CRUD de rascunhos de doação). As quatro estão na `main`.
A [PR da US12](https://github.com/nicosikmoraes/motor-calculo-icms/pull/58) registra a integração. Os links de código
apontam para a tag `entrega-2`.

## Conferência do ambiente

- Clone novo da `main` em `7d7220b`. Dependências instaladas com Node 24.21.0
  e pnpm 10.32.1 via `pnpm install --frozen-lockfile`.
- Nesta máquina, o banco descartável foi PostgreSQL 18 nativo. Aplicaram-se as
  cinco migrations, e passaram a validação do schema, a geração do cliente,
  a verificação do banco, o build e o lint. A esteira da PR #56 também passou
  no ambiente PostgreSQL 16 em contêiner.
- Suítes locais da API no clone inicial: **23 testes unitários, 133 HTTP e 41 de
  persistência** aprovados. Na US12, passaram **23 testes unitários, 134 HTTP
  e 46 de persistência**. Confirme o roteiro com Docker Compose antes de fixar
  a entrega.
- API compilada: Swagger com 11 caminhos e Bearer JWT. Cadastro válido
  retornou 201, cadastro inválido retornou 400 e o login retornou token.
  `GET /auth/me` retornou 401 sem token e 200 com token. A listagem
  administrativa retornou 403 para apoiador e 200 para ADMIN.

## Mapa dos 12 indicadores

| ID | Evidência no ContabiliNico |
| --- | --- |
| ID2 | [Workspaces do pnpm](https://github.com/nicosikmoraes/motor-calculo-icms/blob/entrega-2/pnpm-workspace.yaml#L1-L3), [API](https://github.com/nicosikmoraes/motor-calculo-icms/blob/entrega-2/apps/api/package.json#L1-L8) e [desktop Vue/Electron](https://github.com/nicosikmoraes/motor-calculo-icms/blob/entrega-2/apps/desktop/package.json#L1-L10). |
| ID4 | [Commits da US12](https://github.com/nicosikmoraes/motor-calculo-icms/pull/58/commits) e [plano com link da aprovação](https://github.com/nicosikmoraes/motor-calculo-icms/blob/entrega-2/specs/057-rascunhos-de-doacao/plan.md#L1-L4). O rascunho, a aprovação e o plano vieram antes do teste e do código. |
| ID5 | [PRs mesclados na main](https://github.com/nicosikmoraes/motor-calculo-icms/pulls?q=is%3Apr+is%3Amerged+base%3Amain), com as branches de história da [US09](https://github.com/nicosikmoraes/motor-calculo-icms/pull/47), [US10](https://github.com/nicosikmoraes/motor-calculo-icms/pull/54) [US11](https://github.com/nicosikmoraes/motor-calculo-icms/pull/55) e [US12](https://github.com/nicosikmoraes/motor-calculo-icms/pull/58). |
| ID6 | [Controller de cadastro](https://github.com/nicosikmoraes/motor-calculo-icms/blob/entrega-2/apps/api/src/http/controllers/auth/auth.controller.ts#L25-L38) → [caso de uso](https://github.com/nicosikmoraes/motor-calculo-icms/blob/entrega-2/apps/api/src/auth/application/register-user.ts#L10-L19) e [composição do módulo](https://github.com/nicosikmoraes/motor-calculo-icms/blob/entrega-2/apps/api/src/auth/auth.module.ts#L29-L34). |
| ID7 | [DTO de cadastro](https://github.com/nicosikmoraes/motor-calculo-icms/blob/entrega-2/apps/api/src/http/dto/auth/register-request.dto.ts#L24-L36) e [ValidationPipe global](https://github.com/nicosikmoraes/motor-calculo-icms/blob/entrega-2/apps/api/src/app.module.ts#L23-L24). |
| ID8 | [Relação User 1:N DonationDraft](https://github.com/nicosikmoraes/motor-calculo-icms/blob/entrega-2/apps/api/prisma/schema.prisma#L132-L147), [listagem pela relação Prisma](https://github.com/nicosikmoraes/motor-calculo-icms/blob/entrega-2/apps/api/src/donation-drafts/adapters/prisma/queries/prisma-donation-draft-queries.ts#L8-L24), [criação, atualização e exclusão por dono](https://github.com/nicosikmoraes/motor-calculo-icms/blob/entrega-2/apps/api/src/donation-drafts/adapters/prisma/prisma-donation-draft-store.ts#L8-L31) e [teste HTTP com PostgreSQL](https://github.com/nicosikmoraes/motor-calculo-icms/blob/entrega-2/apps/api/test/db/donation-drafts.db-spec.ts#L55-L117). |
| ID9 | [Guards globais](https://github.com/nicosikmoraes/motor-calculo-icms/blob/entrega-2/apps/api/src/app.module.ts#L19-L22), [emissão do JWT](https://github.com/nicosikmoraes/motor-calculo-icms/blob/entrega-2/apps/api/src/auth/application/login.ts#L29-L37) e [rota reservada a ADMIN](https://github.com/nicosikmoraes/motor-calculo-icms/blob/entrega-2/apps/api/src/http/controllers/donations/admin-donations.controller.ts#L13-L22). |
| ID10 | [Providers globais](https://github.com/nicosikmoraes/motor-calculo-icms/blob/entrega-2/apps/api/src/app.module.ts#L24-L26), [envelope de sucesso](https://github.com/nicosikmoraes/motor-calculo-icms/blob/entrega-2/apps/api/src/http/interceptors/transform.interceptor.ts#L10-L19) e [filtro de erros](https://github.com/nicosikmoraes/motor-calculo-icms/blob/entrega-2/apps/api/src/http/filters/all-exceptions.filter.ts#L29-L62). |
| ID11 | [Teste primeiro no plano da US12](https://github.com/nicosikmoraes/motor-calculo-icms/blob/entrega-2/specs/057-rascunhos-de-doacao/plan.md#L6-L16), [teste de CRUD com propriedade](https://github.com/nicosikmoraes/motor-calculo-icms/blob/entrega-2/apps/api/test/db/donation-drafts.db-spec.ts#L55-L117), [commit RED](https://github.com/nicosikmoraes/motor-calculo-icms/commit/556d3f0ba57c2fcd7df99e01492ee51a9cd5c034) e [commit GREEN](https://github.com/nicosikmoraes/motor-calculo-icms/commit/f8ab88647b0efd9e57086011f7ddf02aca0945b6). |
| ID12 | [Cadastro 201 e recusa 400](https://github.com/nicosikmoraes/motor-calculo-icms/blob/entrega-2/apps/api/test/e2e/auth.register.e2e-spec.ts#L26-L53), [ADMIN 200, apoiador 403 e sem token 401](https://github.com/nicosikmoraes/motor-calculo-icms/blob/entrega-2/apps/api/test/e2e/admin.donations.e2e-spec.ts#L31-L56) e [CI aprovado](https://github.com/nicosikmoraes/motor-calculo-icms/actions/runs/44388501298). |
| ID13 | [Triagem da revisão independente da US12](https://github.com/nicosikmoraes/motor-calculo-icms/blob/entrega-2/specs/057-rascunhos-de-doacao/reviews/revisao-final.md#L3-L14) e [decisões na PR #58](https://github.com/nicosikmoraes/motor-calculo-icms/pull/58#apontamentos). |
| ID14 | [Configuração OpenAPI e Bearer JWT](https://github.com/nicosikmoraes/motor-calculo-icms/blob/entrega-2/apps/api/src/http/openapi.ts#L5-L14) e [Swagger em /docs](https://github.com/nicosikmoraes/motor-calculo-icms/blob/entrega-2/apps/api/src/main.ts#L6-L14). |

## Tópicos para o ensaio individual

1. **API rodando.** Tag e quadro, PostgreSQL e API iniciados, Swagger,
   login e Authorize, relação 1:N, exemplos 400, 401 e 403 e suíte verde.
2. **Histórico.** Spec e plano da US10 ou US11, teste de persistência e
   registro RED/GREEN da US12 e triagem do teste de PATCH inválido.
3. **Defesa.** Anuncie cada ID. Explique com suas palavras o conceito, a
   escolha no projeto, o trecho de código e o que muda ao retirar esse trecho.

| ID | Demonstração para ensaiar |
| --- | --- |
| ID2, ID4, ID5 | Workspace e builds separados, sequência spec → aprovação → plano → tarefas, PRs para a `main`. Explique o que se perde se pular cada etapa. |
| ID6 | Cadastro pela API. Retire temporariamente o provider de `RegisterUser` e veja o erro de resolução de dependência ao iniciar. |
| ID7 | Envie campo extra no cadastro, veja 400 e repita em um clone de ensaio com `forbidNonWhitelisted` desligado. |
| ID8 | Crie dois rascunhos na mesma conta, liste, edite um deles, exclua um deles e consulte o excluído. Mostre o filtro por dono com a segunda conta e a 1:N no schema. |
| ID9 | Chame a listagem administrativa sem token (401), com apoiador (403) e com ADMIN (200). No clone de ensaio, retire temporariamente `@Roles('ADMIN')` e repita com apoiador. |
| ID10 | Compare `{ data }` e `{ error }` no cadastro. Retire o provider do filtro no clone de ensaio e compare o corpo do erro. |
| ID11, ID12 | Mostre o teste ligado à regra no plano e a execução da suíte. No clone de ensaio, remova temporariamente a checagem do papel e observe o teste de 403 falhar. |
| ID13 | Explique por que o PATCH inválido precisa mirar um rascunho existente e o que a leitura posterior comprova. |
| ID14 | Abra `/docs`, mostre os DTOs de cadastro, as respostas e o botão Authorize. Remova temporariamente `.addBearerAuth()` e observe a mudança na documentação. |

Faça as alterações de ensaio em um clone com dados descartáveis. Desfaça cada
alteração após demonstrá-la e confira `git status --short`.
