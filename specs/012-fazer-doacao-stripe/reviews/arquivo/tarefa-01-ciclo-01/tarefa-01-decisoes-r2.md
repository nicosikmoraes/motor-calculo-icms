# Decisões da triagem — Tarefa 1, rodada 2

| Apontamento | Decisão | Justificativa |
| --- | --- | --- |
| 1. A reserva criada no teste impede a exclusão do pedido durante a limpeza. | Aceito | O usuário aceitou corrigir a limpeza. A chave estrangeira impede excluir o pedido enquanto existir uma reserva associada. |
| 2. Duas chamadas com a mesma identidade podem adquirir a reserva da mesma operação. | Recusado para esta tarefa | Na interpretação registrada na conversa, a mesma operação deve reutilizar a mesma chave idempotente no gateway. A integração ainda precisa demonstrar esse comportamento. |
| 3. Um evento pode referenciar uma tentativa que pertence a outro pedido. O parecer aponta o mesmo risco nas operações. | Aceito | O usuário aceitou corrigir a associação. A existência dos dois registros não garante que a tentativa pertença ao pedido informado. |
| 4. A documentação de arquitetura ainda descreve o estado anterior do banco. | Recusado para esta tarefa | A atualização da arquitetura está prevista para o fechamento da história, quando o diagrama refletirá o schema entregue. |

## Encerramento

A Tarefa 1 permanece pendente. A segunda rodada terminou com apontamentos aceitos e atingiu o limite de revisão do enunciado. A suíte PostgreSQL da segunda rodada ficou sem execução por falta de acesso ao banco no ambiente.

Para retomar, explicitar no plano a regra de vínculo entre pedido, tentativa, operação e evento. A execução da suíte em PostgreSQL descartável deve fazer parte da preparação da próxima sessão.
