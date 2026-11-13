# AJUSTES NECESSÁRIOS

1. **[P2] O caso de uso depende de NestJS e de detalhes HTTP.** A arquitetura aprovada prevê casos de uso independentes de NestJS. Porém, `CreateDonation` importa `Injectable`, `Inject` e `ConfigService`, e `DonationCreationError` carrega status HTTP e corpo de resposta. Isso mistura configuração de infraestrutura e transporte na camada de aplicação. Evidência: [create-donation.ts](/home/nico/Documentos/ChatGPT/Contabilidade/motor-calculo-icms-atividade-09/apps/api/src/donations/application/create-donation.ts:2), [create-donation.ts](/home/nico/Documentos/ChatGPT/Contabilidade/motor-calculo-icms-atividade-09/apps/api/src/donations/application/create-donation.ts:9). O controller poderia converter resultados ou erros de aplicação para HTTP, enquanto o caso de uso recebe configuração por uma porta ou parâmetro tipado.

## Sugestões

- Atualizar [architecture.md](/home/nico/Documentos/ChatGPT/Contabilidade/motor-calculo-icms-atividade-09/docs/architecture.md:33): ele ainda descreve a API como demonstração Hello World, sem módulo de doações nem tabelas, embora a Tarefa 2 já tenha criado esses componentes.
- O transporte Stripe e a persistência seguem a sequência esperada: o pedido, a tentativa, a operação e a reserva são gravados em transação antes da chamada externa; o resultado do Stripe é registrado em transação separada. A reserva permanece no resultado incerto e é removida após Checkout registrado ou falha conclusiva.
- O tratamento do HTTP 503 atende à lacuna registrada no ciclo anterior: o adaptador captura o status antes de interpretar o corpo, e o teste cobre envelope JSON, HTML, JSON sem `error`, corpo vazio e concorrência. A ausência de resposta continua diferenciada como resultado incerto.
- O modelo monetário também está coerente: o `migrate diff` gerou `"amount" numeric NOT NULL`, sem precisão/escala fixa; a migration remove o typmod e mantém restrições de escala, finitude e imutabilidade. O teste de banco verifica valor com 64 dígitos inteiros, persistência exata e rejeição acima de duas casas decimais. A escrita usa SQL raw e texto, sem conversão para ponto flutuante.

Não reexecutei os testes; considerei os resultados informados de 9/9 no DB, 4/4 unitários, 24/24 e2e e `pnpm check` verde.
