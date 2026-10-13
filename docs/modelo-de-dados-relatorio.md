# Modelo interno de dados de relatório — versão 1

Estado: modelo técnico de snapshot implementado. A exportação XLSX e os subtotais
de conferência estão implementados na DT-045 e extensões DT-046 a DT-052,
atualmente layout 4. Homologação fiscal e futuras ampliações seguem em MD-07/MD-08.

`buildReportData`, no pacote `reporting`, recebe um `BatchDetail` já carregado e
metadados de geração (`generatedAt` com fuso e `appVersion`). Produz um snapshot
independente, congelado recursivamente, sem consulta ao banco ou ao catálogo
atual. O snapshot alimenta a exportação Excel do lote e da conferência mensal;
a geração preserva as memórias salvas, sem recalcular impostos.

| Coleção | Evidência preservada |
| --- | --- |
| `batch` | Identificação, ambiente, empresa e contagens originais do lote |
| `documents` | Cabeçalho, data com fuso original e elegibilidade para processamento |
| `items` | Vínculo por documento e número do item, classificação, avaliação original e avaliação fornecida, memória de cálculo, versão do motor e execução |
| `rules` | Candidatas da avaliação fornecida por item, versão, fundamento, motivos de descarte e indicação de seleção |
| `pendencies` | Motivos documentais, cadastrais, de seleção, de cálculo e de associação de artefatos, com referências |
| `diagnostics` | Diagnósticos de ingestão com código, mensagem e origem, inclusive sem documento normalizado |
| `occurrences` | Caminho relativo, hash, repetição, conflito e elegibilidade registrados |
| `artifacts` | Protocolos e eventos associados, órfãos ou ambíguos, sem aplicar efeito fiscal |
| `assessmentHistory` | Identificação e versões das execuções de avaliação disponíveis |

`schemaVersion` versiona o modelo interno. As versões de pacote ficam nas
avaliações e no histórico; versões de motor e execução ficam em cada memória de
item quando existentes. A função não inventa versões ausentes nem recompõe o
conteúdo de execuções históricas que não foram fornecidas.

Valores monetários permanecem strings exatas; códigos preservam zeros à esquerda.
Um valor declarado não preenche um resultado calculado ausente. Datas fiscais
não são convertidas para UTC. Documentos excluídos e itens pendentes permanecem
no snapshot. A ausência de memória calculada não impede montar o relatório.

`counts` conta os registros efetivamente presentes em cada coleção. Uma pendência
é uma evidência com escopo: motivos de escopos diferentes podem coexistir para o
mesmo item. Essa contagem não substitui `batch.totalPendencies`, nem equivale a
quantidade de itens pendentes ou total financeiro. Não há soma, arredondamento,
reconciliação monetária ou declaração de resultado definitivo nesta etapa.

A construção recusa identificadores vazios ou repetidos, números de item
repetidos dentro da mesma nota e referências de artefatos a ocorrências ou
documentos ausentes. O número de item pode se repetir em notas distintas.
A ordem das coleções acompanha o snapshot de origem.

Validação automatizada cobre preservação de precisão, fuso, versões e exclusões,
isolamento do snapshot, lotes sem notas, memórias pendentes e calculadas,
artefatos associados e referências inválidas.

## Extensão por componentes — DT-051

Na conferência implementada, o snapshot inclui ICMS-ST e o FCP-ST adicional com
memórias independentes. A consolidação agrupa empresa, período, operação, ambiente,
autorização e componente. Sua contagem geral representa documentos e itens físicos;
a contagem dos grupos representa os itens conferidos naquele tributo.

A identidade da evidência é documento + item + componente. Campos declarados de
ICMS, ST e FCP-ST não são intercambiáveis. O XLSX layout 3 seleciona a memória do
componente para valores, base, regra e auditoria e inclui comparações de base e
alíquota. Diferenças monetárias continuam calculado menos declarado, com tolerância
de R$ 0,01; o percentual do FCP-ST tem comparação exata.

## Decisão de MVA específica — DT-052

O XLSX layout 4 inclui a decisão versionada da MVA de combustíveis/veículos,
com condições e fórmula, inclusive quando o componente de imposto está pendente.
Essa decisão não preenche valores de imposto não calculados. Alíquota ST e FCP-ST
são comparadas de forma exata; divergências de base/alíquota ficam nas evidências.
