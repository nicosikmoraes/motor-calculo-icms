# Encerramento — Tarefa 2, rodada 2

Os dois revisores registraram a mesma lacuna. Um HTTP 503 com envelope de erro do Stripe é reconhecido. Com HTML, JSON sem envelope ou corpo vazio, o adaptador retorna resultado incerto sem o motivo de indisponibilidade e o controlador usa HTTP 202. A tentativa permanece indeterminada e a reserva é preservada.

O coordenador reproduziu as quatro respostas com o SDK Stripe instalado e um transporte em memória. Cada cenário fez uma chamada ao transporte controlado. Somente o cenário com envelope de erro trouxe o motivo `SERVICO_INDISPONIVEL`.

O aceite do usuário para o item 3 da primeira rodada permanece aplicável. Trata-se do mesmo requisito de devolver HTTP 503 quando o serviço responder com esse status, preservando as referências duráveis. Os outros três ajustes foram confirmados na leitura da rodada.

A Tarefa 2 permanece pendente após o limite de duas rodadas de revisão. Para retomar, o teste deve usar o SDK com transporte controlado e respostas HTTP brutas, incluindo 503 com JSON de erro, HTML, JSON sem envelope e corpo vazio. A classificação deve conservar o status observado antes de interpretar o corpo e continuar diferenciando ausência de resposta de HTTP 503.
