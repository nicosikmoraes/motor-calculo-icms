# Decisões pendentes

Este é o backlog oficial de decisões do MVP. Itens aprovados devem ser retirados daqui e registrados nos documentos definitivos e em `decisoes-tecnicas.md`.

## Prioridade 1 — concluir ingestão e ciclo do documento

1. **Duplicidade:** comportamento para mesma chave e mesmo hash, mesma chave com conteúdo diferente e repetição entre lotes.
2. **Eventos órfãos:** tratamento de evento importado sem o XML da nota correspondente.
3. **Conflitos e precedência:** ordem final entre cancelamento, rejeição, denegação, manifestações, CC-e, contingência e pendências fiscais.
4. **XML inválido ou incompatível:** versões suportadas, validação por schema, assinatura e diferença entre aviso e erro impeditivo.
5. **XML sem protocolo:** decidir expressamente se `NAO_VERIFICADA` integra o total definitivo ou somente um subtotal provisório.

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

1. Biblioteca de acesso ao SQLite e decisão sobre ORM/query builder.
2. Schema físico, índices e restrições definitivas.
3. Migrações e compatibilidade entre versões do aplicativo.
4. Política de idempotência e duplicidade no banco.
5. Estratégia para transações, concorrência entre workers e recuperação após interrupção.

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

1. Quantidade esperada e limite de XMLs por lote.
2. Tamanho máximo de XML e ZIP e proteção contra ZIP expansivo.
3. Metas de tempo em computadores de referência.
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

1. Parser XML e estratégia de validação de schemas.
2. Biblioteca de decimal exato.
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
