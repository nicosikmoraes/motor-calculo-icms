# Revisão final da US11 — dois revisores independentes

Os dois revisores foram subagentes de leitura, sem acesso à conversa de
implementação. Revisaram o diff inteiro contra `origin/main` depois das oito
tarefas, com a mesma adaptação registrada na US10: uma revisão ao fim, e não
tarefa a tarefa.

## Revisor de código e segurança

O revisor não encontrou caminho até o pedido de outra pessoa nem vazamento de
dados. Conferiu os filtros por `user_id` nas três consultas, a checagem do dono
da chave sob o advisory lock, o cache de criações em andamento com o dono, a
ordem dos Guards, os campos da rota do administrador e a migration.

| # | Sev. | Apontamento | Triagem | Correção |
| --- | --- | --- | --- | --- |
| 1 | média | A chave de intenção do desktop era uma só por máquina. Quem doou antes da US11 (pedido agora sem dono) ou a segunda pessoa numa máquina compartilhada ficava presa num 409 sem saída | procede | A chave passa a ser guardada por conta (`…intent.v1:<e-mail>`); a chave antiga, sem conta, não é reaproveitada; teste novo |
| 2 | baixa | O teste "outra pessoa ou pedido sem dono não alcançam nada" passava sem o filtro de dono do `createRetry` (o pedido não tinha pagamento) | procede | Cada pedido ganha uma tentativa que permitiria retomar; contraprova com o dono; provado que o teste falha sem o filtro |
| 3 | baixa | Token válido de um usuário que não existe mais no banco virava 503 "serviço indisponível" (FK recusando o INSERT) | procede | A criação confere o dono dentro da transação e responde 401; testes de banco e e2e |

## Revisor de conformidade

Os 11 critérios estão cumpridos, com código e teste, e o checklist da
disciplina fecha. O revisor não achou nada fora do escopo.

| # | Sev. | Apontamento | Triagem | Correção |
| --- | --- | --- | --- | --- |
| 1 | baixa | O escopo da US11 no PRD citava a tela "Apoiar o projeto" (copiado da US10) | procede | Agora cita "Doações recebidas" (só ADMIN) |
| 2 | baixa | Faltava teste de que um 403 não derruba a sessão do desktop | procede | Teste novo em `api-session.test.ts` |
| 3 | baixa | O plano previa `requiresRole` no meta da rota, e o código usa `beforeEnter: requireRole('ADMIN')` | procede | Nota no plano |
| 4 | info | CA3, CA5, CA7 e parte do CA8 só têm prova no `test:db` | registrado | Esses testes rodam no CI; a sobrevivência dos pedidos antigos também foi conferida à mão no banco descartável |
