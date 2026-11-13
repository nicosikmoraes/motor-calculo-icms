# Atividade 10 — Doação pelo Stripe

## História

Implementação da US09: a pessoa escolhe um valor em BRL, abre o Checkout
hospedado do Stripe em modo de testes e acompanha o pedido sem confundir retorno
do navegador com confirmação. Só webhook válido confirma o pagamento. O fluxo
fica separado do processamento fiscal.

## Execução local de testes

Use PostgreSQL local descartável e configure `apps/api/.env` a partir de
`.env.example`, com chave `sk_test_` e segredo HMAC aleatório. A API escuta em
loopback na porta 3000; o desktop pode apontar `DONATION_API_URL` apenas para
loopback. Nunca grave credenciais no Git. Os testes automatizados usam gateway
controlado e não fazem cobrança real.

Verificações realizadas até aqui:

- Desktop: `pnpm --filter @motor/desktop typecheck` passou.
- Desktop: `pnpm --filter @motor/desktop test -- donations-flow.test.ts donation-checkout.test.ts` passou (255 testes; 1 teste preexistente ignorado).
- API: typecheck e lint passaram.
- API: `pnpm --filter @motor/api test:e2e -- donations.webhook.e2e-spec.ts donations.attempts.e2e-spec.ts donations.create.e2e-spec.ts` passou (66 testes).
- API: `pnpm --filter @motor/api test:unit` passou (4 testes).
- API: typecheck e lint passaram.
- PostgreSQL descartável: migrations aplicadas e `pnpm --filter @motor/api test:db` passou (26 testes). O container temporário foi removido ao fim da execução.
- Build de API e desktop: `pnpm build` passou.
- Demonstração manual no Stripe de testes executada em 12/11/2026 (ver abaixo).

## Demonstração manual no Stripe (modo de testes)

Ambiente: API compilada rodando em `127.0.0.1:3000`, PostgreSQL 16 descartável
com as três migrations aplicadas, conta Stripe em modo de testes
(`livemode: false`) e `stripe listen` encaminhando
`checkout.session.completed`, `checkout.session.expired` e
`payment_intent.payment_failed` para `POST /webhooks/stripe`. Nenhuma
credencial foi gravada no Git e nenhum dinheiro real foi movimentado.

| Passo | Resultado observado |
| --- | --- |
| `POST /donation-orders` com R$ 10,00, intenção e `Idempotency-Key` novas | `201`, pedido `pendente` com URL do Checkout `cs_test_…` |
| Pagamento no Checkout hospedado com o cartão de testes `4242 4242 4242 4242` | Pagamento aceito pelo Stripe |
| Webhook `checkout.session.completed` | Entregue pelo `stripe listen`; a API respondeu `200` |
| `GET /donation-orders/current` com a mesma intenção | `200`, pedido `pago`, tentativa `paga`, histórico `pendente → paga` |

O retorno do navegador para `DONATION_SUCCESS_URL` não foi usado como
confirmação: o estado `pago` só apareceu depois do webhook assinado.

### Defeito encontrado na demonstração

A primeira tentativa terminou em `202 indeterminada` (`RESULTADO_INCERTO`).
Reproduzindo a chamada direto no Stripe, a causa foi um HTTP 400: a API atual do
Stripe (`2026-09-30`) não aceita mais `payment_method_types` na criação da
sessão de Checkout. Os testes automatizados não pegaram porque usam gateway
controlado. A correção virou a **Tarefa 10** do plano, com teste do adaptador
escrito antes da mudança e dois pareceres em
`specs/012-fazer-doacao-stripe/reviews/`. A demonstração acima foi concluída
com essa correção aplicada.

## Revisão e estado da entrega

- Tarefas 1–10 implementadas e revisadas; pareceres e decisões em
  `specs/012-fazer-doacao-stripe/reviews/`.
- A integração no PostgreSQL cobre dois percursos por rotas HTTP: criação →
  retorno ainda pendente → webhook de pagamento assinado → GET `/current` pela
  mesma intenção; e recusa assinada → sessão expirada no gateway controlado →
  nova tentativa → consulta do histórico. A demonstração manual completa o
  percurso feliz contra o Stripe de testes real.
- O código das Tarefas 1–9 entrou na `main` pela PR #47. O fechamento
  (Tarefa 10, demonstração e documentação) entra pela PR que traz
  `Closes #12`.

## Limites conhecidos da entrega

- Recusa e expiração foram provadas com gateway controlado e assinatura de
  teste; a demonstração manual cobriu apenas o pagamento aprovado.
- Preservar a operação e a intenção locais ao reiniciar. Em estado incerto,
  consultar o pedido; não abrir outro Checkout automaticamente.
- O fluxo fiscal deve continuar disponível com a API de doações desligada.
