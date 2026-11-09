# Decisões da triagem — Tarefa 7, rodada 1

| Apontamento | Decisão | Ação |
| --- | --- | --- |
| 1. Sem ação para nova intenção/quantia após `VALOR_NAO_ACEITO`. | Aceito pelo usuário. | Adicionar fluxo explícito de nova intenção, preservando a intenção anterior e gerando novos identificadores. |
| 2. `indeterminada` não mostra a mensagem CA4 e a tela pode oferecer retry sem explicar bloqueio. | Aceito pelo usuário. | Apresentar estados/mensagens de incerteza conforme spec e não sugerir retry nesses estados. |
| 3. Teste não reproduz perda de resposta seguida de reinício e consulta por GET current. | Aceito pelo usuário. | Atualizar teste para reconstruir o estado do renderer a partir do armazenamento e recuperar o pedido pelo GET current. |
| 4. Allowlist aceita porta não padrão e credenciais na URL do Checkout. | Aceito pelo usuário. | Restringir a origem HTTPS padrão e rejeitar userinfo/porta explícita antes de `shell.openExternal`. |
