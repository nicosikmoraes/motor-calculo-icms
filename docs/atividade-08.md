# Atividade 08 — scaffold isolado da API de pagamentos

## Recorte da entrega

O ContabiliNico é um aplicativo desktop fiscal, construído com Electron, Vue,
TypeScript e SQLite. Seu código antecede esta atividade. Esta alteração acrescenta
um serviço NestJS independente no mesmo monorepo para a futura área de doações e
pagamentos. O aplicativo fiscal não depende desse serviço para funcionar.

Hoje há apenas infraestrutura: o `Hello World!` do gerador, configuração de
ambiente, PostgreSQL local, Prisma sem modelos, testes e o Portão de Entendimento.
Não há integração com o gateway, cobrança real, entidade de pagamento ou migration.

## Adaptações explícitas ao roteiro

| Roteiro da atividade | Aplicação no ContabiliNico |
| --- | --- |
| Frontend novo em `apps/web` | Frontend Vue já existente em `apps/desktop`, distribuído com Electron; não foi gerado um segundo frontend. |
| npm workspaces e `package-lock.json` | Workspace pnpm 10.32.1 existente, com `apps/*`, `packages/*` e um único `pnpm-lock.yaml`. |
| Aplicação iniciada do zero | Scaffold apenas da API nova; o código fiscal preexistente é preservado. |
| Banco local na porta 5432 | PostgreSQL 16 exclusivo da API na porta 5433, porque a 5432 já estava ocupada. |
| Schema sem entidades | Schema Prisma vazio; o SQLite fiscal existente possui seu próprio histórico e não participa do scaffold. |

As adaptações de frontend e gerenciador precisam ser consideradas na avaliação.
Este registro não afirma dispensa concedida pelo professor nem cumprimento literal
de `apps/web` e npm. Os demais itens de infraestrutura são implementados para o
serviço de pagamentos, sem migrar dados fiscais para o servidor.

## Origem e decisões ratificadas

A API foi criada com o gerador oficial, executado na raiz da branch:

```bash
npm exec --yes --package=@nestjs/cli@12.0.10 -- nest new api --directory apps/api --package-manager pnpm --skip-git --skip-install --no-observe
```

O npm acima executa a ferramenta temporária; o projeto continua sendo instalado
e gerenciado exclusivamente pelo pnpm. O gerador não instalou outro lockfile nem
iniciou um repositório Git dentro do aplicativo.

- O template trouxe ESM, Vitest e Oxlint, registrados na arquitetura.
- A API utiliza TypeScript 6; o desktop fixa explicitamente seu TypeScript 5.9.
- O teste original do gerador expôs a perda de metadados de decorators no
  transformador padrão do Vitest. SWC corrige isso mantendo a injeção do NestJS.
- O plugin de aliases foi removido porque não há aliases declarados e sua
  dependência transitiva exigia TypeScript 5.
- Não há `@nestjs/observe`, ferramenta de deploy ou dependência fiscal na API.
- O Prisma 7.10 foi inicializado pela CLI. Seu `prisma7.config.ts` foi renomeado
  para `prisma.config.ts`, aceito pela CLI e compatível com o roteiro. A instalação
  automática de skills não compõe a entrega; em novas inicializações, use
  `prisma init --datasource-provider postgresql --no-skills` dentro de `apps/api`.
- O cliente terá saída em `apps/api/generated/prisma`, fora do Git.
- O banco usa volume próprio, healthcheck e porta publicada somente no loopback.

## Como os arquivos se encaixam

`apps/api/src/main.ts` inicializa o NestJS e abre o servidor. `AppModule` reúne o
módulo global de configuração, o controller e o service. O controller recebe HTTP;
o service devolve a mensagem de demonstração. Não há regra de pagamento hoje.

O `package.json` da raiz orquestra os comandos. O `pnpm-workspace.yaml` reúne os
pacotes; cada app conserva seu próprio manifesto e suas ferramentas. Isso permite
instalar o repositório inteiro uma vez e escolher qual aplicação executar.

