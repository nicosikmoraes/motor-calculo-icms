# Decisões da triagem — Tarefa 7, rodada 2

| Apontamento | Decisão de implementação | Ação |
| --- | --- | --- |
| Retry inacessível para falha conclusiva sem sessão, exceto valor rejeitado. | Corrigido. | A UI passa o motivo ao predicado; libera retry para rejeição conclusiva e mantém `VALOR_NAO_ACEITO` bloqueado. |
| Aviso dizia que pedido aguardava confirmação após falha/resultado incerto. | Corrigido. | Aviso de criação é exibido somente para estado pendente. |
| Rejeição não identificava o campo de valor. | Corrigido. | A mensagem identifica “Valor da doação”, descreve o valor rejeitado e informa que nenhuma sessão foi aberta; o valor recebe associação acessível e estado inválido. |

Os achados foram corrigidos após a segunda rodada formal, dentro do limite de
duas rodadas. Typecheck e testes automatizados foram repetidos; não houve uma
terceira rodada de parecer.
