# Roadmap de implementação do MVP

Este roadmap organiza a implementação em incrementos verificáveis e mostra onde
uma decisão fiscal ou técnica precisa ser aprovada antes de avançar. Ele não
substitui [Decisões pendentes](decisoes-pendentes.md): o backlog continua sendo a
fonte oficial das questões abertas, e as decisões aprovadas devem ser registradas
em [Decisões técnicas](decisoes-tecnicas.md) e nos documentos definitivos.

Não há datas fixadas neste momento. Cada fase somente recebe prazo depois que seu
marco de decisão estiver aprovado e o escopo estiver suficientemente definido.

**Revisão de andamento:** 28/09/2026, considerando a `main` até o PR #4 e o
questionário de homologação enviado ao contador. Os campos de resposta do
questionário ainda estavam vazios nesta revisão.

## Legenda

- `[x]` concluído;
- `[ ]` implementação ainda não iniciada;
- `PODE AVANÇAR` trabalho protegido das decisões ainda abertas;
- `DECISÃO NECESSÁRIA` ponto em que implementar sem aprovação criaria regra
  fiscal, comportamento ou compromisso técnico indevido;
- `SAÍDA` evidência necessária para considerar a fase concluída.

## Visão geral

| Fase | Resultado principal | Dependência para começar | Estado |
|---|---|---|---|
| 0 | Fundação do monorepo e shell desktop | Decisões técnicas já aprovadas | Concluída |
| 1 | Contratos de ingestão e massa de testes | MD-01 e MD-02 | Núcleo NF-e/NFC-e entregue; protocolos e eventos posteriores |
| 2 | Persistência local e cadastros básicos | MD-03 | Em andamento; faltam casos de uso, auditoria e fechamento do schema |
| 3 | Ingestão completa de XML/ZIP | Fases 1 e 2; MD-04 | Núcleo NF-e/NFC-e entregue; protocolos e eventos posteriores |
| 4 | Gestão e seleção de regras fiscais | Fase 2; MD-05/MD-06 para campos fiscais | Em andamento; ciclo de publicação e explicação pendentes |
| 5 | Motor de ICMS próprio | Fase 4; MD-05 e casos MD-12 | Base decimal e memória preparadas; cálculo fiscal aguardando contador |
| 6 | ST, DIFAL, FCP e tratamentos especiais | Fase 5; MD-06 e casos MD-12 | Aguardando contratos fiscais e prioridade do contador |
| 7 | Ciclo documental, eventos e consolidação | Fases 3, 5 e 6; MD-07 | Histórico técnico parcial; regras documentais aguardando decisão |
| 8 | Relatório XLSX auditável | Fase 7; MD-08 | Aguardando contrato do relatório e resultados consolidados |
| 9 | Pacotes de configuração, retenção e backup | Fase 2; MD-09 e MD-10 | Aguardando decisões operacionais |
| 10 | Escala, homologação e distribuição Windows | Todas as anteriores; MD-11 a MD-13 | Aguardando fases anteriores e homologação |
| P | Doações básicas com Stripe (US09) | Checkout, retorno seguro e webhook; validação acadêmica do fluxo | Planejada, independente das decisões fiscais do contador |

## Dependências do questionário enviado ao contador

O questionário **ContabiliNico | Perguntas para homologação do cálculo de ICMS**
continua sem respostas na revisão de 28/09/2026. As perguntas abaixo indicam o
que falta aprovar; nenhuma alíquota de exemplo, fórmula ou caso sintético deve
ser tratado como regra fiscal homologada antes da devolutiva com fundamento,
vigência e responsável pela revisão.

