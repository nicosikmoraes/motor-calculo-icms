# Roadmap de implementação do MVP

Este roadmap organiza a implementação em incrementos verificáveis e mostra onde
uma decisão fiscal ou técnica precisa ser aprovada antes de avançar. Ele não
substitui [Decisões pendentes](decisoes-pendentes.md): o backlog continua sendo a
fonte oficial das questões abertas, e as decisões aprovadas devem ser registradas
em [Decisões técnicas](decisoes-tecnicas.md) e nos documentos definitivos.

Não há datas fixadas neste momento. Cada fase somente recebe prazo depois que seu
marco de decisão estiver aprovado e o escopo estiver suficientemente definido.

**Revisão de andamento:** 12/10/2026, considerando a entrega integrada até o PR
#39 e os incrementos de entradas ICMS-ST das DT-049 a DT-052. Esta revisão
registra implementação e testes técnicos; a homologação por casos reais permanece
pendente.

## Próxima etapa: instalação de teste no Windows

O recorte atual pode avançar para uma instalação de teste no Windows. Já existem
instalador NSIS x64 por usuário e workflow que verifica tipagem, testes, build,
backup/restauração, instalação, abertura do aplicativo, XLSX e worker distribuído.
O `.exe` e seu SHA-256 ficam nos artefatos do workflow por 14 dias. Conferir o
resultado do pipeline da versão a instalar; configuração existente não significa
que toda execução futura passou. Veja [Distribuição Windows](distribuicao-windows.md).

Antes de liberar para uso fiscal, ainda faltam:

- comparar XMLs reais com o cálculo independente do contador, incluindo compras,
  ICMS próprio, ST, FCP-ST e condições especiais de combustíveis/veículos;
- validar em Windows de usuário final os diálogos, backup/restauração, importação,
  exportação e atualização de uma instalação anterior;
- definir assinatura, versões de Windows suportadas, canal de atualização e
  recuperação de uma atualização que falhar;
- fechar a política de retenção/expurgo dos XMLs (MD-09) e o procedimento de suporte.

A cobertura fiscal atual é a conferência descrita em
[Escopo fiscal PR](escopo-fiscal-parana.md) e [ICMS-ST de entradas](icms-st-entradas.md).
Não cobre toda a Resolução 571: catálogo automático dos arts. 12/16 (144 linhas),
MVAs específicas dos arts. 11/29 nas condições implementadas e MVA final manual
nos demais casos elegíveis. Monofasia, bases por pauta/PMPF/preço prioritário,
demais tabelas/vigências, reduções de ST e outros regimes seguem fora da cobertura.
DIFAL, apuração de créditos/saldo e doações são expansões ainda abertas no roadmap;
não impedem instalar e avaliar o recorte atual.

## Legenda

- `[x]` concluído;
- `[ ]` trabalho ainda pendente, inclusive cobertura parcial ou homologação;
- `PODE AVANÇAR` trabalho protegido das decisões ainda abertas;
- `DECISÃO NECESSÁRIA` ponto em que implementar sem aprovação criaria regra
  fiscal, comportamento ou compromisso técnico indevido;
- `SAÍDA` evidência necessária para considerar a fase concluída.

## Visão geral

| Fase | Resultado principal | Dependência para começar | Estado |
|---|---|---|---|
| 0 | Fundação do monorepo e shell desktop | Decisões técnicas já aprovadas | Concluída |
| 1 | Contratos de ingestão e massa de testes | MD-01 e MD-02 | NF-e/NFC-e e ingestão estrutural de protocolos/eventos entregues; XSD próprio e tipos adicionais pendentes |
| 2 | Persistência local e cadastros básicos | MD-03 | Cadastros, auditoria e schema do recorte atual entregues; ampliações fiscais posteriores |
| 3 | Ingestão completa de XML/ZIP | Fases 1 e 2; MD-04 | NF-e/NFC-e e ingestão estrutural de protocolos/eventos entregues; XSD próprio e tipos adicionais pendentes |
| 4 | Gestão e seleção de regras fiscais | Fase 2; MD-05/MD-06 para campos fiscais | Ciclo de versões e explicação entregues; resultados tributários configuráveis pendentes |
| 5 | Motor de ICMS próprio | Fase 4; MD-05 e casos MD-12 | ICMS próprio comum PR, diferimento, rateio e conferência entregues; homologação real pendente |
| 6 | ST, DIFAL, FCP e tratamentos especiais | Fase 5; MD-06 e casos MD-12 | ICMS-ST por MVA e FCP-ST no recorte PR entregues; demais módulos e cobertura pendentes |
| 7 | Ciclo documental, eventos e consolidação | Fases 3, 5 e 6; MD-07 | Conferência mensal, conflitos e revisão cancelamento/CC-e entregues; demais efeitos pendentes |
| 8 | Relatório XLSX auditável | Fase 7; MD-08 | Exportação XLSX layout 4 entregue; validação do contador e extensões pendentes |
| 9 | Pacotes de configuração, retenção e backup | Fase 2; MD-09 e MD-10 | ICMSPACK e backup/restauração entregues; retenção fiscal dos XMLs pendente |
| 10 | Escala, homologação e distribuição Windows | Todas as anteriores; MD-11 a MD-13 | Worker, retomada e instalador inicial entregues; homologação fiscal e Windows real pendentes |
| P | Doações básicas com Stripe (US09) | Checkout, retorno seguro e webhook; validação acadêmica do fluxo | Planejada, independente das decisões fiscais do contador |

