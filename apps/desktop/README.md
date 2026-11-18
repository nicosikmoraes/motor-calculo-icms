# Desktop do ContabiliNico

As regras para organizar e ampliar o código estão no
[guia de arquitetura do repositório](../../docs/arquitetura-do-codigo.md).

O backend local roda no processo principal do Electron. O Vue usa a API
exposta pelo [preload](src/preload/index.ts) para chamar as operações locais.
As rotas de navegação do Vue ficam em [renderer/router.ts](src/renderer/router.ts).

## Arquitetura do front-end

- [`views/`](src/renderer/views/) agrupa telas por funcionalidade, como
  [lotes](src/renderer/views/batches/), [cadastros](src/renderer/views/registrations/)
  e [doações](src/renderer/views/donations/). Campos de formulário, mensagens de
  feedback e outros estados de uma única tela ficam no `.vue`.
- [`components/`](src/renderer/components/) agrupa partes da interface, como
  [painéis fiscais](src/renderer/components/fiscal/) e
  [componentes de layout](src/renderer/components/layout/). Elementos genéricos
  de interface, como ícones, ficam em [`ui/`](src/renderer/components/ui/).
  Cada tela e componente guarda seus estilos no próprio arquivo `.vue`, em um
  `<style scoped>`. A base visual compartilhada, incluindo estilos de botões e
  cartões, fica no bloco `<style>` de [`App.vue`](src/renderer/App.vue).
- [`stores/`](src/renderer/stores/) usa Pinia para compartilhar a sessão, o escritório
  e suas empresas, e os resumos de lotes. O store de cadastros atualiza o estado
  após uma alteração bem-sucedida no processo principal.
- [`concerns/`](src/renderer/concerns/) concentra lógica de interface que merece
  um arquivo próprio, como validação, navegação autenticada, filtros de lotes e
  a assinatura com limpeza automática dos eventos de progresso do Electron.
- [`services/`](src/renderer/services/) contém as chamadas de conta e doações pela
  ponte `window.desktopApi`. O renderer recebe e-mail e papel da sessão. O token
  é mantido pelo processo principal.

Por exemplo, [`CompaniesView.vue`](src/renderer/views/registrations/CompaniesView.vue) chama
o [store de cadastros](src/renderer/stores/workspace.ts) para salvar uma empresa.
O store chama o IPC e atualiza a lista compartilhada com a resposta. A visão geral
e o formulário de importação usam a mesma lista.

## Onde encontrar os canais IPC

O [registro central](src/main/ipc/routes.ts) liga os controllers ao Electron
antes de abrir a janela. O [contrato compartilhado](../../packages/contracts/src/index.ts)
define os nomes dos canais e a interface `DesktopApi`. O registro verifica se
cada canal de chamada tem exatamente um handler. `batch:progress` e
`auth:session-expired` são notificações do main ao renderer.

| Área | Onde procurar | Exemplo de canal |
| --- | --- | --- |
| Organização, empresas, perfis e auditoria | [Cadastros](src/main/ipc/controllers/registrations/) | `companies:create` |
| Arquivos, lotes, histórico e operações de importação | [Lotes](src/main/ipc/controllers/batches/) | `batch:inspect-sources`, `batch:create`, `batch:get-detail` |
| Regras, respostas fiscais, conflitos e revisão documental | [Fiscal](src/main/ipc/controllers/fiscal/) | `fiscal-rules:list-versioned`, `batch:save-item-fiscal-answers` |
| Conferência e planilhas | [Relatórios](src/main/ipc/controllers/reports/) | `report:export-batch-excel` |
| Cópias de segurança | [Backup](src/main/ipc/controllers/backup/) | `backup:restore` |
| Pacotes de cadastros | [Intercâmbio](src/main/ipc/controllers/interchange/) | `interchange:preview` |
| Cadastro de apoiador e sessão | [Contas](src/main/ipc/controllers/accounts/) | `auth:sign-in` |
| Apoio ao projeto e lista administrativa | [Doações](src/main/ipc/controllers/donations/) | `donations:create` |

## Camadas do processo principal

- [`bootstrap/`](src/main/bootstrap/) monta a janela, abre o SQLite, registra
  as rotas e coordena o encerramento.
- [`ipc/`](src/main/ipc/) recebe as chamadas do preload. Os controllers validam
  entradas, lidam com o remetente do evento e abrem os diálogos nativos.
- [`modules/`](src/main/modules/) agrupa o código por funcionalidade.
  `application/` guarda a coordenação dos casos de uso, `ports/` descreve as
  dependências quando há um contrato específico, `domain/` contém regras e
  `queries/` monta os dados para leitura. `adapters/` integra arquivos, SQLite,
  workers e a API de contas e doações.
- [`platform/`](src/main/platform/) cuida da conexão SQLite do main, das
  migrations e do registro de operações de lote. O worker de importação tem
  sua própria conexão com o SQLite e se comunica com o main por mensagens.

Para seguir o cadastro de empresa, abra o [controller de cadastros](src/main/ipc/controllers/registrations/registrations-controller.ts),
procure `IPC_CHANNELS.CREATE_COMPANY` e siga para o
[caso de uso](src/main/modules/registrations/application/registration-use-cases.ts).
O [adaptador SQLite](src/main/modules/registrations/adapters/sqlite-registrations.ts)
liga as portas aos repositórios do pacote `@motor/database`.

Para acompanhar a revisão de um item, veja o
[contexto fiscal](src/main/modules/fiscal/domain/item-fiscal-context.ts).
Ele recebe a nota normalizada, o item, as respostas ou a memória salva e um
eventual bloqueio documental. O
[adaptador SQLite fiscal](src/main/modules/fiscal/adapters/sqlite/item-fiscal-use-cases.ts)
busca esses dados, reúne as informações de reaproveitamento e grava as execuções.

Para seguir o histórico de lote, abra [batch-queries.ts](src/main/modules/batches/queries/batch-queries.ts).
A consulta de detalhe serve tanto à tela quanto à exportação de Excel.
O [build do Electron](electron.vite.config.ts) gera também o worker de lote
e o gerador de planilhas usados na verificação do aplicativo empacotado.
