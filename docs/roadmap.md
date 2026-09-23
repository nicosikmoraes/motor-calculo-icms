# Roadmap de implementação do MVP

Este roadmap organiza a implementação em incrementos verificáveis e mostra onde
uma decisão fiscal ou técnica precisa ser aprovada antes de avançar. Ele não
substitui [Decisões pendentes](decisoes-pendentes.md): o backlog continua sendo a
fonte oficial das questões abertas, e as decisões aprovadas devem ser registradas
em [Decisões técnicas](decisoes-tecnicas.md) e nos documentos definitivos.

Não há datas fixadas neste momento. Cada fase somente recebe prazo depois que seu
marco de decisão estiver aprovado e o escopo estiver suficientemente definido.

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
| 1 | Contratos de ingestão e massa de testes | MD-01 e MD-02 | Próxima |
| 2 | Persistência local e cadastros básicos | MD-03 | Aguardando decisão |
| 3 | Ingestão completa de XML/ZIP | Fases 1 e 2; MD-04 | Aguardando |
| 4 | Gestão e seleção de regras fiscais | Fase 2 | Parcialmente iniciada |
| 5 | Motor de ICMS próprio | Fase 4; MD-05 | Aguardando decisão fiscal |
| 6 | ST, DIFAL, FCP e tratamentos especiais | Fase 5; MD-06 | Aguardando decisão fiscal |
| 7 | Ciclo documental, eventos e consolidação | Fases 3, 5 e 6; MD-07 | Aguardando |
| 8 | Relatório XLSX auditável | Fase 7; MD-08 | Aguardando decisão |
| 9 | Pacotes de configuração, retenção e backup | Fase 2; MD-09 e MD-10 | Aguardando decisão |
| 10 | Escala, homologação e distribuição Windows | Todas as anteriores; MD-11 a MD-13 | Aguardando |

## Marcos de decisão

### MD-01 — Estratégia de parsing e validação XML

**Aqui precisamos decidir para avançar:**

- [x] versões de NF-e modelo 55 e NFC-e modelo 65 suportadas no MVP: leiaute 4.00, conforme DT-018;
- [x] primeira entrega limitada a documentos NF-e/NFC-e; protocolos e eventos entram em incremento posterior;
- [x] assinatura digital não será validada no MVP; o resultado informa `ASSINATURA_NAO_VERIFICADA`;
- [x] incompatibilidade tolerável gera aviso e dados insuficientes geram `INFORMACOES_FALTANTES`;
- [x] `fast-xml-parser` e `xmllint-wasm` aprovados na DT-020;
- [x] executar a prova de conceito documentada em `prova-conceito-parser-xml.md`;
- [ ] definir versões aceitas de protocolos e eventos, por tipo de artefato, antes do incremento correspondente;
- [x] revisão inicial, uso e origem dos schemas XSD 4.00: `PL_010f_v1.04`;
- [x] catálogo objetivo de aviso, pendência e erro impeditivo, conforme DT-021;
- [x] proteção contra DTD e entidades externas;
- [ ] limites técnicos de profundidade e tamanho.

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
- [ ] schema físico inicial, índices e restrições;
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
- [ ] capacidade da fila e pressão de retorno;
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
- biblioteca decimal, escalas e limites de precisão;
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
- processo de publicação e revogação de regras;
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
- [ ] definir tipos normalizados para protocolo e evento quando suas versões forem
  aprovadas;
- [x] criar códigos estruturados de erro e pendência de ingestão;
- [x] criar builders de teste e fixtures sintéticas sem dados reais;
- [x] testar inventário independente da ordem dos arquivos;
- [x] criar contrato de hash e proveniência do arquivo;
- [x] classificar ocorrências repetidas e conteúdos conflitantes sem depender da
  ordem de entrada;
- [x] preparar testes de segurança para XXE, Zip Slip, ZIP corrompido e ZIP
  expansivo;

**DECISÃO NECESSÁRIA:** aprovar MD-01 e MD-02 antes de implementar o parser e a
deduplicação definitivos.

**SAÍDA:** contratos revisados, fixtures versionadas e testes de aceitação da
ingestão prontos para receber a implementação.

### Fase 2 — Persistência e cadastros básicos

**PODE AVANÇAR:**

- [x] desenhar os repositórios de organização e empresa a partir do modelo aprovado;
- [x] implementar onboarding de organização única e tela persistente de empresa;
- [ ] implementar telas de perfil fiscal e produto de fornecedor;
- [ ] definir casos de uso sem detalhes de SQLite;
- [x] validar CNPJ, UF e identificadores normalizados no domínio;
- [ ] validar vigência ao implementar os perfis fiscais.