## Dependências do questionário enviado ao contador

O questionário **ContabiliNico | Perguntas para homologação do cálculo de ICMS**
não tem uma devolutiva de homologação registrada nesta revisão. Desde a revisão
de 28/09, o responsável aprovou o recorte PR e os incrementos DT-040 a DT-052;
eles já estão implementados. As perguntas abaixo continuam úteis para ampliar o
contrato e validar casos reais. Os exemplos sintéticos não substituem a devolutiva
com fundamento, vigência e responsável pela revisão.

| Perguntas | Decisão esperada | Marco e trabalho que dependem da resposta |
|---|---|---|
| 1–4 | Recorte inicial, alíquotas aplicáveis, dados obrigatórios e exceções/precedência legal | MD-05; campos fiscais e publicação de regras concretas na fase 4; seleção fiscal da fase 5 |
| 5–9 | Fórmula da base por item, cálculo por dentro, frete, seguro, despesas, desconto, IPI, redução e benefícios | MD-05; composição da base e primeiro cálculo de ICMS próprio na fase 5 |
| 10–13 | Rateio e centavo residual, escalas e arredondamento, tolerância por componente, zero/negativos/dados ausentes | MD-05; resultado definitivo, comparação e reconciliação da fase 5. A biblioteca `decimal.js` já foi escolhida; a política fiscal continua aberta |
| 14–15 | Efeito de protocolo não verificado, conflitos e eventos posteriores no caráter do resultado e nos totais | MD-07; fase 7 e consolidação definitiva usada pelo relatório |
| 16 e seção 6 | Casos fora da primeira versão e ordem dos módulos complementares | MD-06; divisão da US04 e sequência de ST, DIFAL, FCP e tratamentos especiais na fase 6 |
| 17–18 | Evidência necessária na memória de cálculo e liberação fiscal das regras | MD-05/MD-12; qualquer usuário local pode operar o ciclo de versões conforme DT-034, mas a liberação de regras tributárias reais ainda depende da validação fiscal |
| Casos A–E | XMLs anonimizados, resultados independentes do declarado, fundamento, vigência e identificação do revisor | MD-12; testes de regressão e liberação fiscal da fase 5 e da fase 10 |

**Pode avançar enquanto os casos reais não chegam:** instalar e verificar o
recorte atual no Windows, conferir backups e exportações e preparar o procedimento
operacional. As decisões já aprovadas estão nos documentos de escopo e nas DTs.

**Ainda depende da devolutiva:** homologação fiscal (MD-12), ampliação dos contratos
MD-05/MD-06 e efeitos documentais ainda não implementados de MD-07. A ausência de
casos reais não impede a instalação técnica de teste.

## Marcos de decisão

### MD-01 — Estratégia de parsing e validação XML

**Aqui precisamos decidir para avançar:**

- [x] versões de NF-e modelo 55 e NFC-e modelo 65 suportadas no MVP: leiaute 4.00, conforme DT-018;
- [x] primeira entrega limitada a documentos NF-e/NFC-e; protocolos e eventos entram em incremento posterior;
- [x] assinatura digital não será validada no MVP; o resultado informa `ASSINATURA_NAO_VERIFICADA`;
- [x] incompatibilidade tolerável gera aviso e dados insuficientes geram `INFORMACOES_FALTANTES`;
- [x] `fast-xml-parser` e `xmllint-wasm` aprovados na DT-020;
- [x] executar a prova de conceito documentada em `prova-conceito-parser-xml.md`;
- [x] neste incremento estrutural, aceitar `nfeProc`/`protNFe` 4.00 e `procEventoNFe`/`evento` 1.00; versões diferentes são recusadas;
- [x] revisão inicial, uso e origem dos schemas XSD 4.00: `PL_010f_v1.04`;
- [x] catálogo objetivo de aviso, pendência e erro impeditivo, conforme DT-021;
- [x] proteção contra DTD e entidades externas;
- [x] limites técnicos de profundidade e tamanho de NF-e/NFC-e e ZIP, conforme MD-04;
- [x] aplicar aos protocolos e eventos os limites comuns de 10 MB por XML, profundidade máxima de 100 elementos e ZIP conforme MD-04; validação XSD específica ainda pendente.

