## Achado

- **P2 — Replay concluído retorna status HTTP incorreto.** O controller sempre responde `201` após uma criação bem-sucedida ([donation-orders.controller.ts](/home/nico/Documentos/ChatGPT/Contabilidade/motor-calculo-icms-atividade-09/apps/api/src/donations/adapters/http/donation-orders.controller.ts:25)). O teste também exige `201` na repetição que recupera uma sessão já persistida ([donations.recovery.e2e-spec.ts](/home/nico/Documentos/ChatGPT/Contabilidade/motor-calculo-icms-atividade-09/apps/api/test/donations.recovery.e2e-spec.ts:106)). O contrato do plano define `201` para recurso novo e `200` para repetição concluída (`plan.md:67`). Distinguir esses resultados e afirmar `200` no replay concluído.

## Sugestão de cobertura

O teste de resposta perdida não simula uma sessão criada pelo Stripe antes da perda da resposta: o transporte lança erro sem registrar uma sessão remota, e a segunda chamada recebe uma resposta constante. Um gateway falso com estado por chave de idempotência poderia verificar que o reenvio idêntico recupera a mesma sessão.

**Parecer: não aprovado**, até corrigir o status HTTP do replay.
