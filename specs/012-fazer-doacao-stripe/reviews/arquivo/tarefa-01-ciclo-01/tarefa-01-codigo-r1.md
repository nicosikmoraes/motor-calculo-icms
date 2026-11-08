**Apontamentos**

1. **P1 — Falta uma reserva durável que exclua operações concorrentes por pedido.** A unicidade cobre apenas a combinação pedido/identidade; identidades diferentes podem ser registradas para o mesmo pedido. A porta também oferece criação de pagamento e operação em chamadas separadas, sem uma operação de reserva atômica. Evidência: [schema.prisma](/home/nico/Documentos/ChatGPT/Contabilidade/motor-calculo-icms-atividade-09/apps/api/prisma/schema.prisma:80) e [donation-repository.ts](/home/nico/Documentos/ChatGPT/Contabilidade/motor-calculo-icms-atividade-09/apps/api/src/donations/ports/donation-repository.ts:42). Isso não garante a exclusão mútua por pedido prevista em [plan.md](/home/nico/Documentos/ChatGPT/Contabilidade/motor-calculo-icms-atividade-09/specs/012-fazer-doacao-stripe/plan.md:39) e pode permitir aberturas concorrentes.

2. **P1 — Uma confirmação válida de outra tentativa pode perder seu evento.** `confirmPayment` grava o evento, mas exige que o pedido ainda esteja `PENDING`; se outra tentativa já o confirmou, lança erro e a transação desfaz também o evento recém-gravado. Evidência: [prisma-donation.repository.ts](/home/nico/Documentos/ChatGPT/Contabilidade/motor-calculo-icms-atividade-09/apps/api/src/donations/adapters/prisma/prisma-donation.repository.ts:92). Isso contraria o plano de conservar a evidência de uma segunda confirmação real sem repetir a transição do pedido ([plan.md](/home/nico/Documentos/ChatGPT/Contabilidade/motor-calculo-icms-atividade-09/specs/012-fazer-doacao-stripe/plan.md:44)).

3. **P1 — A pasta de migrations não contém `migration_lock.toml`.** Entre os arquivos novos, há apenas `migration.sql` em `apps/api/prisma/migrations/`. Essa ausência pode impedir a CLI Prisma de validar ou aplicar a migration. Não executei a CLI, conforme o escopo somente leitura.

**Observação documental:** [architecture.md](/home/nico/Documentos/ChatGPT/Contabilidade/motor-calculo-icms-atividade-09/docs/architecture.md:136) ainda afirma que o PostgreSQL permanece vazio e que não há modelo nem migration; essas afirmações divergem do diff atual.

Não rodei testes nem alterei arquivos.
