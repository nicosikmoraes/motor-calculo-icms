# Decisões da revisão — Tarefa 2, rodada 2 do novo ciclo

| Apontamento aceito na rodada 1 | Resultado | Evidência |
| --- | --- | --- |
| 1. O caso de uso dependia de NestJS e de detalhes HTTP. | Corrigido; aprovado pelos dois revisores. | `CreateDonation` usa configuração tipada e códigos semânticos; o controller faz o mapeamento HTTP. |
| 2. Os testes de HTTP 503 não provavam que os IDs correspondiam a registros duráveis antes do envio. | Corrigido; aprovado pelos dois revisores. | O teste de integração consulta pedido, tentativa, operação e reserva no PostgreSQL dentro do transporte Stripe, antes de devolver 503. |
| 3. Faltava teste para HTTP 503 com JSON malformado. | Corrigido; aprovado pelos dois revisores. | A suíte HTTP agora inclui resposta `application/json` malformada com status 503. |
| 4. Faltava conferir IDs, estados e reserva após HTTP 503 em registros reais. | Corrigido; aprovado pelos dois revisores. | A integração confere que os IDs da resposta correspondem às linhas reais e que estado, evento e reserva permanecem persistidos. |

Os dois pareceres da rodada 2 aprovaram a tarefa. Não surgiram novos apontamentos bloqueantes. Uma sugestão do parecer de código para atualizar `docs/architecture.md` é não bloqueante e não altera o escopo desta tarefa.