| Perguntas | Decisão esperada | Marco e trabalho que dependem da resposta |
|---|---|---|
| 1–4 | Recorte inicial, alíquotas aplicáveis, dados obrigatórios e exceções/precedência legal | MD-05; campos fiscais e publicação de regras concretas na fase 4; seleção fiscal da fase 5 |
| 5–9 | Fórmula da base por item, cálculo por dentro, frete, seguro, despesas, desconto, IPI, redução e benefícios | MD-05; composição da base e primeiro cálculo de ICMS próprio na fase 5 |
| 10–13 | Rateio e centavo residual, escalas e arredondamento, tolerância por componente, zero/negativos/dados ausentes | MD-05; resultado definitivo, comparação e reconciliação da fase 5. A biblioteca `decimal.js` já foi escolhida; a política fiscal continua aberta |
| 14–15 | Efeito de protocolo não verificado, conflitos e eventos posteriores no caráter do resultado e nos totais | MD-07; fase 7 e consolidação definitiva usada pelo relatório |
| 16 e seção 6 | Casos fora da primeira versão e ordem dos módulos complementares | MD-06; divisão da US04 e sequência de ST, DIFAL, FCP e tratamentos especiais na fase 6 |
| 17–18 | Evidência necessária na memória de cálculo e liberação fiscal das regras | MD-05/MD-12; qualquer usuário local pode operar o ciclo de versões conforme DT-034, mas a liberação de regras tributárias reais ainda depende da validação fiscal |
| Casos A–E | XMLs anonimizados, resultados independentes do declarado, fundamento, vigência e identificação do revisor | MD-12; testes de regressão e liberação fiscal da fase 5 e da fase 10 |

**Pode avançar enquanto o contador responde:** terminar os itens técnicos das
fases 2 e 4 que não fixam fórmula, alíquota ou tratamento fiscal; preparar
infraestrutura decimal, testes sintéticos e estrutura de memória sem declarar
resultado fiscal definitivo; desenvolver a trilha independente de doações.

**Bloqueado pela devolutiva:** aprovar MD-05, publicar regras tributárias reais,
concluir o motor de ICMS próprio, homologar seus resultados e avançar os módulos
de MD-06. O contrato MD-07 recebe subsídios das respostas 14–15, mas também
exige decisões próprias sobre eventos e precedência documental.

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

**Aqui precisamos decidir para avançar:**

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

**Aqui precisamos decidir para avançar:**

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

**Aqui precisamos decidir para avançar:**

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

**Aqui precisamos decidir para avançar:**

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

- versões do Windows e arquiteturas suportadas;
- ferramenta e formato do instalador;
- instalação por usuário ou por máquina;
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

**DECISÃO NECESSÁRIA:** a migration `0001` e os repositórios básicos já
existem. Fechar o restante da MD-03 antes de persistir regras versionadas e
auditoria de domínio.

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
- [ ] testar atualização versionada de regras quando seu schema for implementado.

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
restrita ao lote importado. Ainda faltam validação XSD própria, deduplicação e
associação posterior de órfãos (MD-02). A precedência documental, reprocessamento
e participação nos totais continuam em MD-07.

**SAÍDA:** um lote real é importado de forma segura, idempotente e auditável, mas
ainda sem promessa de cálculo fiscal completo.

### Fase 4 — Gestão e localização de regras

**Já iniciado:** seleção por nível, especificidade, prioridade e ambiguidade;
perfis fiscais e vínculos com produtos de fornecedor já estão persistidos.
O ciclo de vida local das versões e sua seleção nas novas avaliações estão
implementados. Resultados tributários continuam aguardando MD-05/MD-06.

- [ ] implementar cadastro estruturado de condições e resultados;
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
casos iniciais de MD-12 aprovados pelo contador. A preparação técnica já começou.

- [x] preparar operações decimais com `decimal.js` e contrato tipado de memória;
- [x] persistir execuções imutáveis e preservar a memória técnica disponível;
- [ ] aprovar e aplicar escalas, divisões e política fiscal de arredondamento;
- [ ] implementar composição e redução da base;
- [ ] implementar cálculo por dentro;
- [ ] implementar rateio rastreável;
- [ ] calcular ICMS próprio por item;
- [ ] comparar calculado e declarado por tolerância;
- [ ] produzir memória de cálculo estruturada;
- [ ] somar a nota a partir dos itens já arredondados;
- [ ] impedir total definitivo quando houver item pendente;
- [ ] criar testes de propriedade, limites e regressão.

