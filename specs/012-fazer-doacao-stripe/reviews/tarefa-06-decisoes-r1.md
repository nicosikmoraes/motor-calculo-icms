# Decisões da triagem — Tarefa 6, rodada 1

| # | Apontamento | Decisão | Justificativa |
|---|---|---|---|
| 1 | [P1] Recusa sem ID de Checkout pode liberar nova sessão sem prova de que a sessão anterior não aceita pagamento. | Aceito | A recusa do PaymentIntent não prova que a sessão Checkout foi encerrada; sem ID de sessão, uma nova operação deve bloquear até a sessão poder ser verificada. |
| 2 | [P1/P2] Repetição da mesma operação de retry não retoma abertura incerta sem sessão vinculada. | Aceito | A mesma identidade precisa repetir os parâmetros e a chave Stripe da mesma tentativa dentro da janela segura, recuperando a sessão após resposta perdida sem criar nova tentativa. |
| 3 | [P2] Webhook de expiração não verifica que a sessão está não paga. | Aceito | Só status `expired` e `unpaid` consultados no Stripe autorizam registrar expiração; valor desconhecido ou pago não pode liberar nova tentativa. |
| 4 | [P2] Reentrega de evento de recusa/expiração duplicado causa conflito na chave única do evento e HTTP 503. | Aceito | O mesmo evento precisa ser processado idempotentemente e reconhecido sem transição duplicada nem erro de reentrega. |
