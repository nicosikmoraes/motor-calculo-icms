# Conferência de ICMS-ST em compras destinadas ao Paraná

## Cobertura da DT-050

NF-e modelo 55, finalidade normal, mercadoria destinada ao Paraná, fornecedor
no regime normal (CRT 3), CST 00/10, sem redução de base, desconto ou FCP-ST. O usuário
confirma a incidência de ST para operações subsequentes, o comprador contribuinte
e a descrição legal da mercadoria. Documento que indique consumidor final ou
comprador não contribuinte exige outra regra. A conferência não constitui
crédito de entrada nem apuração do imposto a recolher.

A compra é reconhecida na perspectiva da empresa selecionada: em nota emitida
pelo fornecedor, `tpNF=1`, a compradora é a destinatária; em nota de entrada
emitida pela própria empresa, `tpNF=0`, a compradora é a emitente. Nesta última,
o regime do fornecedor precisa de confirmação quando não constar dos dados
normalizados. Bloqueios documentais permanecem aplicáveis.

## Catálogo consultado

O catálogo local contém as **144 linhas** das tabelas integrais da Resolução
SEFA/PR 1245/2025: 69 de higiene/cosméticos (art. 12 da Resolução 571/2019) e
75 de materiais de construção (art. 16). Sua cobertura para consulta automática
é de **01/04/2026 a 12/10/2026**, a data desta conferência. O segundo limite
delimita a versão embarcada; não é data de revogação da legislação.

Exige NCM de oito dígitos e CEST de sete dígitos no XML. A seleção usa o CEST
exato e o NCM completo ou prefixo definido pela lei. Ausência, conflito,
ambiguidade, outra data ou produto fora dessas duas tabelas exige MVA conferida
manualmente. Encontrar uma linha não confirma automaticamente a incidência:
descrição, destinação, exceções e responsabilidade tributária precisam corresponder
à operação concreta.

A fonte oficial, hash SHA-256 do HTML, versão e conteúdo integral da linha
consultada ficam registrados na memória de cada nova execução. O script
`scripts/extract-pr-st-mva.py` reproduz a extração a partir do HTML oficial e
recusa tabelas incompletas ou linhas fora do formato. O aplicativo consulta o
arquivo embarcado, sem acessar a internet durante o cálculo. O catálogo de MVA
é independente da aprovação de regras DRAFT já existente no aplicativo.

## MVA original, ajustada e informada

O modo original usa o percentual encontrado no catálogo. Para operação
interestadual com alíquota própria de 4%, origem da mercadoria 1, 2, 3 ou 8 e
remetente CRT 3, o aplicativo oferece o ajuste:

`MVA ajustada (%) = [(1 + MVA original/100) × (1 − 4/100) ÷ (1 − alíquota interna/100) − 1] × 100`

A alíquota interna continua sendo confirmada pelo usuário. Redução da carga
efetiva, FCP e outros tratamentos ainda exigem outro módulo. Operação interna,
outra alíquota interestadual, origem incompatível ou regime diferente não pode
usar esse ajuste automático. O modo original também não é usado para a operação
interestadual a 4% sem conferir a regra de ajuste.

No modo manual, o usuário informa a **MVA final aplicada**, já ajustada quando
necessário. O campo não deve receber a MVA original de uma operação que exige
ajuste. Uma MVA informada não substitui a conferência da incidência e vigência.

## Base, dedução e precisão

`BC ST = (produto + IPI + frete + seguro + outras despesas) × (1 + MVA aplicada/100)`

`ICMS-ST = BC ST × alíquota interna/100 − ICMS devido pela operação própria`

No modo catálogo, a dedução usa o valor de ICMS próprio informado na NF-e,
exibido ao usuário para conferência. Sua ausência mantém pendência. Quando há
frete, seguro ou outras despesas, o modo manual também exige esse valor para
não presumir a base própria a partir do produto isolado. A conferência de ST
não homologa separadamente esse imposto declarado.

No modo manual sem esses encargos, permanece disponível o método da planilha:
produto × alíquota própria, sem arredondamento intermediário. Assim, o exemplo
original de produto R$ 504,36, MVA final 28,6%, alíquota interna 19,5% e própria
4% continua resultando em R$ 106,30. Deduzir ICMS próprio já arredondado de
R$ 20,17 no mesmo exemplo gera R$ 106,31; a memória distingue os métodos.

A MVA ajustada pode ser uma dízima. A memória mostra até 20 casas decimais,
identificadas como exibição. Base e imposto final são obtidos diretamente da
razão da fórmula, com arredondamento HALF_UP a centavos, sem usar a MVA de
exibição como uma nova entrada. Não há cálculo fiscal em ponto flutuante.

Descontos rateados do total também permanecem pendentes. IPI total divergente
dos itens e distribuição de encargos impossível continuam bloqueando o cálculo.

## Histórico e relatórios

O motor registra novas execuções com versão `PR_FISCAL_3` e preserva memórias
anteriores. As respostas de ST não são reaproveitadas automaticamente em notas
futuras. Definições antigas de ICMS próprio precisam corresponder à nova versão
do contexto antes de outro reaproveitamento.

Memórias antigas de ST incompatíveis com a perspectiva da empresa, regime ou
enquadramento ficam fora dos totais calculados e pedem nova conferência, sem
alterar o resultado original guardado para auditoria.

Lotes e conferência mensal distinguem ICMS próprio e ICMS-ST mesmo dentro de
uma nota. Comparam cada componente com seu campo declarado, e uma ocorrência
de nota é contada uma vez no resumo geral. O XLSX identifica o componente e
inclui MVA original, MVA aplicada e a referência salva da tabela.

## Fontes e pendências

- [Resolução SEFA/PR 1245/2025 — tabelas e efeitos desde 01/04/2026](https://www.legislacao.pr.gov.br/legislacao/listarAtosAno.do?action=exibirImpressao&codAto=381258).
- [SEFA/PR — fórmula da MVA ajustada para importados a 4%](https://www.fazenda.pr.gov.br/Pagina/Calculo-da-MVA).
- [LC 87/1996, art. 8º, II e § 5º — base ST e diferença para o imposto próprio](https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp87.htm).

Ainda faltam as demais tabelas e vigências históricas, seleção completa da
incidência e alíquota, FCP-ST, descontos, reduções, pauta/PMPF/preço máximo,
Simples Nacional, créditos/apuração e homologação com XMLs e resultados aprovados
pelo contador. Esses casos não passam a ser considerados cobertos pela inclusão
do catálogo.
