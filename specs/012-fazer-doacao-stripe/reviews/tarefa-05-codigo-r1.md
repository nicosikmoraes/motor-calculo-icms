**REPROVADO**

1. **P2 — A falha não comprova rollback completo.** O caso injeta a falha na gravação do evento e verifica que pedido, pagamento, sessão e contagem de confirmações voltam ao estado pendente [no teste](</home/nico/Documentos/ChatGPT/Contabilidade/motor-calculo-icms-atividade-09/apps/api/test/donations.webhook-concurrency.db-spec.ts:113>). Porém, `confirmPayment` também grava `payment_intent_id` e `confirmed_at`; esses campos não são consultados antes da reentrega. Assim, uma alteração parcial neles poderia passar despercebida. Para cobrir integralmente o rollback exigido, verifique que ambos continuam nulos e que não há evento com o `stripe_event_id` injetado.

A repetição concorrente do mesmo evento e o uso de IDs distintos para a mesma sessão verificam uma única confirmação persistida. A falha é injetada no PostgreSQL real, o endpoint responde 503 e a reentrega conclui. O arquivo novo contém apenas testes; não identifiquei lógica de produção desnecessária.
