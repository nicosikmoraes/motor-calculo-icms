# Parecer de arquitetura — Tarefa 8, rodada 1

**APROVADO**, sem achados bloqueadores. Hash SHA-256 da intenção é a única
forma persistida e `/current` resolve o hash antes da autorização normal. A API
limita a entrada a valor e moeda; o adaptador Stripe envia metadados de pedido e
tentativa sem dados fiscais ou pessoais. O webhook verifica a assinatura sobre
o corpo bruto, reduz o evento a campos permitidos e não persiste o payload. O
schema não possui colunas pessoais/fiscais; os testes cobrem payloads, schema e
fronteiras entre API, desktop e pacotes fiscais.

Revisão somente leitura; sem execução de testes.
