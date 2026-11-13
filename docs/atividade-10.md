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
- A demonstração manual com cartão de teste Stripe ainda não foi executada nesta instalação.

## Revisão e estado da entrega

- Tarefa 7 teve duas rodadas independentes. Os achados acionáveis da segunda
  rodada foram corrigidos e os pareceres/decisões estão em
  `specs/012-fazer-doacao-stripe/reviews/`; não houve uma terceira revisão
  formal.
- Tarefas 7 e 8 estão implementadas e revisadas. A Tarefa 9 está automatizada e
  revisada; falta a demonstração manual com cartão de testes Stripe e registrar
  seu resultado antes de marcar a atividade como concluída.
- A integração no PostgreSQL cobre dois percursos por rotas HTTP: criação →
  retorno ainda pendente → webhook de pagamento assinado → GET `/current` pela
  mesma intenção; e recusa assinada → comprovação de sessão expirada no gateway
  controlado → nova tentativa → consulta do histórico. Assinatura/gateway são
  controlados nos testes; isso não substitui a demonstração manual no Stripe.
- PR #47 foi criada como rascunho para as Tarefas 1–6; a branch atual contém
  mudanças locais ainda não publicadas. Não afirmar que a PR está mesclada nem
  que a Issue #12 foi fechada.
- Não há navegador local/Stripe conectado nesta sessão para iniciar a
  demonstração manual. Para concluir, conecte o navegador com a conta Stripe em
  modo de testes; depois executar Checkout, webhook e consulta paga e registrar
  o resultado aqui.

## Limites conhecidos da entrega

- A PR #47 permanece em rascunho até implementação, revisão, documentação e
  validação estarem concluídas; a Issue #12 ainda não deve ser fechada.
- A conclusão da demonstração requer credenciais de teste configuradas pelo
  responsável e confirmação observada via webhook. Não inferir sucesso pelo
  redirecionamento do Checkout.
- Preservar a operação e a intenção locais ao reiniciar. Em estado incerto,
  consultar o pedido; não abrir outro Checkout automaticamente.
- O fluxo fiscal deve continuar disponível com a API de doações desligada.
