**REPROVADO.** A implementação persiste a intenção e a operação antes da chamada, recupera o pedido por GET current após reabrir a área, não trata retorno do navegador como pagamento, mantém a navegação fiscal acessível e restringe a URL do Checkout.

Há dois bloqueios de conformidade:

1. Quando o gateway rejeita o valor (`VALOR_NAO_ACEITO`), a tela não permite criar uma nova intenção com outra quantia. O formulário some com o pedido e restam apenas tentar novamente e atualizar: [SupportProjectView.vue:72–89](/home/nico/Documentos/ChatGPT/Contabilidade/motor-calculo-icms-atividade-09/apps/desktop/src/renderer/views/SupportProjectView.vue:72).

2. O estado `indeterminada` aparece como “Aguardando confirmação do pagamento”; a tela também pode substituir a mensagem de incerteza da API por um aviso genérico após uma resposta bem-sucedida: [SupportProjectView.vue:17–22](/home/nico/Documentos/ChatGPT/motor-calculo-icms-atividade-09/apps/desktop/src/renderer/views/SupportProjectView.vue:17), [SupportProjectView.vue:33–40](/home/nico/Documentos/ChatGPT/Contabilidade/motor-calculo-icms-atividade-09/apps/desktop/src/renderer/views/SupportProjectView.vue:33).

A cobertura também não reproduz o cenário do plano de perda de resposta seguida de reinício e recuperação via GET current: [donations-flow.test.ts:41–49](/home/nico/Documentos/ChatGPT/Contabilidade/motor-calculo-icms-atividade-09/apps/desktop/test/donations-flow.test.ts:41). Não alterei arquivos nem executei testes.