**SAÍDA:** operação interna e interestadual de ICMS próprio passam pelos casos
homologados com memória reproduzível.

### Fase 6 — Módulos fiscais complementares

**Dependências:** fase 5 e partes correspondentes de MD-06 aprovadas.

Implementar em incrementos separados, cada um com casos homologados:

- [ ] ICMS-ST;
- [ ] DIFAL;
- [ ] FCP e FCP-ST;
- [ ] isenção, não incidência, diferimento e desoneração;
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
- [ ] relacionar e revisar CC-e;
- [ ] processar manifestações do destinatário;
- [ ] tratar contingência;
- [ ] vincular complementar, devolução e substituição;
- [ ] reprocessar sem sobrescrever histórico;
- [ ] separar situação documental, cálculo, caráter e participação no total;
- [ ] consolidar definitivo, provisório, diagnóstico e excluído;
- [ ] preservar explicação de toda exclusão ou pendência.

**SAÍDA:** a mesma entrada e as mesmas versões sempre produzem o mesmo estado e
os mesmos totais.

### Fase 8 — Relatório XLSX

**PODE AVANÇAR:** criar um modelo de dados de relatório independente da biblioteca.

**DECISÃO NECESSÁRIA:** aprovar MD-08 antes de congelar abas e colunas.

Após a decisão:

- [ ] gerar resumo de notas;
- [ ] gerar detalhamento de itens;
- [ ] gerar pendências, regras aplicadas e erros XML;
- [ ] representar eventos e documentos excluídos;
- [ ] usar células numéricas e datas corretamente tipadas;
- [ ] adicionar filtros, congelamento e formatação aprovados;
- [ ] reconciliar totais com os itens;
- [ ] registrar versão do relatório, motor e regras;
- [ ] testar conteúdo e estrutura do arquivo gerado.

**SAÍDA:** XLSX aprovado pelo contador e reconciliado automaticamente nos testes.

### Fase 9 — Intercâmbio, retenção e continuidade

#### 9A — Pacotes `.icmspack`

- [ ] exportar manifesto e cadastros aprovados;
- [ ] validar versão, contagens e hashes;
- [ ] apresentar novidades e conflitos;
- [ ] importar tudo em uma única transação;
- [ ] garantir rollback integral em caso de erro.

#### 9B — Retenção

**DECISÃO NECESSÁRIA:** MD-09.

- [ ] configurar período;
- [ ] avisar e registrar expurgo;
- [ ] apagar XML sem apagar evidência obrigatória;
- [ ] limpar temporários com segurança.

#### 9C — Backup e restauração

**DECISÃO NECESSÁRIA:** MD-10.

- [x] criar e validar backup manual, com agendamento diário após o primeiro sucesso;
- [ ] restaurar instalação completa;
- [ ] testar corrupção, incompatibilidade e restauração interrompida.

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
- [ ] testar migração e recuperação do banco;
- [ ] gerar instalador Windows;
- [ ] assinar artefatos conforme decisão;
- [ ] testar instalação limpa, atualização e rollback;
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

## Ordem recomendada para as próximas reuniões de decisão

1. **MD-03 e itens técnicos remanescentes de MD-01/MD-04:** concluir schema,
   auditoria, fila e verificações de segurança sem depender do contador.
2. **MD-05 e primeira parte de MD-12:** analisar as respostas 1–13 e os casos
   A–E do contador para aprovar o primeiro cálculo homologável.
3. **MD-06:** usar a resposta 16 e a seção 6 para priorizar e contratar um
   módulo fiscal complementar por vez.
4. **MD-07:** usar as respostas 14–15 e decisões documentais adicionais antes de
   consolidar totais definitivos.
5. **MD-08:** congelar o XLSX quando cálculo e estados consolidados estiverem estáveis.
6. **MD-09 a MD-11 e MD-13:** fechar proteção, continuidade, escala e distribuição
   antes da versão candidata.
7. **Trilha P:** validar o enquadramento acadêmico da doação com o professor e
   definir a integração online do Stripe; independe da revisão fiscal do contador.

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