**Desbloqueia:** normalização real de XML, protocolos e eventos.

### MD-02 — Política de duplicidade e associação

**Aqui precisamos decidir para avançar:**

- [x] mesma chave e mesmo hash no mesmo lote: calcular e marcar ocorrências posteriores como `REPETIDA`;
- [x] mesma chave com conteúdo diferente: calcular cada ocorrência e alertar o conflito;
- [x] repetição entre lotes: nova ocorrência e novo cálculo no lote correspondente;
- [x] cada envio confirmado cria um lote com UUID e data/hora de recebimento;
- [x] repetição idêntica: somente a primeira ocorrência elegível participa dos totais;
- [x] conteúdo conflitante: todas as ocorrências ficam fora dos totais até resolução auditada;
- [x] classificador determinístico implementado com repetição e conflito em eixos
  separados, vínculo à original e elegibilidade para totais;
- deduplicação de protocolos e eventos;
- retenção e reprocessamento de eventos órfãos quando eventos forem implementados;
- identidade fiscal usada para considerar dois eventos iguais.

**Desbloqueia:** inventário idempotente e relacionamento confiável do lote.

### MD-03 — Persistência física

**Aqui precisamos decidir para avançar:**

- [x] resultados históricos imutáveis; recálculo cria nova execução com snapshot
  das entradas, regras, versão do motor e memória de cálculo, conforme DT-023;
- [x] `node:sqlite` encapsulado no pacote `database`, sem ORM, conforme DT-027;
- [x] schema físico inicial de organização, empresa, lote e ocorrência na migration `0001`;
- [x] completar schema, índices e restrições para versões de seleção de regras e trilha de auditoria;
- [ ] completar os campos de resultado tributário das regras após MD-05/MD-06;
- [x] inativação de cadastros utilizados, imutabilidade de regras publicadas e
  proibição de cascatas destrutivas sobre o histórico, conforme DT-028;
- [x] decimais como texto canônico, UUIDs textuais e datas fiscais preservadas
  junto ao instante UTC normalizado, conforme DT-029;
- [x] uma empresa analisada por lote, com identificação assistida pelos CNPJs dos
  XMLs e rejeição fiscal de documentos divergentes, conforme DT-030;
- [x] migrations SQL incrementais, imutáveis, com checksum, backup prévio e
  execução transacional somente para frente, conforme DT-027;
- [x] instância única, SQLite controlado pelo processo principal e gravações
  transacionais centralizadas; workers não acessam o banco diretamente, conforme
  DT-024;
- [x] checkpoint transacional por documento e retomada apenas do trabalho não
  concluído, conforme DT-025;
- [x] capacidade inicial: uma operação ativa e uma entrada XML em processamento por vez,
  com leitura do ZIP aguardando o estágio temporário da nota; medir ajuste em MD-11;
- [x] recuperação de execução interrompida;
- [x] idempotência por `solicitacaoId + documentoId`, distinguindo retomada de
  recálculo explícito, conforme DT-026.

**Desbloqueia:** cadastros persistentes, histórico, auditoria e lotes reais.

### MD-04 — Limites seguros de entrada

**Aqui precisamos decidir para avançar:**

- [x] sem limite comercial por quantidade; volume de referência de 1.000 notas,
  com processamento incremental e cancelável;
- [x] tamanho máximo de 10 MB por XML e 500 MB por ZIP;
- [x] limite de 2 GB de conteúdo expandido e taxa máxima de compressão de 100:1;
- [x] limite de 10.000 entradas por ZIP, 20 segmentos de caminho e 100 elementos
  aninhados no XML;
- [x] rejeitar isoladamente entradas inseguras e aproveitar as entradas válidas;
  rejeitar o ZIP inteiro somente em falha estrutural ou violação de limite global;
- [x] no cancelamento, concluir somente a unidade atual, limpar temporários,
  preservar checkpoints e diagnósticos fora dos totais e permitir retomada manual.

**Desbloqueia:** upload de pasta/ZIP com proteção operacional definida.

