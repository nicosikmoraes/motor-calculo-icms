# Guia de arquitetura do código

**Status:** referência para novas alterações
**Atualizado em:** 18/11/2026

Este guia descreve como organizar o código daqui em diante. Ele complementa a
[arquitetura do produto](architecture.md), que registra stack, limites funcionais,
modelo de dados e decisões de produto. Se uma mudança alterar estes limites,
atualize o guia e os testes de arquitetura relevantes.

## 1. Visão do repositório

O repositório é um monorepo pnpm. O desktop fiscal funciona localmente e é
independente da API. A API NestJS atende contas e doações. SQLite no desktop e
PostgreSQL na API têm responsabilidades separadas.

```text
apps/
  desktop/     Electron: renderer Vue, preload e processo principal
  api/         NestJS: HTTP, casos de uso e integrações de conta/doação
packages/
  contracts/   contratos compartilhados e canais IPC tipados
  domain/      tipos e regras independentes de interface e banco
  nfe-parser/  segurança, parsing, validação e normalização de documentos
  tax-engine/  seleção de regras e cálculos fiscais determinísticos
  database/    SQLite, migrations e repositórios
  reporting/   consolidação e exportação de relatórios
  interchange/ importação e exportação de configurações
docs/          arquitetura, decisões e documentação do produto
```

Prefira importar pela API pública do workspace (`@motor/domain`, por exemplo),
em vez de alcançar arquivos internos. Não importe código da API para o desktop,
nem código do desktop para a API.

## 2. Desktop: fluxo de uma operação

```text
View/componente Vue → store ou service → DesktopApi/contrato → preload
→ canal IPC → controller IPC → caso de uso ou query → adapter/pacote → recurso
```

O Electron mantém `contextIsolation` e Node desabilitado no renderer. O renderer
acessa recursos do processo principal somente pelos métodos explícitos da
`DesktopApi`; não importa Electron, SQLite ou filesystem. O preload expõe
operações tipadas, não uma ponte genérica para IPC arbitrário.

```text
apps/desktop/src/main/
  bootstrap/       inicialização, janela, ciclo de vida e composição
  ipc/routes.ts    registro central dos handlers
  ipc/controllers/<feature>/  adaptadores de entrada IPC
  modules/<feature>/
    domain/        regras e modelos próprios da funcionalidade
    application/   coordenação de ações/casos de uso
    ports/         contratos de dependência quando úteis
    queries/       leituras e modelos de consulta
    adapters/      SQLite, HTTP, filesystem, workers e integrações
  platform/        infraestrutura compartilhada do processo principal
```

Nem todo módulo precisa de todas as pastas. Crie somente as camadas necessárias;
elas devem esclarecer o fluxo e o dono da regra.

- **Bootstrap** compõe dependências e inicia o app; não contém regra fiscal.
- **`ipc/routes.ts`** conecta cada canal de chamada a um único handler. Canais e
  tipos são definidos em `packages/contracts`; preload expõe os métodos públicos.
- **Controller IPC** trata a fronteira, valida/formaliza a entrada, verifica o
  evento Electron quando necessário e delega. Não acumula SQL, cálculo ou regra.
- **Caso de uso** representa uma ação reconhecível e coordena passos, domínio e
  dependências. Não é obrigatório para cada função pequena ou leitura simples.
- **Domínio** decide regras e cálculos sem conhecer SQLite, Electron, HTTP,
  filesystem ou interface. Prefira lógica pura que recebe dados e devolve dados.
- **`queries/`** reúne leituras compostas para telas, relatórios ou exportações.
  Repositórios e SQL reutilizável de SQLite pertencem a `@motor/database`.
- **Porta** descreve uma dependência externa quando facilita substituição ou
  teste. Não crie interfaces sem benefício concreto.
- **Adapter** conecta uma porta/caso de uso a uma tecnologia. Pode buscar e
  gravar SQLite ou fazer HTTP; respostas externas são validadas na fronteira.
- **`platform/`** guarda infraestrutura compartilhada; o que pertence a uma
  funcionalidade fica no módulo dessa funcionalidade.

`service` não é uma camada obrigatória nem sinônimo de caso de uso. Caso de uso
coordena uma ação da aplicação. Serviço oferece uma capacidade reutilizável sem
representar uma ação inteira. Funções pequenas e puras podem ficar no domínio.

### Consultas, escritas e rotas IPC

- Ler, abrir uma tela ou exportar não deve alterar dados como efeito colateral.
  Cálculos e atualizações que gravam devem corresponder a uma ação explícita.
- Migrations ficam em `packages/database/migrations/`; não reescreva uma
  migration já aplicada para representar uma mudança nova.
- IPC é a fronteira de mensagens entre renderer e main, diferente das rotas do
  Vue Router. Contrato, preload, registro e controller precisam concordar.
- Eventos main→renderer são tipados e sua inscrição deve ter limpeza no preload.
  O renderer não chama controllers diretamente.

## 3. Frontend Vue

```text
apps/desktop/src/renderer/
  router.ts       navegação e guards
  views/<feature>/ telas agrupadas por funcionalidade
  components/     componentes agrupados por função
  stores/         estado compartilhado Pinia
  concerns/       lógica de interface reutilizável
  services/       chamadas pela DesktopApi
```

- **Views** compõem uma tela; estado usado somente nela fica local. Organize por
  funcionalidade, sem espalhar uma feature em pastas por tipo de arquivo.
- **Components** são partes reutilizáveis. Use `components/ui/` para controles
  realmente genéricos; os demais ficam agrupados pela funcionalidade.
- **Pinia** guarda estado compartilhado entre telas. Formulário, expansão,
  filtro e feedback local permanecem locais até precisarem ser compartilhados.
