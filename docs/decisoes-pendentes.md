# Decisões pendentes

Este é o backlog oficial de decisões do MVP. Itens aprovados devem ser retirados daqui e registrados nos documentos definitivos e em `decisoes-tecnicas.md`.

## Prioridade 1 — concluir ingestão e ciclo do documento

1. **Duplicidade:** política aprovada na DT-019; falta detalhar a interface de resolução do conflito, sem alterar sua consequência fiscal.
2. **Eventos órfãos:** serão ignorados pelo cálculo inicial; ao implementar eventos, definir retenção, associação posterior e reprocessamento.
3. **Conflitos e precedência:** ordem final entre cancelamento, rejeição, denegação, manifestações, CC-e, contingência e pendências fiscais.
4. **Validação do XML 4.00:** pacote inicial `PL_010f_v1.04`, bibliotecas e catálogo inicial de severidades aprovados nas DT-020 e DT-021; falta ampliar campos necessários durante a normalização fiscal. Assinatura não será validada no MVP.
5. **Versões de protocolos e eventos:** definir por tipo de artefato as versões aceitas no MVP e o tratamento de uma versão não suportada.
6. **XML sem protocolo:** decidir expressamente se `NAO_VERIFICADA` integra o total definitivo ou somente um subtotal provisório.

## Prioridade 2 — contrato fiscal do cálculo

1. Fórmulas e condições completas de ICMS próprio.
2. Base reduzida, cálculo por dentro e composição de frete, seguro, desconto, despesas e IPI.
3. ICMS-ST por MVA, MVA ajustada, pauta, PMPF e preço máximo.
4. DIFAL, partilha quando aplicável e FCP/FCP-ST.
5. Isenção, não incidência, diferimento, desoneração e benefícios.
6. Simples Nacional, CST/CSOSN e hipóteses de crédito.
7. Débito, crédito, estorno e valores apenas informativos na perspectiva da empresa analisada.
8. Rateio de valores da nota entre itens.
9. Arredondamento por componente e tolerâncias de divergência.
10. Tratamento de valores negativos, zeros e limites de precisão decimal.

## Prioridade 3 — contrato do XLSX

1. Abas definitivas e nomes.
2. Colunas, tipos, ordem, filtros e congelamento de painéis.
3. Separação entre total definitivo, subtotal provisório, diagnóstico e valores excluídos.
4. Fórmulas de reconciliação e linhas de total.
5. Representação de cancelamentos, eventos, divergências e pendências.
6. Necessidade de uma aba específica `Eventos`.
7. Formatação monetária, datas, casas decimais e identificação da versão do relatório.

## Prioridade 4 — persistência local

1. `node:sqlite` sem ORM foi aprovado na DT-027; falta homologar o runtime no
   instalador Windows antes da distribuição.
2. Completar o schema físico de perfis fiscais, produtos, regras, documentos e
   cálculos. A migration `0001` já cobre organização, empresa, lote e ocorrência
   de arquivo; a política de inativação e proteção contra exclusões em cascata foi
   aprovada na DT-028.
3. Definir a matriz de versões antigas suportadas nos testes de atualização. A
   política de migrations foi aprovada na DT-027.
4. Detalhes de índices e restrições do schema. A idempotência de execução foi
   aprovada na DT-026 e a política de ocorrências repetidas permanece na DT-019.
5. Capacidade da fila e pressão de retorno. A instância única, a escrita
   centralizada, os checkpoints por documento e a recuperação após interrupção
   já foram aprovados nas DT-024 e DT-025.

## Prioridade 5 — retenção e proteção de dados

O princípio já aprovado é retenção padrão de um mês, com período configurável e exclusão posterior do XML original. Permanecem em aberto:

1. Limites mínimo e máximo do período configurável.
2. Definir o que permanece após apagar o XML: hash, dados normalizados, resultados, eventos e memória.
3. Avisos, carência, log e recuperação possível da exclusão automática.
4. Proteção do SQLite, XMLs temporários, relatórios e pacotes `.icmspack`.
5. Necessidade de criptografia em repouso e proteção por senha dos pacotes.

## Prioridade 6 — backup e restauração

1. Backup automático ou manual e periodicidade padrão.
2. Destino local, unidade externa ou pasta sincronizada escolhida pelo usuário.
3. Conteúdo, compactação, criptografia e retenção dos backups.
4. Validação de integridade, restauração completa e teste periódico.
5. Diferença entre backup da instalação e exportação de configurações `.icmspack`.

## Prioridade 7 — escala e desempenho local

1. Homologar o volume de referência aprovado de 1.000 notas e o processamento
   incremental sem limite comercial por quantidade.
2. Homologar em carga os limites aprovados de 10 MB por XML, 500 MB por ZIP, 2 GB
   expandidos, taxa de 100:1, 10.000 entradas, 20 segmentos de caminho e 100
   elementos aninhados no XML.
3. Metas de tempo em computadores de referência para as 1.000 notas.
4. Número de workers, uso máximo de memória e responsividade da interface.
5. Pausa, retomada, cancelamento e recuperação de lote interrompido.
6. Expurgo de temporários e crescimento do banco local.

## Prioridade 8 — homologação fiscal

1. Casos de teste aprovados por contador para cada módulo fiscal.
2. Massa de XMLs anonimizada e resultados esperados.
3. Testes de regressão por versão do motor e das regras.
4. Processo de aprovação, publicação e revogação de regras.
5. Evidências mínimas para considerar uma versão pronta para uso.

## Prioridade 9 — instalação e atualização

1. Versões do Windows suportadas e arquitetura de processador.
2. Formato do instalador e instalação por usuário ou por máquina.
3. Assinatura de código e tratamento dos alertas do Windows.
4. Atualização automática ou manual, canal estável e possibilidade de rollback.
5. Política de compatibilidade do banco durante atualização.

## Prioridade 10 — bibliotecas e observabilidade

1. Homologar o parser com massa anonimizada representativa, teste de carga e instalador Windows; a prova de conceito e as versões iniciais já estão registradas.
2. Biblioteca de decimal exato: `decimal.js` escolhida na DT-032; falta aprovar escala, operações de divisão/rateio e arredondamento fiscal no MD-05.
3. Biblioteca de geração de XLSX.
4. Empacotamento e distribuição do Electron.
5. Formato, retenção e exportação de logs de suporte.
6. Métricas locais de lote sem envio de dados para terceiros no MVP.

## Fora do MVP, mas preservado como evolução

- sincronização automática entre máquinas;
- banco em nuvem e modo multiusuário em tempo real;
- múltiplos escritórios/tenants na mesma instalação;
- perfis de usuário e permissões;
- consulta automática à SEFAZ;
- atualização automática de legislação e tabelas fiscais;
- portal web ou aplicativo móvel.
