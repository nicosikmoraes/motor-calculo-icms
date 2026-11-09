# Decisões da triagem — Tarefa 3, rodada 1

| Apontamento | Decisão | Justificativa |
| --- | --- | --- |
| 1. Repetição concluída retorna HTTP 201 em vez de 200. | Aceito pelo usuário | O contrato define 201 para criação e 200 para repetição concluída; o caso de uso e o controller devem distinguir os resultados e o teste deve verificar 200. |
| 2. Registrar resultado incerto pode rebaixar para `indeterminada` um pagamento já confirmado. | Aceito pelo usuário | Uma confirmação válida já persistida deve ser monotônica; a atualização deve ser condicional/atômica e não sobrescrever o estado `paga`. |