`docker-compose.yml` descreve somente o banco da API. `prisma.config.ts` fornece a
URL à CLI; `ConfigModule` disponibiliza as variáveis no processo NestJS. São dois
programas diferentes lendo o mesmo ambiente do pacote `apps/api`.

O `.env` fica fora do Git; `.env.example` documenta a configuração local de
exemplo. O `.gitignore` também exclui dependências, builds e cliente gerado. Sem
ele, arquivos reconstruíveis e credenciais poderiam entrar no histórico.
`.gitattributes` padroniza LF em textos e preserva as exceções binárias de XML,
XSD e SQL já usadas para checksums pelo aplicativo.

## Fronteira arquitetural e próximas histórias

O desktop fiscal continua em Electron/Vue/SQLite. A API futura de pagamentos será
organizada por domínio, casos de uso, portas e adaptadores. Prisma/PostgreSQL e o
gateway serão adaptadores desse serviço, sem acessar a persistência fiscal.

Esta atividade não cria diretórios ou classes de negócio vazios. A primeira
spec aprovada definirá os contratos e modelos necessários. O teste que exige um
schema vazio deverá evoluir junto com essa spec, quando a atividade permitir os
primeiros modelos e migrations. A confirmação por webhook pertence a essa etapa
futura; uma tela de sucesso no desktop não será a fonte definitiva do pagamento.

## Verificação e entrega

`pnpm check` verifica o aplicativo existente e o scaffold. `pnpm test:db` e
`prisma:check-db` exigem o PostgreSQL e verificam a conexão TCP pela URL externa e
a ausência de tabelas. O segundo comando passa pela própria CLI Prisma sem
alterar o banco. `docker compose exec -T db psql -U app -d appdb -c '\dt'`
fornece uma conferência adicional dentro do container.

Os testes de fronteira rejeitam dependências/imports fiscais na API e adaptadores
de servidor nos pacotes fiscais. Os testes HTTP verificam o servidor e a injeção
de configuração; a suíte fiscal existente continua no workspace.

O workflow `api` executa lint, tipos, testes, Prisma e PostgreSQL. O workflow
Windows preserva a verificação do instalador e do runtime Electron. O check
`explicacao` exige pelo menos 250 caracteres na seção `## Explicação` do PR,
sem contar comentários do template ou conteúdo de outras seções.

A entrega semanal é o link do PR de manutenção mesclado, etiquetado
`manutencao`, com explicação e checks aprovados. Não há `Closes #`, pois scaffold
é manutenção. A descrição do PR reúne estas evidências e o motivo das adaptações.

### Resultados locais — 24/10/2026

- Instalação única na raiz: `pnpm install --frozen-lockfile`, aprovada.
- `pnpm check`: lint, tipagem, 590 testes aprovados e builds de API/desktop.
- Um teste fiscal local opt-in foi ignorado por depender de um manifesto privado;
  não é parte da validação pública e já existia antes desta atividade.
- Prisma: schema válido e SQL de verificação executado pela CLI na URL local.
- `pnpm test:db`: dois testes aprovados, incluindo conexão TCP com credencial e
  ausência de tabelas/views.
- Compose: PostgreSQL saudável em `127.0.0.1:5433`; `psql` retornou
  `Did not find any relations.`.
- Processo compilado da API iniciado na porta 3000: HTTP 200 com `Hello World!`
  e HTTP 404 para rota inexistente; processo encerrado após a conferência.
- Nenhum arquivo de implementação fiscal alterado. A única alteração no manifesto
  do desktop fixa explicitamente o TypeScript 5.9 que ele já utilizava.

As execuções independentes no GitHub são a evidência complementar de Linux com
PostgreSQL e de build, instalação e smoke test do aplicativo no Windows. O
ruleset da `main` exige `explicacao`, `api` e `windows` antes da integração.
