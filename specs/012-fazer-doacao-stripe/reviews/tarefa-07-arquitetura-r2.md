# Parecer de arquitetura — Tarefa 7, rodada 2

**REPROVADO — P2.** A interface bloqueia “Tentar novamente” para todo estado
`falha_na_criacao`, mas só oferece nova intenção para `VALOR_NAO_ACEITO`. Assim,
se o summary vier com outra rejeição conclusiva, o usuário não consegue
retomar no mesmo pedido, embora o CA9 permita nova tentativa após rejeição
conclusiva antes da criação da sessão. Ajustar a condição para permitir retry
nesses casos, mantendo-o bloqueado para `VALOR_NAO_ACEITO`, pedidos pagos e
estados indeterminados.

Referências: `apps/desktop/src/renderer/donation-status.ts`,
`apps/desktop/src/renderer/views/SupportProjectView.vue`.

Os quatro achados aceitos da rodada 1 parecem corrigidos. Não executei testes.
