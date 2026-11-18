---
issue: 52
status: implementada
---

# US10 — Entrar no sistema

Fonte: Atividade 13 (JWT, Guards e papéis), primeira metade do corte natural.
A segunda metade, **US11 — Quem pode o quê** (papéis com 403, regra de dono,
`userId` nos pedidos de doação e menu por papel), é outra Issue e outra spec.
Recorte técnico existente: [arquitetura](../../docs/architecture.md) e
[US09](../012-fazer-doacao-stripe/spec.md).

## O problema

A API de doações não sabe quem está chamando. Quem tem a chave de intenção
consulta e retoma o pedido, e qualquer rota nova nasce aberta. Sem identidade
não existe dono de um pedido nem área do mantenedor, e esquecer de proteger
uma rota não aparece em lugar nenhum.

## A história

**Como** apoiador do projeto, **eu quero** criar uma conta e entrar no
ContabiliNico **para que** as minhas doações fiquem ligadas a mim e só eu
consiga consultá-las.

A ligação entre pedido e dono é entregue na US11. Esta história entrega a
identidade: cadastro, login, token e a tranca global da API.

## Decisões desta especificação

- **Autenticação sem estado com JWT** (`@nestjs/jwt`). O conteúdo do token é
  só `sub` (id do usuário), `role`, `iat` e `exp`. Nada sigiloso viaja nele.
- **Validade de 2 horas.** O desktop guarda o token só em memória e a sessão
  dura no máximo um dia de uso. Duas horas evitam derrubar quem está doando no
  meio do Checkout e limitam a 2 h o tempo em que um papel rebaixado (US11)
  continua valendo. Não há refresh token nem logout no servidor; sair no
  aplicativo descarta o token local.
- **Senha em hash bcrypt, custo 12.** O campo se chama `passwordHash`. A senha
  precisa ter de 8 a 72 bytes em UTF-8, porque o bcrypt ignora o que passa de 72.
- **E-mail normalizado** (sem espaços nas pontas, em minúsculas) antes de
  gravar e de buscar. A unicidade é sobre o valor normalizado.
- **Papel fixado no servidor.** Todo cadastro nasce `SUPPORTER`. O enum `Role`
  já nasce com `SUPPORTER` e `ADMIN`; o primeiro `ADMIN` é promovido à mão, no
  banco. Nenhuma rota promove ninguém.
- **Seguro por padrão.** O Guard de autenticação é global (`APP_GUARD`). As
  rotas públicas são marcadas uma a uma com `@Public()`: cadastro, login,
  webhook do Stripe, página de retorno do Checkout e `GET /` (sinal de vida).
  A página `/docs` do Swagger não é rota de controller e continua acessível.
- **Login sem enumeração.** E-mail inexistente e senha errada recebem a mesma
  resposta, e o caminho do e-mail inexistente também executa uma comparação
  bcrypt contra um hash fixo, para que o tempo não entregue a diferença.
- **Segredo só no ambiente.** `JWT_SECRET` vem do `.env` via `ConfigModule`
  (`JwtModule.registerAsync`), sem valor de reserva no código. Sem a variável,
  ou com menos de 32 caracteres, a API não sobe.
- **No desktop, o login só é exigido para o que usa a API.** O processamento
  fiscal é local e continua funcionando sem conta e sem rede. A tela "Apoiar o
  projeto" passa a pedir login.
- **O token mora no processo main do Electron, em memória.** As chamadas à API
  já saem do main (`apps/desktop/src/main`), então o token nunca chega ao
  JavaScript da tela, e um XSS no renderer não o alcança. Fechar o aplicativo
  exige entrar de novo. O renderer só sabe se há sessão e qual é o e-mail.

## Critérios de aceite

1. **Dado** um e-mail ainda não cadastrado e uma senha de 8 a 72 bytes,
   **quando** a pessoa chama `POST /auth/register`, **então** a API responde
   `201` com `{ data: { id, email, role: "SUPPORTER", createdAt } }`, a resposta
   não contém `passwordHash` nem `password`, e o banco guarda um hash bcrypt,
   nunca a senha.