### MD-05 — Contrato do ICMS próprio

O recorte comum PR e sua precisão, composição e rateio estão aprovados nas
DT-040 a DT-043. A lista abaixo descreve a cobertura completa ainda a ampliar
e homologar; não bloqueia o contrato já implementado.

**Contrato completo:**

- fórmula completa do ICMS próprio;
- composição da base com frete, seguro, desconto, despesas e IPI;
- redução de base e cálculo por dentro;
- rateio de valores da nota entre itens;
- `decimal.js` escolhida na DT-032; aprovar escalas, limites de precisão e divisão/rateio;
- arredondamento por etapa e por componente;
- tolerância usada na comparação com o XML;
- tratamento de zero e valores negativos.

**Desbloqueia:** primeiro cálculo fiscal homologável de ponta a ponta.

### MD-06 — Contratos dos demais módulos fiscais

ST por MVA, FCP-ST e MVAs especiais no recorte PR estão implementados nas
DT-049 a DT-052. Os demais métodos, produtos, datas e regimes precisam de
contratos próprios e homologação.

**Cobertura completa a contratar:**

- ICMS-ST por MVA, MVA ajustada, pauta, PMPF e preço máximo;
- DIFAL e partilha quando aplicável;
- FCP e FCP-ST;
- isenção, não incidência, diferimento, desoneração e benefícios;
- Simples Nacional, CST/CSOSN e hipóteses de crédito;
- débito, crédito, estorno e valores apenas informativos;
- efeito fiscal da devolução na perspectiva da empresa.

**Desbloqueia:** cobertura fiscal prevista para o MVP.

### MD-07 — Precedência dos estados documentais

**Aqui precisamos decidir para avançar:**

- ordem final entre cancelamento, rejeição, denegação, manifestações, CC-e,
  contingência e pendências fiscais;
- participação de `NAO_VERIFICADA` no total definitivo ou provisório;
- comportamento de um evento posterior sobre resultados anteriores;
- quais mudanças reprocessam automaticamente uma nota;
- critérios finais para `DEFINITIVO`, `PROVISORIO` e `DIAGNOSTICO`.

**Desbloqueia:** consolidação determinística das notas e dos lotes.

### MD-08 — Contrato do XLSX

O contrato inicial com ExcelJS, abas e formatação está na DT-045; layout 4 e
abas condicionais de eventos/conflitos seguem as DT-047 a DT-052. A lista abaixo
guia a revisão com o contador e futuras extensões.

**Contrato a homologar e ampliar:**

- biblioteca de geração de XLSX;
- abas definitivas e necessidade de uma aba `Eventos`;
- colunas, ordem, tipos, filtros e painéis congelados;
- fórmulas de reconciliação e linhas de total;
- apresentação de valores definitivos, provisórios, diagnósticos e excluídos;
- formatação monetária, datas, casas decimais e versão do relatório.

**Desbloqueia:** relatório final utilizável e testável por contrato.

### MD-09 — Retenção e proteção dos dados

**Aqui precisamos decidir para avançar:**

- limites mínimo e máximo da retenção configurável;
- evidências preservadas após excluir o XML original;
- avisos, carência, auditoria e possibilidade de recuperação;
- proteção do SQLite, temporários, relatórios e `.icmspack`;
- necessidade de criptografia em repouso ou senha nos pacotes.

**Desbloqueia:** expurgo seguro e política de proteção implementável.

### MD-10 — Backup e restauração

Backup manual e diário, sete automáticas, destino escolhido e restauração validada
do SQLite estão implementados nas DT-037/DT-039. Homologação operacional Windows,
criptografia e ampliação do conteúdo permanecem pendentes.

**Contrato operacional a homologar e ampliar:**

- backup manual, automático ou ambos;
- periodicidade e retenção;
- destinos permitidos;
- conteúdo, compactação e criptografia;
- validação de integridade e teste de restauração;
- separação operacional entre backup e `.icmspack`.

**Desbloqueia:** continuidade e recuperação da instalação local.

### MD-11 — Metas de escala e observabilidade

**Aqui precisamos decidir para avançar:**

- volume de referência e tempo máximo aceitável por lote;
- computador de referência;
- quantidade de workers e limite de memória;
- pausa, retomada e cancelamento;
- formato e retenção dos logs;
- métricas locais e exportação de diagnóstico sem dados fiscais indevidos.

**Desbloqueia:** otimização mensurável e critérios de desempenho.

### MD-12 — Homologação fiscal

**Aqui precisamos decidir para avançar:**

