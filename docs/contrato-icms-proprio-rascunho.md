# Contrato do ICMS próprio por item — rascunho MD-05

**Situação:** proposta técnica para validação fiscal. Não autoriza cálculo definitivo nem preenche automaticamente tabelas de alíquotas. Elaborado em 24/09/2026.

## Escopo acordado

- Auditar o ICMS **próprio destacado em cada item** da NF-e, comparando um cálculo independente com `vBC`, `pICMS` e `vICMS` declarados no XML. Não apurar, nesta etapa, débito, crédito ou saldo a recolher da empresa analisada.
- Começar por operações internas e interestaduais de mercadorias emitidas por contribuinte do regime normal. O Paraná é a UF principal da empresa analisada; origem e destino de cada nota continuam sendo lidos do XML.
- Manter ICMS-ST, DIFAL, FCP, Simples Nacional, benefícios especiais, devoluções e transferências fora do primeiro cálculo até que cada contrato próprio seja aprovado. Um item fora da cobertura gera pendência, não resultado presumido.

## 1. Seleção da regra

A entrada da seleção é: data da operação, UF de origem e destino, tipo/direção da operação, CFOP, NCM, CEST quando houver, origem da mercadoria, regime do emitente, situação do destinatário, CST, finalidade da NF-e e perfil fiscal do produto. A regra aplicada precisa ter vigência e fundamento legal; empates ou ausência de regra geram pendência.

A UF sozinha não determina a tributação. Para operação interna, a alíquota vem da legislação da UF e das condições da mercadoria na data da operação. A Lei paranaense 11.580/1996 prevê 19,5% para os demais bens e mercadorias, mas contém alíquotas e tratamentos específicos; portanto, **19,5% não será um valor automático para todo produto no PR**. Para operação interestadual, a Resolução do Senado 22/1989 prevê 12% como regra geral e 7% para saídas do Sul/Sudeste destinadas ao Norte, Nordeste, Centro-Oeste ou Espírito Santo. Mercadorias importadas podem se enquadrar na alíquota de 4% da Resolução 13/2012, sujeita aos seus critérios e exceções; sem os dados para comprová-los, o item permanece pendente.

Exemplos **apenas ilustrativos**, assumindo base tributável já determinada de R$ 100,00, mercadoria sem benefício ou exceção e regra válida na data:

| Origem → destino | Alíquota de exemplo | ICMS próprio |
| --- | ---: | ---: |
| PR → PR | 19,5% na hipótese geral da lei paranaense | R$ 19,50 |
| PR → SP | 12% interestadual | R$ 12,00 |
| PR → BA | 7% interestadual | R$ 7,00 |

O valor de R$ 100,00 no exemplo **já é a base**, que inclui o próprio ICMS quando aplicável. Não se acrescenta o imposto novamente ao preço nem se faz gross-up por padrão.

## 2. Formação da base por item

Proposta para a operação ordinária coberta: partir do valor do produto; somar as parcelas de frete, seguro e demais encargos que integram a base; subtrair desconto incondicional; incluir IPI somente quando não se aplicar a exclusão do art. 13, § 2º, da LC 87/1996. Descontos condicionais integram a base. Quando a regra aprovada prever redução, calcular a base reduzida de forma explícita e registrar percentual e fundamento.

```text
base_inicial = valor_produto + frete_incluível + seguro_incluível
             + outras_despesas_incluíveis - desconto_incondicional
             + IPI_incluível
base_tributável = aplicar_redução_aprovada(base_inicial)
ICMS_próprio = arredondar(base_tributável × alíquota / 100)
```

Essa expressão **não** substitui as condições legais de cada parcela. Se a origem de frete, desconto, IPI ou redução não puder ser determinada, o item fica pendente. O XML declarado é referência de comparação, nunca a fonte da base ou da alíquota calculada.

## 3. Rateio, precisão e comparação

- Valores monetários e percentuais são tratados como decimais exatos; não usar `number` binário para o cálculo fiscal.
- Parcelas informadas só no total da NF-e precisam de critério de rateio por item, conservação do total e distribuição determinística do resíduo. O critério ainda exige aprovação.
- Registrar a memória por item: entradas, parcelas aceitas/rejeitadas, regra e versão, base antes/depois de redução, alíquota, etapas de arredondamento, valor calculado, valores declarados e diferenças.
- Comparar separadamente `vBC`, `pICMS` e `vICMS`; não tratar uma diferença de base como se fosse apenas diferença de imposto.
- Modo exato de arredondamento, etapa em que cada valor vai a centavos e tolerância de divergência ainda exigem casos de homologação. Até lá, não emitir conclusão fiscal definitiva.

## 4. Cobertura e pendências

Um primeiro lote homologável deve começar por NF-e modelo 55 de operação comum com CST 00, regra aprovada e todos os dados necessários. CST 20 (redução de base) entra quando houver regra e exemplos validados. Itens com ST, DIFAL, FCP, Simples Nacional, isenção, diferimento, devolução, transferência, importação com enquadramento incerto ou dados insuficientes continuam visíveis como `NAO_SUPORTADO` ou `REGRA_PENDENTE`, sem valor calculado definitivo.

O modelo normalizado atual já guarda UF das partes, CFOP, NCM, origem, CST, frete, seguro, desconto, despesas e ICMS declarado por item. O parser agora extrai o **IPI destacado por item** de `IPI/IPITrib/vIPI`, além do total. A ausência desse campo em `IPINT` ou em um item sem IPI deve permanecer distinta de zero. O motor deve deixar pendente qualquer cálculo que dependa do IPI por item quando ele não estiver informado.

## Massa sintética de apoio

Foram criados [quatro XMLs sintéticos de PR interno e operações interestaduais](../packages/nfe-parser/test/fixtures/icms-pr/LEIA-ME.md), válidos no XSD NF-e 4.00 do projeto. Eles testam leitura, direção e valores declarados, mas não substituem exemplos fiscais homologados nem comprovam autorização da SEFAZ.

## Decisões ainda necessárias para aprovar MD-05

1. Confirmar a matriz exata de operações/CST do primeiro lote homologado e exemplos reais anonimizados de PR → PR, PR → outra UF e outra UF → PR.
2. Aprovar as condições de inclusão de frete, despesas e IPI e o rateio de valores não informados por item.
3. Aprovar redução de base e eventuais exceções por NCM, CFOP, perfil e vigência.
4. Aprovar biblioteca decimal, modo/etapa de arredondamento e tolerância de comparação.
5. Validar os resultados esperados de cada exemplo com responsável fiscal antes de habilitar a classificação “sem divergência”.

## Fontes normativas consultadas

- [Lei Complementar 87/1996, art. 13 — base e parcelas](https://legis.senado.leg.br/norma/572842/publicacao/34621002).
- [Resolução do Senado 22/1989 — alíquotas interestaduais de 12% e 7%](https://legis.senado.leg.br/norma/586152/publicacao/15646891).
- [Resolução do Senado 13/2012 — alíquota interestadual de 4% para importados, com condições e exceções](https://legis.senado.leg.br/norma/586999/publicacao/15839317).
- [Lei 11.580/1996 do Paraná, art. 14 — alíquotas internas](https://www.legislacao.pr.gov.br/legislacao/listarAtosAno.do?action=exibir&codAto=278020&codItemAto=2215421).