2. **Dado** um e-mail já cadastrado, mesmo com maiúsculas ou espaços diferentes,
   **quando** alguém tenta cadastrá-lo de novo, **então** a API responde `409`
   e nenhum usuário novo é criado.
3. **Dado** um corpo com e-mail inválido, senha curta demais ou longa demais, ou
   com qualquer campo além de `email` e `password` (incluindo `role`),
   **quando** chega a `POST /auth/register`, **então** a API responde `400`
   indicando o problema, e nada é gravado.
4. **Dado** um e-mail e a senha correta, **quando** a pessoa chama
   `POST /auth/login`, **então** a API responde `200` com
   `{ data: { accessToken, tokenType: "Bearer", expiresIn: 7200 } }`, e o
   conteúdo do token tem só `sub`, `role`, `iat` e `exp`, com `exp − iat = 7200`.
5. **Dado** uma senha errada para um e-mail existente, ou um e-mail que não
   existe, **quando** a pessoa chama `POST /auth/login`, **então** as duas
   respostas são `401` com a mesma mensagem ("E-mail ou senha inválidos"), e
   nos dois casos uma comparação bcrypt é executada.
6. **Dado** uma rota protegida, **quando** ela é chamada sem o cabeçalho
   `Authorization`, com outro esquema que não `Bearer` ou com `Bearer` vazio,
   **então** a API responde `401` e o controller não executa.
7. **Dado** um token com um caractere trocado, assinado com outro segredo ou já
   expirado, **quando** ele é enviado a uma rota protegida, **então** a API
   responde `401`.
8. **Dado** um token válido, **quando** a pessoa chama `GET /auth/me`, **então**
   a API responde `200` com `{ id, email, role, createdAt }` de quem está
   chamando, sem `passwordHash`.
9. **Dado** qualquer rota registrada na API que não esteja na lista de rotas
   públicas desta spec, **quando** ela é chamada sem token, **então** responde
   `401`. Um teste percorre as rotas registradas, de modo que uma rota nova sem
   `@Public()` nasce fechada e uma rota pública não declarada aqui quebra o teste.
10. **Dado** um ambiente sem `JWT_SECRET`, ou com ele menor que 32 caracteres,
    **quando** a API inicia, **então** a inicialização falha com mensagem que
    nomeia a variável, sem assinar nada com um valor de reserva.
11. **Dado** a página `/docs`, **quando** ela é aberta, **então** existe o botão
    **Authorize** (esquema Bearer), as rotas protegidas aparecem com cadeado e
    as rotas de cadastro e login aparecem sem.
12. **Dado** o desktop sem sessão, **quando** a pessoa abre "Apoiar o projeto",
    **então** vê a tela de entrar (com a opção de criar conta) e, depois de
    entrar, a tela de doação. As telas fiscais continuam acessíveis sem conta.
13. **Dado** uma sessão no desktop, **quando** qualquer chamada à API sai do
    aplicativo, **então** o cabeçalho `Authorization: Bearer <token>` é anexado
    num único ponto do processo main, e o token nunca é enviado ao renderer.
14. **Dado** uma sessão cujo token expirou ou foi recusado, **quando** a API
    responde `401` a uma chamada do desktop, **então** esse mesmo ponto descarta
    o token, e a tela volta para "entrar" com o aviso "Sua sessão expirou.
    Entre de novo.", em vez de mostrar uma tela vazia.

## Fora de escopo

- Papéis com `403`, `@Roles()`, rota de administrador e menu por papel (US11).
- `userId` em `donation_orders`, regra de dono e migration sobre dados (US11).
- Refresh token, logout no servidor, lista de tokens revogados.
- Recuperação de senha, confirmação de e-mail, troca de senha.
- Limite de tentativas de login (`@nestjs/throttler`): é um extra, fica anotado
  para a Atividade 15.
- Login para as funções fiscais locais.

## Dúvidas em aberto

Nenhuma.