**DECISÃO NECESSÁRIA:** aprovar o schema físico restante da MD-03 antes de criar
a primeira migration de domínio e os repositórios concretos.

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
- [ ] persistir perfil fiscal e produto de fornecedor;
- [ ] implementar transações e trilha básica de auditoria;
- [x] testar criação, consulta, inativação, rollback e reinicialização para as
  entidades da migration `0001`;
- [ ] testar atualização versionada após implementar perfis, produtos e regras.

**SAÍDA:** cadastros permanecem íntegros após fechar e reabrir o aplicativo.

### Fase 3 — Ingestão completa do lote

**Dependências:** fases 1 e 2; MD-01, MD-02 e MD-04 aprovados.

- [ ] inventariar arquivos antes de relacioná-los;
- [ ] extrair XML/ZIP com limites de segurança;
- [ ] validar formato, versão, ambiente e schema;
- [ ] normalizar NF-e/NFC-e, itens, protocolos e eventos;
- [ ] calcular e persistir hashes;
- [ ] relacionar artefatos por chave, independentemente da ordem;
- [x] identificar candidatos a empresa pelos CNPJ de XMLs diretos e de ZIPs,
  com escolha explícita e cadastro assistido quando necessário;
- [ ] separar produção e homologação;
- [ ] continuar o lote após erro isolado;
- [ ] apresentar progresso, erros e pendências na interface.

**SAÍDA:** um lote real é importado de forma segura, idempotente e auditável, mas
ainda sem promessa de cálculo fiscal completo.

### Fase 4 — Gestão e localização de regras

**Já iniciado:** seleção por nível, especificidade, prioridade e ambiguidade.

- [ ] implementar cadastro estruturado de condições e resultados;
- [ ] implementar rascunho, aprovação, nova versão e revogação;
- [ ] exigir fundamento legal e vigência para aprovação;
- [ ] detectar sobreposição potencial;
- [ ] vincular produto de fornecedor a perfil fiscal;
- [ ] registrar candidatas consideradas e explicação da seleção;
- [ ] gerar pendências `REGRA_NAO_ENCONTRADA`, `REGRA_AMBIGUA`,
  `PRODUTO_NAO_CLASSIFICADO` e `DIVERGENCIA_CADASTRAL`;
- [ ] cobrir a precedência com testes de tabela.

**DECISÃO NECESSÁRIA:** campos fiscais cujo significado depende dos contratos de
cálculo podem ser cadastrados somente depois de MD-05 e MD-06.

**SAÍDA:** cada item encontra uma única regra versionada ou uma pendência explícita.

### Fase 5 — Motor de ICMS próprio

**Dependências:** fase 4 e MD-05 aprovado.

- [ ] implementar decimal exato e política de arredondamento;
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

- [ ] criar e validar backup;
- [ ] restaurar instalação completa;
- [ ] testar corrupção, incompatibilidade e restauração interrompida.

**SAÍDA:** configurações podem ser transferidas, e a instalação pode ser recuperada
sem confundir intercâmbio com backup.

### Fase 10 — Escala, homologação e entrega

**Dependências:** MD-11, MD-12 e MD-13.

- [ ] mover processamento pesado para workers;
- [ ] limitar concorrência, memória e temporários;
- [ ] implementar pausa, retomada e cancelamento conforme decisão;
- [ ] medir lotes no computador de referência;
- [ ] implementar logs locais e pacote seguro de diagnóstico;
- [ ] executar a suíte fiscal homologada;
- [ ] testar migração e recuperação do banco;
- [ ] gerar instalador Windows;
- [ ] assinar artefatos conforme decisão;
- [ ] testar instalação limpa, atualização e rollback;
- [ ] preparar manual operacional e checklist de suporte.

**SAÍDA:** versão candidata do MVP com evidência fiscal, técnica e operacional.

## Ordem recomendada para as próximas reuniões de decisão

1. **MD-01 e MD-02:** fecham o comportamento básico da ingestão.
2. **MD-03:** permite persistir cadastros e lotes enquanto o contrato fiscal evolui.
3. **MD-04:** completa os limites de segurança da importação.
4. **MD-05:** libera o primeiro cálculo fiscal de ponta a ponta.
5. **MD-12, parte de ICMS próprio:** define desde cedo como esse cálculo será
   homologado.
6. **MD-06:** liberar um módulo por vez, começando pelo de maior valor operacional.
7. **MD-07:** consolidar documentos e eventos depois que parser e cálculo estiverem
   observáveis.
8. **MD-08:** congelar o XLSX quando os dados reais de saída estiverem estabilizados.
9. **MD-09 a MD-11 e MD-13:** fechar operação, escala e distribuição antes da
   versão candidata.

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
