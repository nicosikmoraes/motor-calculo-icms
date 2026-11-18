# Revisão independente da US12

Dois agentes distintos da implementação fizeram revisão estática. O primeiro
examinou código, integridade e autorização. O segundo cruzou a entrega com
CA1–CA7, a arquitetura e a ordem dos commits. Ambos deram parecer favorável,
com os pontos abaixo para triagem. As execuções de teste foram realizadas
depois pela implementação.

| Parecer | Apontamento | Decisão |
| --- | --- | --- |
| Código | O teste aceitava qualquer string em `updatedAt` e passaria sem alteração de data. | Aceito. O teste fixa a data anterior e confirma que o PATCH a avança. |
| Código | O OpenAPI poderia declarar `additionalProperties: false` no schema do corpo. | Fora do escopo deste ajuste. O contrato HTTP e o README informam o único campo aceito. O teste cobre a rejeição no servidor. Mantivemos o DTO como a fonte do schema gerado. |
| Conformidade | O PATCH com corpo inválido deveria usar um registro existente para provar que ele não mudou. | Aceito. O teste usa um rascunho existente e verifica a resposta ao consultar e listar depois das recusas. |
| Conformidade | A referência da aprovação no plano deveria resolver no histórico publicado. | Aceito. O plano usa o permalink do commit remoto. |

## Verificação

No commit de [testes RED](https://github.com/nicosikmoraes/motor-calculo-icms/commit/556d3f0ba57c2fcd7df99e01492ee51a9cd5c034), quatro
cenários novos falharam no PostgreSQL porque as rotas e a tabela ainda
não existiam. O cenário novo de OpenAPI falhou pela ausência das operações.
Depois da implementação, passaram 23 testes unitários, 134 testes HTTP e
46 de persistência. A primeira execução paralela local teve dois timeouts
em testes preexistentes. A suíte de banco passou inteira executada
separadamente. Build da API, tipagem e lint passaram.

As cinco migrations anteriores já estavam aplicadas no PostgreSQL descartável.
A migration da US12 preservou uma conta, um pedido e um pagamento sintéticos
gravados antes dela. A verificação de tabelas passou com a nova tabela.

Na API compilada, o Swagger apresentou o CRUD com Bearer JWT. Cadastro
e login reais permitiram criar dois rascunhos, listá-los, atualizar um e
removê-lo. O excluído retornou 404 e o outro continuou acessível.
