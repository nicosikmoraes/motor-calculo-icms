# Plano — US09 / Issue #12 — Fazer doação pelo Stripe

Spec de referência: [spec.md](spec.md), aprovada no commit `1f33159` por delegação
expressa do autor, com a diferença em relação ao ato manual acadêmico registrada
no corpo daquele commit e no [índice](../README.md).

Este plano foi escrito depois desse commit. Nenhuma tarefa abaixo está executada;
todos os caminhos citados são previsões para a Atividade 10. Não se implementa,
instala dependência, cria migration ou modifica configuração na Atividade 09.

## Decisões técnicas

### Fronteira e organização

Seguir [architecture.md](../../docs/architecture.md), sem definir outro padrão
global. O novo módulo fica em `apps/api/src/donations/`: domínio e casos de uso,
portas de repositório/gateway e adaptadores HTTP, Prisma e Stripe. O módulo não
importa pacotes fiscais nem acessa o SQLite. O desktop usa um serviço de doações
sem dependências NestJS, Prisma ou Stripe; componentes não acessam o banco.

Não criar outro frontend, renomear pacotes ou extrair o motor fiscal. A tela
"Apoiar o projeto" será um acréscimo isolado no Vue existente, conforme a
adaptação explícita da Atividade 08. A indisponibilidade desse módulo não entra
na inicialização nem na navegação dos fluxos fiscais.

### Persistência e concorrência

O PostgreSQL exclusivo da API terá:

| Registro | Campos e invariantes previstos |
| --- | --- |
| `donation_orders` | UUID, hash único da chave de intenção, valor decimal exato em BRL, estado e instantes; valor/moeda imutáveis. |
| `payments` | UUID, pedido, estado da tentativa, IDs opcionais e únicos de Checkout Session/PaymentIntent, chave idempotente própria para o gateway, instante do primeiro envio, motivo operacional e confirmação; vínculo único por sessão. |
| `donation_operations` | Pedido, identidade da operação, fingerprint dos parâmetros normalizados, tentativa e resultado mínimo; unicidade por pedido/operação. A chave portadora bruta não é persistida. |
| `payment_events` | Pedido/tentativa, ID do evento do gateway quando existir, origem, transição/motivo e instante; conserva recusas e falhas anteriores, sem corpo integral do webhook nem dados do pagador. |

O hash da chave de intenção serve também para localizar a criação inicial antes
de o cliente conhecer o ID do pedido. Operações repetidas com parâmetros distintos
produzem conflito. Uma reserva durável e exclusão mútua por pedido impedem duas
aberturas concorrentes; nunca manter transação do banco aberta durante chamada
ao Stripe. Depois da resposta externa, finalizar com atualização condicional que
não rebaixa confirmação recebida nesse intervalo.

Confirmação, registro de evento e transições de pedido/tentativa são atômicos.
Unicidade do evento e da sessão, além da transição condicionada do pedido,
protegem tanto repetições do mesmo evento quanto eventos diferentes para a mesma
sessão. Uma segunda confirmação real de outra tentativa conserva sua evidência,
sem uma segunda transição do pedido ou reembolso implícito.

Valor entra como texto decimal, é normalizado sem aritmética de ponto flutuante
binário e é convertido exatamente em centavos no adaptador. As condições de
aceitação, limites, estados e mensagens são as da spec, não decisões novas deste
plano. Atualizar, somente na Atividade 10, os testes de scaffold que hoje exigem
schema e banco vazios; conservar os testes da fronteira fiscal.

### Contrato HTTP desta história

| Operação prevista | Entrada e resposta |
| --- | --- |
| `POST /donation-orders` | Cabeçalhos `X-Donation-Intent` e `Idempotency-Key`; corpo apenas `amount` decimal em BRL e `currency`. Retorna pedido, tentativa, estado e Checkout URL se disponível. Repetição retorna os mesmos registros. |
| `GET /donation-orders/current` | Chave de intenção no cabeçalho; recupera o pedido sem exigir seu ID, inclusive após perda da primeira resposta. Rota estática registrada antes da rota de ID. |
| `GET /donation-orders/:id` | ID e chave correspondente; responde somente valor, moeda, estados, histórico operacional mínimo e ação disponível. |
| `POST /donation-orders/:id/attempts` | Chave de intenção e nova identidade de operação; sem novo valor/moeda. Retoma sessão existente ou cria tentativa somente nas condições do CA9. |
| `POST /webhooks/stripe` | Corpo bruto e `Stripe-Signature`; confirma somente após validações e commit transacional. Não usa chave de intenção. |
| `GET /donations/return` | Página mínima para orientar retorno ao aplicativo, usada por sucesso/cancelamento do Checkout. Nenhum parâmetro de URL altera pedido ou confirma pagamento. |

