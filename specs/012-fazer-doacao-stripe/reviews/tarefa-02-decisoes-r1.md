# Decisões da triagem — Tarefa 2, rodada 1 do novo ciclo

| Apontamento | Decisão | Justificativa |
| --- | --- | --- |
| 1. O caso de uso importa NestJS e transporta status/corpo HTTP. | Aceito pelo usuário | A arquitetura aprovada prevê aplicação independente do framework e da camada HTTP; o controller deve mapear resultados para HTTP. |
| 2. Os testes de HTTP 503 não provam que os IDs retornados correspondem a registros duráveis. | Aceito pelo usuário | Um teste PostgreSQL deve verificar os registros reais e provar que a transação de intenção terminou antes da chamada ao Stripe. |
| 3. Falta teste para HTTP 503 com JSON malformado. | Aceito pelo usuário | A classificação do status precisa ser verificada também quando o corpo declara JSON, mas não pode ser parseado. |
| 4. Falta confirmar no fluxo integrado de 503 que os IDs retornados continuam consultáveis/duráveis. | Aceito pelo usuário | O cenário integrado deve comparar a resposta HTTP com o pedido e a tentativa encontrados no PostgreSQL após a resposta incerta. |
