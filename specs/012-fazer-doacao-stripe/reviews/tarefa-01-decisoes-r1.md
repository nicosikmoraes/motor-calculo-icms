# Decisões da triagem — Tarefa 1, rodada 1

| Apontamento | Decisão | Justificativa |
| --- | --- | --- |
| 1. Falta reserva durável/atômica por pedido para excluir operações concorrentes com identidades distintas. | Aceito | O plano exige uma reserva durável e exclusão mútua por pedido durante a chamada ao gateway, sem manter uma transação aberta. A unicidade por identidade não impede operações diferentes no mesmo pedido. |
| 2. A confirmação de outra tentativa após o pedido estar pago sofre rollback e perde a evidência. | Aceito | O plano exige conservar a evidência de uma segunda confirmação real sem repetir a transição do pedido nem ocultar o recebimento. |
| 3. Falta `migration_lock.toml` na pasta de migrations. | Aceito | A migration precisa ter os metadados que a CLI Prisma espera para validar e aplicar o schema PostgreSQL de forma reproduzível. |
