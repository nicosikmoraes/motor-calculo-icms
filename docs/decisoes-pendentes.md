# Decisões pendentes

Este é o backlog oficial de decisões do MVP. Itens aprovados devem ser retirados daqui e registrados nos documentos definitivos e em `decisoes-tecnicas.md`.

## Prioridade 1 — concluir ingestão e ciclo do documento

1. **Duplicidade:** política aprovada na DT-019; falta detalhar a interface de resolução do conflito, sem alterar sua consequência fiscal.
2. **Eventos órfãos:** já são preservados e identificados no lote; definir associação posterior entre lotes, retenção e reprocessamento. Não participam do cálculo inicial.
3. **Conflitos e precedência:** ordem final entre cancelamento, rejeição, denegação, manifestações, CC-e, contingência e pendências fiscais.
4. **Validação do XML 4.00:** pacote inicial `PL_010f_v1.04`, bibliotecas e catálogo inicial de severidades aprovados nas DT-020 e DT-021; falta ampliar campos necessários durante a normalização fiscal. Assinatura não será validada no MVP.
5. **Validação de protocolos e eventos:** as versões do incremento estrutural estão na DT-036; falta validar seus XSDs específicos e decidir o escopo de tipos de evento para efeitos documentais.
6. **XML sem protocolo:** decidir expressamente se `NAO_VERIFICADA` integra o total definitivo ou somente um subtotal provisório.

## Prioridade 2 — contrato fiscal do cálculo

O primeiro escopo aprovado e as decisões de precisão, destinação e diferimento
estão em [escopo-fiscal-parana.md](escopo-fiscal-parana.md). Já existe uma função
para o ICMS próprio comum PR, ligada às perguntas por item e a execuções
históricas, reaproveitamento opcional, rateio e conferência do XML. A consolidação
do lote por empresa e mês está disponível (DT-044), assim como sua exportação XLSX
(DT-045). A conferência mensal entre lotes está disponível (DT-046), com deduplicação e
exportação por empresa/mês. Apuração fiscal, créditos e os demais tratamentos seguem pendentes.

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

## Prioridade 3 — extensões do XLSX

O layout inicial está implementado na DT-045: Resumo, Itens, Divergências e
Pendências e exclusões. Inclui filtros, painéis fixos, moeda, datas originais e
rastreabilidade. Exporta os totais de conferência já salvos, com ambientes e
protocolos separados, sem fórmulas fiscais ou total definitivo inventado.

1. Decidir se o histórico completo de eventos exige uma aba própria `Eventos`.
2. Ampliar o relatório quando forem aprovadas a apuração entre lotes e as regras de crédito.

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
5. Medir se a capacidade inicial de uma operação e uma entrada XML em processamento
   por vez atende ao volume de referência; ajustar a vazão somente com as metas
   de MD-11. A pressão de retorno inicial está registrada na DT-024.

## Prioridade 5 — retenção e proteção de dados

O princípio já aprovado é retenção padrão de um mês, com período configurável e exclusão posterior do XML original. Permanecem em aberto:

1. Limites mínimo e máximo do período configurável.
2. Definir o que permanece após apagar o XML: hash, dados normalizados, resultados, eventos e memória.
3. Avisos, carência, log e recuperação possível da exclusão automática.
4. Proteção do SQLite, XMLs temporários, relatórios e pacotes `.icmspack`.
5. Necessidade de criptografia em repouso e proteção por senha dos pacotes.

## Prioridade 6 — backup e restauração

1. Backup manual seguido de automático diário aprovado na DT-037 e implementado; falta homologar operação no Windows.
2. Destino escolhido pelo usuário implementado; falta homologar unidade externa e pasta sincronizada.
3. Retenção de sete automáticas implementada na DT-039; compactação, criptografia e extensão do conteúdo além do SQLite permanecem pendentes.
4. Restauração do SQLite com validação e recuperação de troca interrompida implementada; homologação Windows e teste periódico operacional pendentes.
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
4. Evidência fiscal necessária antes de ligar versões aprovadas ao cálculo; a operação local de aprovação e revogação já foi definida na DT-034.
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