- casos aprovados por contador para cada módulo;
- massa de XMLs anonimizada e resultados esperados;
- evidências fiscais para liberar regras tributárias reais; o ciclo local de versões e revogação está na DT-034;
- regressão por versão do motor e da regra;
- evidências mínimas para liberar uma versão.

**Desbloqueia:** declaração responsável de que o MVP está pronto para uso.

### MD-13 — Instalação e atualização no Windows

**Aqui precisamos decidir para avançar:**

- [ ] homologar versões de Windows de usuário final suportadas;
- [x] distribuição inicial x64;
- [x] instalador NSIS configurado e verificação automatizada em Windows Server 2022;
- [x] instalação por usuário com escolha de pasta;
- assinatura de código;
- atualização automática ou manual, canal e rollback;
- compatibilidade e backup do banco durante atualizações.

**Desbloqueia:** distribuição do aplicativo fora do ambiente de desenvolvimento.

## Fases de implementação

### Fase 0 — Fundação técnica

**Estado:** concluída.

- [x] criar monorepo com pnpm;
- [x] configurar Electron, Vue, TypeScript, Vite, Pinia e Vue Router;
- [x] separar processo principal, preload e renderer;
- [x] impedir acesso Node direto no renderer;
- [x] criar pacotes de domínio, contratos, parser, motor, banco e relatório;
- [x] criar seleção inicial de arquivos XML/ZIP por IPC;
- [x] configurar typecheck, testes e build;
- [x] implementar e testar a precedência aprovada de regras.

**SAÍDA:** `pnpm check` aprovado e aplicativo desktop inicial executável.

### Fase 1 — Contratos de ingestão e testes

**PODE AVANÇAR:**

- [x] definir tipos normalizados para nota e item sem acoplar a uma biblioteca XML;
- [x] definir tipos normalizados para protocolo e evento nas versões do
  incremento estrutural;
- [x] criar códigos estruturados de erro e pendência de ingestão;
- [x] criar builders de teste e fixtures sintéticas sem dados reais;
- [x] testar inventário independente da ordem dos arquivos;
- [x] criar contrato de hash e proveniência do arquivo;
- [x] classificar ocorrências repetidas e conteúdos conflitantes sem depender da
  ordem de entrada;
- [x] preparar testes de segurança para XXE, Zip Slip, ZIP corrompido e ZIP
  expansivo;

**DECISÃO NECESSÁRIA:** as versões do incremento estrutural de protocolos e eventos
estão registradas na DT-036. Deduplicação, identidade fiscal e associação posterior
de órfãos continuam em MD-02.

**SAÍDA:** contratos revisados, fixtures versionadas e testes de aceitação da
ingestão prontos para receber a implementação.

### Fase 2 — Persistência e cadastros básicos

**PODE AVANÇAR:**

- [x] desenhar os repositórios de organização e empresa a partir do modelo aprovado;
- [x] implementar onboarding de organização única e tela persistente de empresa;
- [x] implementar cadastro inicial de perfil fiscal e produto de fornecedor;
- [x] definir casos de uso sem detalhes de SQLite;
- [x] validar CNPJ, UF e identificadores normalizados no domínio;
- [x] validar as datas e a vigência inicial dos perfis fiscais.

**Implementado:** cadastros, regras versionadas, documentos, cálculos e auditoria
do recorte atual estão persistidos. Ampliações de campos tributários configuráveis
continuam sujeitas aos contratos MD-05/MD-06.

Após a decisão:

- [x] criar conexão `node:sqlite`, banco da instalação e executor de migrations;
- [x] registrar versão, checksum, data e versão do aplicativo, com rollback da
  migration que falhar;
- [x] criar e validar backup antes de aplicar migrations pendentes sobre um banco
  com schema de usuário;
- [x] testar criação, ordenação, idempotência, checksum, rollback, reabertura e
  chaves estrangeiras;
- [x] criar a migration `0001` com organização, empresa, lote e ocorrência de
  arquivo, incluindo índices, checks e foreign keys restritivas;
- [x] persistir e consultar organização, empresa, lote e ocorrência de arquivo;
- [x] expor organização e empresa ao renderer por contratos IPC restritos;
- [x] persistir perfil fiscal e produto de fornecedor;
- [x] concluir transações dos casos de uso e trilha básica de auditoria;
- [x] testar criação, consulta, inativação, rollback e reinicialização para as
  entidades da migration `0001`;
- [x] testar atualização versionada de organização, empresa, perfil e produto;
- [x] testar atualização versionada de regras no catálogo persistido (DT-034/DT-035).

**SAÍDA:** cadastros permanecem íntegros após fechar e reabrir o aplicativo.

