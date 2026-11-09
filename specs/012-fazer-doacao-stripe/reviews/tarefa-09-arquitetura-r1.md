# Parecer de arquitetura — Tarefa 9, rodada 1

**REPROVADO — P1.** O cenário integrado HTTP em
`apps/api/test/donations.webhook.e2e-spec.ts` substituía repositórios e
`RetryDonation` por mocks; a consulta final devolvia estado do mock em vez de
verificar persistência e consulta pela mesma intenção. A criação e o webhook
precisam usar repositórios reais com PostgreSQL descartável, conferindo estado
persistido antes/depois e GET autenticado.

**P2 — Cobertura incompleta do plano:** a Tarefa 9 prevê também recusa e
retomada integradas, mas os testes disponíveis estavam separados. Revisão
somente leitura; sem execução de testes.