Na criação: `201` para novo recurso, `200` para repetição concluída e `202` com
identidade do pedido e estado para operação ainda incerta. Validação local:
`422`, sem recursos criados; conflito de parâmetros: `409`. Rejeição conclusiva
do gateway após persistir intenção retorna `422` com o ID do pedido, motivo
operacional e tentativa `falha_na_criacao`, permitindo a consulta posterior.
Infraestrutura indisponível: `503`, conservando referências já duráveis. IDs e
motivos são dados da resposta, nunca segredos de gateway ou mensagens brutas do
provedor. Pedido inexistente e chave incorreta têm a mesma resposta `404`.

Webhook: assinatura inválida retorna `400`; evento verificado mas não aplicável,
desconhecido ou já processado recebe `200`, sem alterar o pedido indevidamente.
Divergência é registrada com campos permitidos. Falha transitória ao verificar o
vínculo no gateway ou ao persistir retorna `503`, sem consumir definitivamente o
evento, para possibilitar reentrega. Não confirmar sucesso HTTP antes do commit.
Esses contratos pertencem apenas a este módulo e não modificam contratos fiscais.

### Integração Stripe e retomada

O adaptador cria Checkout hospedado avulso, moeda `brl`, apenas cartão, usando
conta e chave de testes. URLs de retorno são de configuração confiável. Não
receber do cliente uma URL arbitrária, chave Stripe ou ID externo para associar
ao pedido. Não solicitar cadastro, email ou dados fiscais no contrato da aplicação.

Persistir pedido, tentativa, operação, parâmetros exatos e instante do primeiro
envio antes de chamar o gateway. A chave Stripe deriva da identidade da tentativa,
sem incluir a chave portadora. Preservar os parâmetros usados na criação, inclusive
URLs e metadados, para que mudança de configuração não altere uma repetição.
Enviar somente IDs não secretos de pedido/tentativa nos metadados da sessão e do
PaymentIntent, permitindo correlacionar notificação antecipada de sucesso ou recusa.

Usar o SDK oficial para assinatura com corpo bruto e segredo obrigatório;
não incluir fallback que aceite webhook sem segredo. Em `checkout.session.completed`,
exigir `payment_status=paid`, `livemode=false`, associação, valor e moeda
correspondentes. A sessão ainda não gravada localmente é recuperada no gateway
e conferida antes do vínculo. `payment_intent.payment_failed` fornece evidência
de recusa; `checkout.session.expired` ou consulta autenticada confirma expiração.
Eventos de outros tipos não são confirmação de doação.

Timeout/erro de resultado incerto conserva a tentativa. A retomada repete a
operação com chave e parâmetros originais dentro da janela da spec, ou recupera
a sessão conhecida; depois de 24h sem conclusão, só concilia e informa bloqueio.
Busca vazia não é prova de inexistência. Consulta autenticada não substitui
webhook para marcar pago. Quando uma sessão concluída aguarda confirmação, não
se abre outra. Se houver sessão excedente após corrida excepcional, seu
encerramento é uma ação externa rastreada e repetível, sem fingir atomicidade
com o PostgreSQL ou rebaixar pedido pago.

### Interface e isolamento

A área de apoio gera e conserva a chave de intenção e identidade da operação
antes do envio, em armazenamento local específico de doações, sem anexar
cadastros fiscais. Gera nova identidade de operação apenas para ação explícita
que a spec permite. Não publica a chave em query string ou logs. Consulta ao
abrir a tela, ao voltar do navegador e por ação "Atualizar situação"; a fonte
do estado é a API, nunca parâmetros de retorno.

Abrir Checkout no navegador externo por operação restrita do processo principal
e preload, validando HTTPS e host permitido do Checkout; não expor comando
genérico de shell. A tela apresenta os estados e mensagens exatos da spec e
identificação de ambiente de testes. Um link na navegação fiscal acessa a área
sem exigir conexão para as demais telas. As dependências fiscais e seus dados
permanecem fora do serviço de doações.

### Documentação consultada

Fontes oficiais consultadas em 01/11/2026, incluindo consultas via Context7;
revalidar versão do SDK e contrato de eventos no início da Atividade 10:

- [Erros e operações de resultado incerto](https://docs.stripe.com/error-low-level).
- [Requisições idempotentes](https://docs.stripe.com/api/idempotent_requests).
- [Assinatura, reentrega e tratamento de webhooks](https://docs.stripe.com/webhooks).
- [Moedas e mínimo operacional em BRL](https://docs.stripe.com/currencies).

## Tarefas

- [x] **Tarefa 1 — Preparar persistência durável e histórico mínimo**
  - Cobre: CA1, CA3, CA7, CA9, CA12 — pré-requisito técnico das tarefas seguintes, sem alegar entrega isolada dos critérios.
  - Teste primeiro: integração com PostgreSQL descartável prova unicidade de intenção/operação/sessão, imutabilidade do valor, rollback de confirmação e conservação de recusa anterior. A reserva deve excluir aberturas concorrentes com identidades distintas. O banco deve rejeitar um evento ou uma operação que informe uma tentativa de outro pedido, sem deixar registro parcial. O teste deve concluir e limpar as reservas antes dos pedidos, respeitando as chaves estrangeiras.
  - Arquivos previstos: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/`, `apps/api/src/donations/domain/`, `apps/api/src/donations/ports/`, `apps/api/src/donations/adapters/prisma/`, `apps/api/test/donations.persistence.db-spec.ts`.
  - Adequação prevista: atualizar `apps/api/test/scaffold.spec.ts`, `apps/api/test/database.db-spec.ts` e `apps/api/test/verify-empty-database.sql` para validar o schema de doações na Atividade 10, preservando as verificações de fronteira. Não enfraquecer os checks apenas para admitir tabelas arbitrárias.
  - Build e banco: alinhar a geração do Prisma à compilação da API e conferir que o comando de produção continua apontando para o artefato gerado. Atualizar a preparação do cliente e do banco no workflow existente em `.github/workflows/api.yml`. Em uma cópia limpa, a CI deve gerar o cliente antes das etapas que o importam e aplicar a migration antes de verificar o schema e rodar `pnpm test:db`. A tarefa só fecha quando `pnpm check` e `pnpm test:db` passam.
  - Retomada: o primeiro ciclo terminou no limite de duas rodadas. O commit `9829d48` preserva os pareceres e as decisões. Antes de uma nova execução, arquivar os pareceres desse ciclo e preservar o rascunho local para consulta. A spec aprovada já exige que pedido e tentativa correspondam.

- [x] **Tarefa 2 — Criar pedido e Checkout válido com validação e configuração de testes**
  - Cobre: CA1, CA2, CA13; usa persistência da tarefa 1.
  - Teste primeiro: HTTP com gateway controlado prova criação do valor exato, rejeição sem efeitos para entradas inválidas e nenhum envio sem intenção durável. Simular limite rejeitado pelo gateway, ausência de configuração, chave de produção e banco indisponível. Asserções verificam códigos, IDs, estado e mensagens, além do número de chamadas externas. Para indisponibilidade HTTP 503 do Stripe, exercitar o `httpClient` do SDK com respostas brutas `application/json` no formato de erro, JSON malformado, HTML, JSON sem o envelope `error` e corpo vazio; conferir HTTP 503 da API com IDs duráveis, estado indeterminado e exatamente uma chamada em cada cenário. Pelo menos um cenário integrado com PostgreSQL real prova que pedido/tentativa já estão persistidos antes de chamar Stripe e que os IDs retornados e o estado/reserva correspondem aos registros após HTTP 503. Cobrir também falha sem resposta HTTP separadamente, mantendo-a como resultado incerto HTTP 202.
  - Persistência de valores: o teste com PostgreSQL real deve provar que um decimal válido com mais de 63 dígitos inteiros é persistido exatamente antes do envio e que um limite do Stripe é registrado como `VALOR_NAO_ACEITO`. A migration aditiva deve remover o typmod de precisão/escala do `NUMERIC`, manter uma restrição de até duas casas decimais e preservar o trigger de imutabilidade. O schema Prisma e `migrate diff` devem representar `NUMERIC` sem typmod sem converter esse campo em ponto flutuante.
  - Arquivos previstos: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/`, `apps/api/src/donations/application/create-donation.ts`, `apps/api/src/donations/adapters/http/`, `apps/api/src/donations/adapters/prisma/`, `apps/api/src/donations/adapters/stripe/`, `apps/api/src/donations/donations.module.ts`, `apps/api/src/app.module.ts`, `apps/api/.env.example`, `apps/api/package.json`, `pnpm-lock.yaml`, `apps/api/test/donations.create.e2e-spec.ts`, `apps/api/test/donations.create.db-spec.ts`.
  - Entrega futura: SDK e configuração somente na API, sem segredos no Git; erros conclusivos e indeterminados são separados conforme a spec.
  - Retomada após duas rodadas: os pareceres originais ficam arquivados em `reviews/arquivo/tarefa-02-ciclo-01/`. O novo ciclo começa do commit da Tarefa 1; o rascunho não commitado do ciclo anterior é preservado fora da árvore de trabalho apenas como referência. O teste de 503 observa respostas no transporte bruto do SDK, antes da interpretação do corpo, sem compartilhar estado transitório entre requisições concorrentes.

- [x] **Tarefa 3 — Retomar operação incerta sem abrir Checkout duplicado**
  - Cobre: CA3, CA4; cobre a recuperação inicial exigida no CA11.
  - Teste primeiro: gateway cria sessão e perde resposta; repetir a mesma operação recupera o mesmo pedido/tentativa/sessão. Disparar confirmações concorrentes; variar parâmetros com a mesma identidade; avançar relógio controlado até a fronteira de 24h. Provar que após a janela nenhum novo POST ao gateway é feito sem evidência conclusiva e que nenhuma consulta marca pago.
  - Arquivos previstos: `apps/api/src/donations/application/create-donation.ts`, `apps/api/src/donations/application/resume-donation.ts`, `apps/api/src/donations/adapters/stripe/`, `apps/api/src/donations/adapters/prisma/`, `apps/api/test/donations.recovery.e2e-spec.ts`.

- [x] **Tarefa 4 — Validar webhook e confirmar apenas o pedido correspondente**
  - Cobre: CA5, CA6; usa a transação da tarefa 1.
  - Teste primeiro: corpo bruto com assinatura de teste válida confirma o valor esperado; assinatura ausente/inválida, produção, valor/moeda divergentes, sessão de outro pedido e ID desconhecido não confirmam. Entregar evento antes da resposta da criação e provar recuperação/verificação do vínculo sem criar pedido adicional.
  - Arquivos previstos: `apps/api/src/main.ts`, `apps/api/src/donations/adapters/http/stripe-webhook.controller.ts`, `apps/api/src/donations/application/handle-stripe-event.ts`, `apps/api/src/donations/adapters/stripe/`, `apps/api/test/donations.webhook.e2e-spec.ts`.
  - Limite: habilitar corpo bruto para validação sem registrar seu conteúdo; segredo ausente nunca ativa modo permissivo.

- [x] **Tarefa 5 — Garantir confirmação atômica sob repetição e falha**
  - Cobre: CA7; reforça as invariantes de CA5 e CA10.
  - Teste primeiro: mesmo evento repetido e concorrente, dois IDs de evento para a mesma sessão e falha injetada entre gravações. Provar uma confirmação, nenhuma alteração parcial, HTTP de falha antes de concluir e processamento bem-sucedido na reentrega.
  - Arquivos previstos: `apps/api/src/donations/application/handle-stripe-event.ts`, `apps/api/src/donations/adapters/prisma/`, `apps/api/test/donations.webhook-concurrency.db-spec.ts`.

- [ ] **Tarefa 6 — Preservar recusas e controlar nova tentativa e expiração**
  - Cobre: CA9, CA10; integra a retomada de CA3/CA4.
  - Teste primeiro: recusa assinada seguida de sucesso conserva ambos os fatos; sessão ainda aberta é reutilizada; expirada permite nova tentativa no mesmo valor; sessão concluída ou incerta bloqueia. Concorrer nova tentativa com confirmação, entregar eventos antigos depois de pago, simular falha ao encerrar sessão excedente e segunda confirmação real. Provar histórico completo, pedido pago monotônico e ausência de reembolso automático.
  - Arquivos previstos: `apps/api/src/donations/application/retry-donation.ts`, `apps/api/src/donations/application/handle-stripe-event.ts`, `apps/api/src/donations/adapters/http/`, `apps/api/src/donations/adapters/stripe/`, `apps/api/test/donations.attempts.e2e-spec.ts`.

- [ ] **Tarefa 7 — Entregar a área de apoio com abandono e retomada verificáveis**
  - Cobre: CA1, CA2, CA8, CA9, CA11, CA13; apresenta os estados de CA4/CA10.
  - Teste primeiro: teste de fluxo da interface conserva intenção/operação antes da primeira requisição, perde a resposta e reinicia a tela recuperando o mesmo pedido. Retornos de sucesso/cancelamento não confirmam pagamento; consulta posterior com webhook mostra pago. API indisponível e chave incorreta mostram as mensagens previstas, sem impedir navegação fiscal. Teste do processo principal rejeita URLs fora do Checkout permitido.
  - Arquivos previstos: `apps/desktop/src/renderer/views/SupportProjectView.vue`, `apps/desktop/src/renderer/services/donations.ts`, `apps/desktop/src/renderer/router.ts`, ponto existente de navegação, `apps/desktop/src/main/` e `apps/desktop/src/preload/` para abertura restrita, `packages/contracts/` para o contrato IPC mínimo, `apps/desktop/test/donations-flow.test.ts`, `apps/api/src/donations/adapters/http/` para consulta e retorno.
  - Limite: mudanças futuras apenas para conectar a área independente; não refatorar cadastros, lotes ou cálculo fiscal.

- [ ] **Tarefa 8 — Verificar minimização e acesso isolado ao pedido**
  - Cobre: CA12; completa a proteção de acesso do CA11.
  - Teste primeiro: payloads de criação/gateway, logs e registros após sucesso/erro não contêm dados fiscais, cartão, pagador, segredo Stripe ou chave portadora bruta. Banco guarda apenas hash da chave; intenção errada não consulta nem retoma pedido. Webhook é verificado transitoriamente sem persistir seu corpo. Testes de fronteira continuam rejeitando dependência fiscal na API e adaptadores de servidor no desktop.
  - Arquivos previstos: `apps/api/test/donations.privacy.e2e-spec.ts`, `apps/api/test/scaffold.spec.ts`, `apps/api/src/donations/adapters/http/`, `apps/api/src/donations/adapters/prisma/`, `apps/desktop/test/donations-flow.test.ts`.

- [ ] **Tarefa 9 — Demonstrar a história integrada e fechar rastreabilidade**
  - Cobre: CA1–CA13, por verificação de integração e auditoria dos testes das tarefas 1–8, sem substituir os testes específicos.
  - Teste primeiro: cenário integrado com cartão de testes percorre valor, intenção, Checkout, retorno ainda pendente, webhook e consulta paga; outro cenário faz recusa/retomada. Testes automatizados usam gateway controlado, PostgreSQL descartável e assinatura de teste; a demonstração separada usa Stripe de testes com credenciais do ambiente, nunca dinheiro real.
  - Arquivos previstos: `apps/api/test/donations.integration.e2e-spec.ts`, `apps/desktop/test/donations-flow.test.ts`, `docs/manual-do-usuario.md`, `docs/atividade-10.md`, `specs/README.md`.
  - Verificação futura: executar os checks existentes, suítes de doações e integração PostgreSQL; conferir cada CA, histórico de tentativas e continuidade do uso fiscal sem API. Registrar limites/credenciais ausentes sem declarar demonstração executada. Apenas na Atividade 10, após implementação/revisão, atualizar estado do índice para `implementada` e seguir o rito de PR daquela atividade.

## Mapa de cobertura

| Critério | Tarefa principal que entrega o comportamento | Verificações complementares |
| --- | --- | --- |
| CA1 | 2 e 7 — API e fluxo do apoiador | 1, 9 |
| CA2 | 2 — validação e limite do gateway | 7, 9 |
| CA3 | 3 — identidade e concorrência da operação | 1, 6, 9 |
| CA4 | 3 — resultado incerto e janela de retomada | 7, 9 |
| CA5 | 4 — evidência e vínculo válidos | 1, 5, 9 |
| CA6 | 4 — rejeição de evento não correspondente | 8, 9 |
| CA7 | 5 — deduplicação e transação | 1, 9 |
| CA8 | 7 — abandono e retorno do navegador | 9 |
| CA9 | 6 — recusa e retomada controlada | 7, 9 |
| CA10 | 6 — expiração e notificações antigas | 5, 9 |
| CA11 | 7 — reinício e consulta por intenção | 3, 8, 9 |
| CA12 | 8 — minimização e fronteira | 1, 9 |
| CA13 | 2 e 7 — indisponibilidade e continuidade fiscal | 9 |

## Critérios sem tarefa