### Fase 3 — Ingestão completa do lote

**Dependências:** fases 1 e 2; MD-01, MD-02 e MD-04 aprovados.

- [x] inventariar e persistir arquivos antes de relacioná-los;
- [x] ler XML/ZIP sequencialmente com limites de segurança;
- [x] validar formato, versão, ambiente e schema de NF-e/NFC-e 4.00;
- [x] normalizar e persistir NF-e/NFC-e e seus itens;
- [x] normalizar e persistir protocolos e eventos nas versões aceitas, com
  associação por chave no lote, estado órfão ou ambíguo e proveniência da ocorrência;
- [x] calcular e persistir hashes SHA-256;
- [x] classificar repetições e conflitos por chave independentemente da ordem;
- [x] identificar candidatos a empresa pelos CNPJ de XMLs diretos e de ZIPs,
  com escolha explícita e cadastro assistido quando necessário;
- [x] separar produção e homologação, exigindo confirmação do ambiente do lote e
  preservando documentos divergentes como pendência inelegível para cálculo;
- [x] continuar o inventário após erro isolado;
- [x] apresentar progresso por entrada na inspeção e no processamento, com
  cancelamento cooperativo e preservação do trabalho parcial;
- [x] apresentar histórico detalhado do lote, documentos, itens, ocorrências e
  diagnósticos.

**Limite desta entrega:** a associação de protocolos e eventos é estrutural e
com vínculo inicial no lote. A DT-047 acrescenta associação e revisão auditadas
de cancelamento/CC-e entre lotes. Ainda faltam validação XSD própria, resolução de
eventos inconsistentes, deduplicação ampliada e protocolos órfãos (MD-02).
A precedência dos demais estados e tipos documentais continua em MD-07.

**SAÍDA:** um lote real é importado de forma segura, idempotente e auditável, mas
ainda sem promessa de cálculo fiscal completo.

### Fase 4 — Gestão e localização de regras

**Já iniciado:** seleção por nível, especificidade, prioridade e ambiguidade;
perfis fiscais e vínculos com produtos de fornecedor já estão persistidos.
O ciclo de vida local das versões e sua seleção nas novas avaliações estão
implementados. Resultados tributários continuam aguardando MD-05/MD-06.

- [x] cadastrar condições de igualdade exata com catálogo compartilhado, opções
  por código e validação de formato no processo principal; rascunhos legados são
  revalidados na aprovação;
- [ ] cadastrar resultados tributários após MD-05/MD-06;
- [x] implementar rascunho, aprovação para seleção, nova versão e revogação no catálogo local;
- [x] exigir fundamento legal e vigência para aprovação da seleção;
- [x] detectar sobreposição potencial e avisar sobre empates possíveis;
- [x] vincular produto de fornecedor a perfil fiscal, por empresa e CNPJ do emitente;
- [x] registrar candidatas consideradas e explicação da seleção;
- [x] gerar pendências `REGRA_NAO_ENCONTRADA`, `REGRA_AMBIGUA`,
  `PRODUTO_NAO_CLASSIFICADO` e `DIVERGENCIA_CADASTRAL`;
- [x] cobrir a precedência com testes de tabela.

**DECISÃO NECESSÁRIA:** campos fiscais cujo significado depende dos contratos de
cálculo podem ser cadastrados somente depois de MD-05 e MD-06.

**SAÍDA:** cada item encontra uma única regra versionada ou uma pendência explícita.

### Fase 5 — Motor de ICMS próprio

**Para concluir e liberar resultado fiscal definitivo:** fase 4, MD-05 e
casos iniciais de MD-12 aprovados pelo contador. O recorte comum interno PR já
está implementado nas DT-040 a DT-044; ainda não está homologado por casos reais.

- [x] preparar operações decimais com `decimal.js` e contrato tipado de memória;
- [x] persistir execuções imutáveis e preservar a memória técnica disponível;
- [x] aplicar precisão decimal, HALF_UP e tolerância de conferência aprovados para o recorte PR; homologação fiscal pendente;
- [x] implementar composição da base comum PR, incluindo IPI/desconto confirmados;
- [ ] implementar redução da base e benefícios além do recorte comum;
- [ ] implementar cálculo por dentro;
- [x] implementar rateio rastreável;
- [x] calcular ICMS próprio por item;
- [x] comparar calculado e declarado por tolerância;
- [x] produzir memória de cálculo estruturada;
- [x] somar a nota a partir dos itens já arredondados;
- [x] excluir itens pendentes dos valores calculados e manter subtotais de conferência; apuração definitiva pendente;
- [x] criar testes de limites, rateio, memória e regressão sintética do recorte;
- [ ] executar regressão fiscal com XMLs reais aprovados pelo contador.

