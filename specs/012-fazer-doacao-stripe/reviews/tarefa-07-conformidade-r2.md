# Parecer de conformidade — Tarefa 7, rodada 2

**REPROVADO.** Os achados da rodada 1 sobre iniciar nova intenção para
`VALOR_NAO_ACEITO`, exibir a incerteza e recuperar por GET current foram tratados.
A proteção do Checkout e a navegação fiscal também estão conformes.

Achados pendentes:

- **[P2] Mensagem contraditória para valor rejeitado:** após receber
  `VALOR_NAO_ACEITO`, a tela ainda anunciava “Pedido criado. Aguardando
  confirmação do pagamento”, embora o pedido tenha falhado e não exista sessão.
  Condicionar o aviso ao status retornado.
- **[P2] Sem ação para outras falhas conclusivas de criação:** a interface
  bloqueava retry para todo `falha_na_criacao`, mas só oferecia nova intenção
  para `VALOR_NAO_ACEITO`. CA9 permite outra operação no mesmo pedido quando
  houve rejeição conclusiva antes da sessão, exceto para valor não aceito.
- **[P2, menor] O erro não identifica o campo de valor:** a mensagem aparecia,
  mas não estava associada ao valor rejeitado nem o marcava como inválido, como
  pede CA2.

Retomada/operação antes da requisição e GET current após perda da resposta estão
conformes; retorno não confirma pagamento; fiscal segue navegável; proteção do
Checkout aprovada. Revisão somente leitura; não executei testes.
