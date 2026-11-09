**APROVADO — rodada 2, revisão somente leitura.** As assertions atendem ao apontamento aceito em `tarefa-05-decisoes-r1.md` e à CA7.

No cenário de falha, o teste exige HTTP 503 e consulta o PostgreSQL antes da reentrega. Confere pedido e pagamento ainda `pendente`, `confirmed_at` nulos em ambos, `checkout_session_id` e `payment_intent_id` nulos, zero transições para `paga` e zero eventos com o ID que falhou ([teste, linhas 123–136](/home/nico/Documentos/ChatGPT/Contabilidade/motor-calculo-icms-atividade-09/apps/api/test/donations.webhook-concurrency.db-spec.ts:123)). Depois de remover a falha injetada, reenvia o mesmo evento, verifica HTTP 200 e confirma os estados, vínculos, timestamps e exatamente uma confirmação persistida ([linhas 138–147](/home/nico/Documentos/ChatGPT/motor-calculo-icms-atividade-09/apps/api/test/donations.webhook-concurrency.db-spec.ts:138)).

A CA7 também tem cobertura para seis entregas concorrentes do mesmo evento, todas respondendo 200 com uma única confirmação. IDs de evento diferentes para a mesma sessão são cobertos sequencialmente; conforme o registro anterior, tornar esse caso concorrente segue como **sugestão não bloqueante**.

Não executei testes nem editei arquivos.