**SAÍDA:** operação interna e interestadual de ICMS próprio passam pelos casos
homologados com memória reproduzível.

### Fase 6 — Módulos fiscais complementares

**Dependências:** fase 5 e partes correspondentes de MD-06 aprovadas.

Implementar em incrementos separados, cada um com casos homologados:

- [x] ICMS-ST de compras PR por MVA manual, catálogo dos arts. 12/16 e ajustes (DT-049/DT-050);
- [x] MVAs condicionais de combustíveis não monofásicos e veículos (DT-052);
- [ ] ICMS-ST fora desse recorte: demais tabelas/vigências, pauta/PMPF/preço prioritário, descontos e reduções;
- [ ] tributação monofásica de combustíveis;
- [ ] DIFAL;
- [x] FCP-ST separado de 2% nas condições cobertas (DT-051/DT-052);
- [ ] FCP próprio e FCP-ST fora do recorte;
- [x] diferimento parcial do ICMS comum PR nas condições aprovadas;
- [ ] demais isenções, não incidências, diferimentos e desonerações;
- [ ] Simples Nacional e CST/CSOSN;
- [ ] débito, crédito, estorno e valores informativos;
- [ ] complementar e devolução.

**Regra de avanço:** um módulo não bloqueia o desenvolvimento técnico dos demais,
mas nenhum é considerado concluído sem contrato fiscal e casos aprovados.

**SAÍDA:** componentes permanecem separados e reconciliáveis por item e nota.

### Fase 7 — Ciclo documental e consolidação

**Dependências:** fases 3, 5 e 6; MD-07 aprovado.

- [ ] validar autorização e protocolo;
- [ ] aplicar cancelamento, rejeição, denegação e inutilização;
- [x] relacionar e revisar cancelamento/CC-e entre lotes com decisões auditadas (DT-047);
- [ ] processar manifestações do destinatário;
- [ ] tratar contingência;
- [ ] vincular complementar, devolução e substituição;
- [x] reavaliar e recalcular itens por novas execuções imutáveis;
- [x] separar situação documental, cálculo, caráter e participação na conferência;
- [x] comparar versões da mesma chave/ambiente e resolver conflitos com justificativa, reabertura e histórico (DT-048);
- [x] reunir conferência mensal entre lotes por empresa, deduplicar cópias e rastrear origens (DT-046);
- [x] consolidar subtotais de conferência por componente, separando protocolo, pendências e exclusões;
- [ ] homologar consolidação definitiva e ampliar precedência documental;
- [x] preservar explicação das exclusões e pendências do recorte implementado.

**SAÍDA:** a mesma entrada e as mesmas versões sempre produzem o mesmo estado e
os mesmos totais.

### Fase 8 — Relatório XLSX

- [x] criar modelo interno de dados de relatório independente da biblioteca,
  com snapshot de notas, itens, pendências, candidatas, diagnósticos, ocorrências,
  protocolos e eventos; preservar versões, precisão e evidências sem gerar totais.
  Contrato técnico em [Modelo de dados do relatório](modelo-de-dados-relatorio.md).

**Implementado:** contrato inicial DT-045 e extensões DT-046 a DT-052, atualmente layout 4. Aprovação fiscal e futuras extensões de MD-08 permanecem pendentes.

- [x] gerar resumo de notas;
- [x] gerar detalhamento de itens;
- [x] gerar pendências, regras aplicadas e erros XML;
- [x] representar eventos e documentos excluídos;
- [x] usar células monetárias numéricas quando a precisão permite e preservar a emissão original como texto;
- [x] adicionar filtros, congelamento e formatação aprovados;
- [x] reconciliar totais com os itens;
- [x] registrar versão do relatório, motor e regras;
- [x] testar conteúdo e estrutura do arquivo gerado.

**SAÍDA:** XLSX aprovado pelo contador e reconciliado automaticamente nos testes.

### Fase 9 — Intercâmbio, retenção e continuidade

#### 9A — Pacotes `.icmspack`

- [x] definir manifesto versionado e codec inicial para cadastros existentes;
- [x] validar versão, contagens, hashes, schema e referências internas no codec;
  contrato em [ICMSPACK v1](contrato-icmspack-v1.md);

- [x] exportar manifesto e cadastros aprovados;
- [x] integrar a validação do pacote ao fluxo de importação;
- [x] apresentar novidades e conflitos;
- [x] importar tudo em uma única transação;
- [x] garantir rollback integral em caso de erro.

