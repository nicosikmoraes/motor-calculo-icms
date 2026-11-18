# Plano da US12 · Rascunhos de doação

A [spec](spec.md) da [Issue #57](https://github.com/nicosikmoraes/motor-calculo-icms/issues/57)
foi aprovada antes deste plano. [Commit de aprovação](https://github.com/nicosikmoraes/motor-calculo-icms/commit/3070482c652aee924b8f57de7dc5963b51edcb00).

## 1. Contrato e testes primeiro

- **Teste primeiro (CA1–CA7).** Usar Supertest com Nest e PostgreSQL
  descartável para percorrer as cinco rotas. Criar duas contas e rascunhos
  ligados à primeira. Conferir criação, listagem, consulta, atualização e
  exclusão, o escopo por dono, o 401 sem token e o 400 de validação.
  Manter um pedido com tentativa como controle da exclusão.
- **Teste primeiro (documentação).** Conferir no OpenAPI as cinco operações,
  o esquema Bearer, a entrada monetária e as respostas com e sem corpo.
- Guardar o resultado RED em commit separado da implementação. Depois
  da migration e da implementação, executar a mesma suíte e registrar GREEN.

## 2. Persistência e aplicação

- Acrescentar apenas a tabela `donation_drafts`, com UUID, FK obrigatória para
  `users`, índice da listagem, timestamps e `decimal(12,2)` positivo.
  Atualizar as verificações das tabelas que pertencem à API e conferir a
  aplicação da migration sobre uma base com contas e pagamentos.
- Criar o módulo `donation-drafts` com orquestração em `application/`,
  contrato de persistência em `ports/` e implementação em
  `adapters/prisma/`. Ler os rascunhos pela relação de `User` e aplicar
  o filtro por ID e dono na mesma consulta que altera ou exclui o registro.
- Conservar os valores como texto decimal nas respostas. O adaptador mapeia
  o tipo decimal do Prisma e traduz os casos de registro inexistente.

## 3. Fronteira HTTP e composição

- Em `src/http`, agrupar controller e DTO da funcionalidade. Reusar
  `@CurrentUser()`, Guard e ValidationPipe globais e registrar respostas no
  Swagger. Traduzir rascunho inexistente para 404 e conta ausente para 401.
- Documentar as rotas no README da API e seguir o formato global de sucesso
  e erro. O DELETE devolve 204 com corpo vazio.

## 4. Validação e revisão

- Rodar lint, tipagem, build e as suítes unitária, HTTP e PostgreSQL. Conferir
  os mesmos comandos no CI da PR.
- Registrar pareceres independentes de código e conformidade e a decisão
  sobre cada apontamento. Atualizar o PRD, o índice de specs e o mapa da
  Entrega 2 conforme o estado confirmado da história.
