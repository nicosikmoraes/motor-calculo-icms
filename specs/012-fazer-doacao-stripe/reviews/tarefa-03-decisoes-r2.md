# Decisões da revisão — Tarefa 3, rodada 2

| Apontamento aceito na rodada 1 | Resultado | Evidência |
| --- | --- | --- |
| 1. Replay concluído retornava HTTP 201 em vez de 200. | Corrigido; aprovado pelos dois revisores. | Criação nova retorna 201; operação repetida retorna 200. Os testes verificam ambos. |
| 2. A gravação de resultado incerto podia rebaixar pagamento já confirmado. | Corrigido; aprovado pelos dois revisores. | A atualização condicional não altera pagamento `paga`; o teste com PostgreSQL cobre a corrida e confirma histórico monotônico. |

Os dois pareceres da rodada 2 aprovaram a tarefa. As sugestões relativas à conciliação automática após 24 horas, à atualização de `docs/architecture.md` e à verificação do ID pedido em `retrieve` são não bloqueantes; não foram promovidas a apontamentos.