- **`concerns/`** contém lógica reaproveitável da interface (validação visual,
  filtros, assinatura e limpeza de eventos). Não é depósito genérico nem lugar
  para regras fiscais.
- **`services/`** encapsula chamadas da UI ao preload. Não acessa SQLite nem
  importa módulos do processo principal. Chamadas HTTP saem do main.
- **Router** controla navegação; uma rota Vue não é um handler IPC.

Estilos de tela/componente ficam no respectivo `<style scoped>` do `.vue`. A
base compartilhada fica no estilo de `App.vue`, conforme a convenção atual.
Não crie CSS global para uma tela nem contorne o limite de componente com estilo
global. Quando comportamento e estilo forem reutilizados juntos, extraia um
componente.

## 4. API NestJS

```text
apps/api/src/
  main.ts                    bootstrap HTTP
  app.module.ts              composição global
  http/controllers/<feature>/ rotas e adaptadores de entrada
  http/dto/<feature>/         contratos HTTP de entrada/saída
  http/decorators/            decorators próprios compartilhados
  auth/guard/                 autenticação e autorização HTTP
  http/filters, interceptors/ fronteira e políticas HTTP
  <feature>/
    application/              casos de uso e erros de aplicação
    domain/                    regras independentes de framework e banco
    ports/                     contratos usados pela aplicação
    adapters/prisma/           persistência e queries PostgreSQL
    adapters/stripe/           integração Stripe
    <feature>.module.ts        composição NestJS da funcionalidade
  common/                      infraestrutura realmente compartilhada
```

- Rotas são declaradas nos controllers por decorators NestJS, agrupados por
  funcionalidade. O módulo Nest registra controllers e conecta dependências.
- Controllers traduzem HTTP para chamadas de aplicação e resultados para HTTP.
  DTOs definem formatos de fronteira; tipos Prisma não chegam ao cliente.
- Casos de uso e domínio não dependem de NestJS, HTTP, Prisma ou Stripe. Portas
  ficam do lado da aplicação e adapters implementam essas portas.
- Leituras ficam em `adapters/prisma/queries/`; escritas que precisam de
  atomicidade permanecem na implementação transacional do repositório.
- `common/` é para infraestrutura compartilhada. Regras pertencem à feature que
  as conhece.
- A API não recebe XML, dados fiscais ou resultados do motor. PostgreSQL atende
  contas e doações; o SQLite fiscal permanece local.

Endpoints e formatos HTTP estão no [README da API](../apps/api/README.md).

## 5. Pacotes compartilhados

- `@motor/contracts`: contratos entre fronteiras, especialmente IPC; sem UI,
  SQLite ou implementação de infraestrutura.
- `@motor/domain`: modelos normalizados e regras independentes de framework.
- `@motor/nfe-parser`: segurança, parsing e normalização de arquivos/XML.
- `@motor/tax-engine`: cálculos a partir de dados e regras fornecidos; não lê
  banco ou interface.
- `@motor/database`: SQLite, migrations e repositórios.
- `@motor/reporting`: relatórios a partir dos dados recebidos; não abre banco.
- `@motor/interchange`: formatos de importação/exportação de configurações.

Mova algo para um pacote quando houver mais de um consumidor ou quando a
fronteira melhorar independência/testabilidade. Mantenha infraestrutura nas
bordas; regras puras devem poder ser testadas sem iniciar Electron, Nest ou DB.

## 6. Testes e manutenção

- Testes ficam no `test/` do workspace proprietário e são agrupados por assunto.
  Testes de arquitetura protegem limites que precisam continuar verdadeiros.
- Ao adicionar IPC, atualize contrato, preload, registro, controller e cobertura
  apropriada; confira a lista completa de canais.
- Ao adicionar rota HTTP, atualize controller/DTO, módulo, README de rotas e
  testes HTTP.
- Ao mudar dependências entre camadas, atualize os testes de arquitetura.
- Ao mover/renomear código, atualize imports e README do workspace afetado.
- Separe classes por responsabilidade quando isso melhora a navegação; não
  fragmente helpers pequenos sem motivo.
- Evite `utils.ts`, `helpers.ts` e `common.ts` como destino padrão. Nomeie pelo
  propósito e pela funcionalidade.
- Ao tocar uma área, remova scaffolds sem uso relacionados ao escopo; não crie
  telas, rotas ou classes de demonstração sem propósito de produto.

## 7. Onde colocar código novo

| Necessidade | Local inicial |
| --- | --- |
| Regra pura fiscal compartilhada | `packages/domain/src/` |
| Cálculo fiscal determinístico | `packages/tax-engine/src/` |
| Leitura/normalização de XML | `packages/nfe-parser/src/` |
| Migration ou repositório SQLite | `packages/database/` |
| Ação do backend local | `desktop/src/main/modules/<feature>/application/` |
| Leitura composta local | `desktop/src/main/modules/<feature>/queries/` |
| Integração concreta do módulo | `desktop/src/main/modules/<feature>/adapters/` |
| Entrada IPC | `desktop/src/main/ipc/controllers/<feature>/` |
| Contrato e método preload | `packages/contracts/` e `desktop/src/preload/` |
| Tela/rota Vue | `renderer/views/<feature>/` e `renderer/router.ts` |
| Estado compartilhado | `renderer/stores/` |
| Componente de interface | `renderer/components/<feature>/` |
| Lógica reutilizada pela UI | `renderer/concerns/<feature>/` |
| Endpoint REST | `api/src/http/controllers/<feature>/` e módulo da feature |
| Regra/ação de negócio da API | `api/src/<feature>/application/` ou `domain/` |
| Consulta PostgreSQL | `api/src/<feature>/adapters/prisma/queries/` |
