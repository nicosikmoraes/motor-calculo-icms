# Código — Tarefa 2, rodada 2

Registro da mensagem recebida antes da interrupção. O parecer final não foi emitido.

> A leitura confirmou defesa pré-transformação, hash estável na aquisição/finalização e NUMERIC exato com migration transacional compatível com T1. Há uma lacuna acionável no 503 real: `stripe-checkout-gateway.ts:56` só reconhece `StripeError.statusCode === 503`. No SDK instalado `RequestSender.js:99,107–117,131–143`, o status só entra no erro se o corpo for JSON com `error`; HTTP 503 com corpo vazio/HTML vira `StripeAPIError` sem `statusCode` e segue como `uncertain` sem motivo, logo `202` no controller:58, embora a reserva permaneça. O teste em `donations.create.e2e-spec.ts:215` cria artificialmente um erro já com status e não cobre esse caminho. Se o escopo do item aceito é HTTP 503 explícito de transporte, sugiro [P2] capturar o status também para corpo sem envelope via fronteira HTTP/SDK e testar com transporte controlado. Nenhuma chamada, DB ou Git.