#### 9B — Retenção

**DECISÃO NECESSÁRIA:** MD-09.

- [ ] configurar período;
- [ ] avisar e registrar expurgo;
- [ ] apagar XML sem apagar evidência obrigatória;
- [x] limpar temporários técnicos abandonados e checkpoints de lotes concluídos, preservando pontos pendentes; retenção fiscal segue em MD-09.

#### 9C — Backup e restauração

**DECISÃO NECESSÁRIA:** MD-10.

- [x] criar e validar backup manual, com agendamento diário após o primeiro sucesso;
- [x] manter sete cópias automáticas configuráveis e preservar cópias manuais;
- [x] restaurar os dados persistidos do SQLite pela interface, com cópia de segurança e reinício;
- [x] testar corrupção, incompatibilidade e restauração interrompida; homologação Windows pendente.

**SAÍDA:** configurações podem ser transferidas, e a instalação pode ser recuperada
sem confundir intercâmbio com backup.

### Fase 10 — Escala, homologação e entrega

**Dependências:** MD-11, MD-12 e MD-13.

- [x] mover importação confirmada e gravação para worker; inspeção e reavaliação ainda no processo principal;
- [ ] limitar concorrência, memória e temporários;
- [x] implementar pausa e retomada por checkpoints, preservando cancelamento parcial;
- [x] medir 1.000 notas sintéticas no ambiente Linux de desenvolvimento; homologação Windows pendente;
- [ ] implementar logs locais e pacote seguro de diagnóstico;
- [ ] executar a suíte fiscal homologada;
- [x] testar migrations, backup prévio e recuperação transacional automatizada; matriz de atualização em Windows real pendente;
- [x] configurar geração do instalador Windows NSIS x64 por usuário e verificação no GitHub Actions;
- [ ] assinar artefatos conforme decisão;
- [x] automatizar instalação limpa, abertura, XLSX e importação/retomada no Windows Server 2022;
- [ ] testar instalação, atualização e rollback em Windows de usuário final;
- [ ] preparar manual operacional e checklist de suporte.

**SAÍDA:** versão candidata do MVP com evidência fiscal, técnica e operacional.

### Trilha P — Doações básicas com Stripe

**Escopo aprovado pelo responsável do produto:** US09. A doação não altera o
cálculo de ICMS nem envia documentos fiscais ao Stripe.

- [ ] definir o componente online que criará sessões Checkout e receberá o
  webhook verificado para a aplicação desktop local;
- [ ] criar pedido de doação com valor em BRL, identificador e estado pendente;
- [ ] integrar Stripe Checkout em ambiente de testes;
- [ ] confirmar pagamento pelo webhook de forma idempotente, sem confiar apenas
  na página de retorno;
- [ ] testar pagamento aprovado, cancelado, falho e entrega repetida do webhook;
- [ ] validar com o professor se pedido de doação e confirmação do pagamento
  atendem ao requisito acadêmico de pagamento.

**SAÍDA:** doação testável de ponta a ponta, sem armazenar dados de cartão e sem
marcar pedido como pago antes da confirmação verificada.

## Ordem recomendada para os próximos incrementos

1. **MD-13 — instalação de teste:** conferir o pipeline, obter o instalador e
   validar importação, perguntas fiscais, XLSX e backup/restauração no Windows.
2. **MD-12 — casos reais:** comparar o resultado independente do contador com
   XMLs representativos do recorte, especialmente ST/FCP-ST e MVAs especiais.
3. **MD-09/MD-11/MD-13 — operação:** fechar retenção dos XMLs, suporte,
   desempenho em máquina real, compatibilidade, assinatura e atualização.
4. **MD-05/MD-06/MD-07 — expansão:** priorizar as operações reais que ficarem
   fora da cobertura e implementar um contrato fiscal/documental por vez.
5. **Trilha P — doações:** validar seu enquadramento acadêmico e definir a
   integração online; independe da instalação de teste e da revisão fiscal.

## Critério geral para avançar entre fases

Uma fase só está concluída quando:

1. as decisões que afetam seu comportamento estão registradas como aprovadas;
2. os critérios de aceite correspondentes possuem testes;
3. entradas inválidas falham de forma explícita e auditável;
4. o resultado não depende da ordem dos arquivos nem de estado oculto;
5. a documentação descreve o comportamento efetivamente implementado;
6. `pnpm check` permanece aprovado.

Trabalho exploratório pode ocorrer antes de um marco, mas não deve entrar no motor
fiscal ou congelar um contrato externo enquanto a decisão correspondente estiver
aberta.
