# Decisões da triagem — Tarefa 5, rodada 1

| # | Apontamento | Decisão | Justificativa |
|---|---|---|---|
| 1 | [P2] A falha injetada não comprova rollback de `payment_intent_id`, `confirmed_at` nem ausência do evento com o ID que falhou. | Aceito | O teste deve conferir todas as gravações da confirmação na transação antes da reentrega, para demonstrar que o rollback foi integral. |
