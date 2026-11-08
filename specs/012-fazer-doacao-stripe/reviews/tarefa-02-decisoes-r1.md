# Decisões da triagem — Tarefa 2, rodada 1

| Apontamento | Decisão | Justificativa |
| --- | --- | --- |
| 1. Campos JSON extras podem passar após a transformação do corpo. | Aceito pelo usuário | O POST aceita apenas valor e moeda. O corpo original precisa ser verificado antes que o Nest descarte propriedades. |
| 2. Reutilizar a chave de intenção no cabeçalho de idempotência pode gravá-la em texto puro. | Aceito pelo usuário | A identidade persistida da operação deve ser estável sem expor a credencial de acesso ao pedido. |
| 3. Indisponibilidade explícita do Stripe retorna HTTP 202 em vez de 503. | Aceito pelo usuário | O contrato prevê 503 com as referências duráveis e preservação do estado indeterminado. |
| 4. O limite local de 63 dígitos rejeita valores antes de registrar o resultado previsto no CA2. | Aceito pelo usuário | Valores decimais válidos que excedem a capacidade do gateway devem ser preservados exatamente e receber o motivo `VALOR_NAO_ACEITO`. |
