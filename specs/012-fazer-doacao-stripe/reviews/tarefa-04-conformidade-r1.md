**REPROVADO**

1. **[P1] O teste não prova a recuperação pelo vínculo durável antes da resposta de criação.** Em `apps/api/test/donations.webhook.e2e-spec.ts`, o cenário concorrente substitui tanto `DONATION_REPOSITORY` quanto `DONATION_CREATION_REPOSITORY` por mocks independentes. `createIntent` devolve IDs fixos; `findPaymentForWebhook` devolve o pagamento quando esses mesmos IDs são passados, sem consultar o que a criação persistiu. A sessão retornada pelo Stripe também é uma fixture separada, e o teste não verifica se a requisição real de criação enviou aqueles IDs como metadados. Assim, o cenário pode passar sem provar a reconciliação com os IDs duráveis descrita no CA5.

2. **[P2] Divergências verificáveis são ignoradas sem registro.** No handler, as divergências de modo, pagamento, valor, moeda, metadados e vínculo levam a `return`; não há registro de identificadores e motivo, embora o CA6 peça esse registro para divergências verificáveis. Os testes verificam que não há confirmação, mas não cobrem o registro. Eventos desconhecidos, que o CA6 diz que não devem criar pedidos, são um caso distinto.

O código inspecionado habilita `rawBody`, exige segredo e assinatura, valida a assinatura sobre o corpo bruto, ignora eventos de produção e confere pagamento, valor, moeda, metadados e vínculo antes de chamar `confirmPayment`. A consulta Prisma permite uma sessão ainda não vinculada e rejeita vínculo existente com outro pagamento. Porém, o teste usa repositórios mockados, então não comprova essa consulta nem o vínculo durável no banco.

**Sugestões não bloqueantes**

- Manter os repositórios Prisma reais no cenário da chegada antecipada do webhook, com banco de teste, e conferir os dados persistidos antes e depois da confirmação.
- Verificar que a sessão criada pelo gateway controlado recebeu os IDs persistidos em metadados e que a busca do webhook reconciliou exatamente essa sessão.
- Adicionar cobertura para o registro mínimo de divergências previsto no CA6, sem incluir o corpo bruto do webhook.
