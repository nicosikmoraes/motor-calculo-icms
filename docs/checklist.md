# ✅ Checklist — a ficha da disciplina

> **Status: Entrega 1 e infraestrutura da Atividade 08.**
> O desktop fiscal continua local. O scaffold NestJS, Prisma e PostgreSQL nasce
> separado, reservado ao futuro serviço de doações/pagamentos. O banco dessa API
> não contém tabelas nem migrations.
>
> O frontend é o aplicativo existente em `apps/desktop` e o workspace usa pnpm.
> Essas adaptações estão registradas em [Atividade 08](atividade-08.md); não
> constituem uma dispensa dos requisitos concedida pelo professor.
> O código fiscal anterior não comprova automaticamente as demais exigências
> das Entregas 2 e 3. Cada item marcado deve ser explicado pelo autor.

## 📐 Regras da disciplina

- **Escopo mínimo do projeto:** no mínimo **2 entidades com relação 1:N** e o
  **fluxo de pagamento** em ambiente de testes (venda avulsa ou assinatura
  recorrente) — as stories de pedido e pagamento são obrigatórias no PRD.
- **Stack fixa:** backend **NestJS + Prisma ORM** com banco **relacional**
  (PostgreSQL). Banco de produção em nuvem: Neon.tech ou Vercel Postgres
  (⚠️ o PostgreSQL gratuito do Render expira em 30 dias — não use).
- **Stack livre:** frontend à escolha entre **React, Angular ou Vue**,
  consumindo a API.
- **Tema:** livre, com regras de negócio claras; **único na turma** e válido
  só após o **aceite do professor**. Individual ou em dupla.
- **Fluxo de trabalho:** monorepo no GitHub + GitHub Flow (branches curtas
  por feature, integração na `main` via Pull Request).

## RA1 — Arquitetura, Engenharia de Requisitos com IA e Gestão Ágil

- [x] **ID1:** Estruturou o PRD e o SDD (Diagrama Mermaid) de forma clara, utilizando a IA para modelar o negócio.
  > No ID1, "SDD" é o *Software Design Document* — neste repositório ele se chama `docs/architecture.md`, porque a sigla já significa Spec-Driven Development (o guia explica).
- [x] **ID2:** A aplicação foi estruturada em formato de Monorepo (Front + Back) no GitHub.
  > Atividade 08: frontend Electron/Vue em `apps/desktop` e scaffold backend NestJS em `apps/api`, no mesmo workspace pnpm. Adaptações ao roteiro em `atividade-08.md`.
- [x] **ID3:** Mapeou o PRD em Histórias de Usuário no GitHub Projects, criando um backlog rastreável de Issues.
  > Evidência: [Kanban público](https://github.com/users/nicosikmoraes/projects/2), Issues #5 a #12 das oito histórias Ready; US04 permanece Draft.
- [ ] **ID4:** Para as histórias implementadas, registrou no repositório a especificação e o plano derivados da Issue antes da codificação.
- [x] **ID5:** Demonstrou domínio do GitHub Flow, isolando features em branches curtas e utilizando Pull Requests para integração na main.
  > A infraestrutura da Atividade 08 usa branch própria e PR de manutenção; o histórico desktop anterior também registra integrações por PR.

## RA2 — Desenvolvimento Backend Assistido por IA

- [ ] **ID6:** O código NestJS mantém separação estrita de camadas arquiteturais (Controllers, Services, Modules).
- [ ] **ID7:** Aplicou DTOs e ValidationPipes (com whitelist) para blindar as entradas da API.
- [ ] **ID8:** Implementou operações CRUD relacionais utilizando Prisma ORM.
- [ ] **ID9:** Configurou autenticação JWT e protegeu rotas através de controle de acesso (Roles/Guards).
- [ ] **ID10:** Padronizou o tráfego com Interceptors para respostas e Exception Filters globais para erros.

## RA3 — Qualidade de Software e TDD Guiado por IA

- [ ] **ID11:** Orquestrou a IA no fluxo TDD, gerando testes automatizados baseados nas Issues antes da implementação da lógica.
- [ ] **ID12:** Os testes locais e no pipeline executam com sucesso, cobrindo caminhos de sucesso e erro.
- [ ] **ID13:** Submeteu o código à revisão de um agente distinto daquele que implementou, usando critérios fixos, e registrou no Pull Request as decisões tomadas sobre os apontamentos.

## RA4 — Prototipagem e Integração Frontend

- [ ] **ID14:** A API do backend expõe documentação Swagger atualizada e interativa.
- [ ] **ID15:** Materializou o PRD em interfaces visuais (React/Angular/Vue) utilizando prototipagem assistida por IA.
- [ ] **ID16:** A interface consome os dados reais da API NestJS de forma assíncrona, lidando corretamente com os tokens JWT.

## RA5 — Pipeline CI/CD e Implantação Contínua

- [ ] **ID17:** As credenciais e variáveis sensíveis (como a DATABASE_URL da nuvem) estão seguras, ocultas do GitHub e injetadas corretamente via ConfigModule e variáveis de ambiente da plataforma de hospedagem.
  > Parte local preparada na Atividade 08: `.env` ignorado, `.env.example` versionado, `ConfigModule` global e dotenv na CLI Prisma. Injeção de produção continua pendente.
- [x] **ID18:** Configurou esteira de CI (Continuous Integration) via GitHub Actions para validação automática de código (testes/linting) antes do merge.
  > Workflows da API e do instalador Windows, com lint da API, tipagem, testes e builds. `explicacao` implementa o Portão de Entendimento.
- [ ] **ID19:** Realizou o deploy da aplicação em domínio público (nuvem), conectada a um banco de dados relacional em produção (recomenda-se Neon.tech ou Vercel Postgres combinados com o Connection Pooling do Prisma).

## RA6 — Integração de Meios de Pagamento

- [ ] **ID20:** Especificou e implementou o fluxo de pagamento com integração a um gateway (Mercado Pago ou Stripe) em ambiente sandbox, modelando as entidades de pedido e pagamento.
- [ ] **ID21:** Tratou a confirmação assíncrona via webhook com verificação de assinatura, mantendo o status do pedido consistente e as chaves de API fora do repositório.

---

## 📦 As entregas

A nota soma **atividades semanais (10 pontos)** e **três entregas de 10 pontos**
cada. Cada entrega exige o vídeo correspondente — **entrega sem vídeo não é
pontuada**.

| Entrega | O que sobe | Vídeo |
| --- | --- | --- |
| **E1 — Concepção e Planejamento** | Documentos revisados; PR de revisão mesclado; tag anotada `entrega-1`; Kanban e protótipo públicos | Vídeo individual: vitrine e gestão; produto, jornada e protótipo; modelo de dados; uma decisão do autor |
| **E2 — Backend e TDD** | API NestJS com Prisma, JWT e testes; specs em `specs/` e PRs com os pareceres dos revisores e as decisões de triagem | Vídeo 2: uma spec derivada da Issue, o TDD rodando e a estrutura de Controllers, Services e Guards |
| **E3 — Frontend, Pagamento e Deploy** | Front consumindo a API, pagamento sandbox (ordem criada no servidor + webhook), GitHub Actions e deploy público | Vídeo 3: sistema em produção e um pedido mudando de estado pela notificação do gateway |

> ⚠️ Serviços gratuitos hibernam por inatividade — acesse a aplicação minutos
> antes de gravar o vídeo ou defender, para "acordá-la".
