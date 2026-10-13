# Conferência de ICMS-ST em compras destinadas ao Paraná

## Cobertura das DT-050, DT-051 e DT-052

NF-e modelo 55, finalidade normal, mercadoria destinada ao Paraná, fornecedor
no regime normal (CRT 3), CST 00/10, sem redução de base ou desconto. A DT-051 acrescenta o FCP-ST no recorte descrito abaixo. O usuário
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
efetiva e outros tratamentos ainda exigem outro módulo. Com FCP-ST, a carga do ajuste inclui os dois pontos do FECOP; o ICMS é calculado com sua alíquota separada. Operação interna,
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

## Fórmulas específicas de combustíveis e veículos (DT-052)

O aplicativo identifica candidatos por NCM, CEST e código ANP. Essa identificação
abre perguntas sobre a operação; não confirma automaticamente incidência ou a
inexistência dos preços legais. A decisão da MVA específica é salva com regra,
versão, data, condições, entradas e fórmula. A MVA pode ficar calculada mesmo
quando o imposto ainda está pendente. A cobertura da regra é 04/07/2019 a
12/10/2026, a data até a qual esta versão foi conferida.

Combustíveis/lubrificantes do art. 11 exigem confirmar a hipótese do art. 50 do
Anexo IX pelo valor da operação, incluindo encargos: sem preço final do art. 47,
PMPF/margem COTEPE dos arts. 48/49 ou preço de autoridade para o substituto. Esses
preços têm precedência e, quando existentes, impedem esta base pelo XML. O usuário
também confirma o regime não monofásico e a categoria legal do produto.

- Derivado de petróleo com não incidência interestadual: MVA interna de 30%; em
  operação interestadual, `130 / (1 − carga interna efetiva/100) − 100`. A MVA é
  arredondada HALF_UP a duas casas **antes** de formar a base ST. ICMS próprio
  diferente de zero conflita com essa categoria e mantém pendência.
- Óleo combustível de xisto: MVA original de 14,79%.
- Demais produtos abrangidos pelo art. 11: MVA original de 30%.

As duas últimas categorias usam o ajuste geral do art. 1º, § 5º, nas operações
interestaduais de remetente normal a 4%, 7% ou 12%. Carga interna inferior à
interestadual conserva a MVA original (§ 6º). O cálculo mantém a razão exata;
a exibição com 20 casas não passa a ser uma nova entrada fiscal.

Para veículos do art. 29, o binômio NCM/CEST é conferido contra os códigos da
tabela do art. 134 contemplados nesta versão. O usuário confirma veículo novo
para revenda, descrição, vigência, encargos/acessórios e ausência de condições de
industrialização, remessa com retorno ou faturamento direto ao consumidor.

- MVA original de 30%: hipótese do art. 136, II, fora do inciso I e sem preço
  máximo/único fixado para a venda.
- MVA original de 34%: veículo de duas rodas, sem os preços do § 3º, na hipótese
  do § 4º. A classificação 8711/26.001.00 não substitui a confirmação de duas rodas.

Veículo importado exige confirmar que o preço da operação atende ao piso das
bases de II/IPI (§ 1º). Origem XML incompatível com resposta de veículo nacional
mantém pendência. Operações interestaduais também usam a carga efetiva com FECOP
no ajuste geral; alíquota própria diferente de 4/7/12 exige revisão.

O FCP-ST de veículos novos na hipótese confirmada é separado em 2%, a partir de
04/08/2021 (Lei 20.554/2021, publicada em 06/05/2021, com noventa dias para os
arts. 1º/2º/3º). Antes dessa vigência, o aplicativo exige confirmação da não
incidência. A versão da regra FCP passa a 2. Para combustíveis/lubrificantes
confirmados fora das categorias de FECOP desta versão, a resposta de não incidência
é aceita; gasolina e outros tratamentos históricos especiais exigem revisão.

CST monofásicos 02/15/53/61, campos próprios de ICMS monofásico (inclusive zero)
e combustíveis reconhecidos no regime por NCM/data impedem aplicar MVA. Código
ANP, descrição, tipo de operação do veículo e valores monofásicos declarados são
preservados na normalização e na comparação de documentos. Não se calcula ICMS
monofásico por quantidade nesta entrega.

A carga efetiva informada para MVA precisa reconciliar com o ICMS mais FECOP
usado no imposto. XML com redução de base continua exigindo módulo próprio para
o imposto, embora a MVA possa ser calculada pela carga efetiva confirmada.
Novas execuções guardam a decisão completa. ST antiga de combustível/veículo
sem essa decisão pede nova conferência antes de totalizar, preservando a memória.
O XLSX 4 inclui MVA e referência da regra mesmo quando não há imposto concluído;
base, valor e alíquota de ST/FCP-ST são conferidos com seus campos do XML.

## FCP-ST / FECOP (DT-051)

A incidência é uma resposta explícita em cada conferência de ST. A ausência dos
campos FCP no XML não significa não incidência. Data válida e NCM são obrigatórios
para essa decisão. A cobertura desta versão vai de 04/07/2019 a 12/10/2026; o
segundo limite indica a data até a qual a regra embarcada foi conferida.

Categorias cobertas do art. 14A da Lei 11.580/1996: água mineral (2201), bebidas
(2202, 2203, 2204, 2205, 2206, 2208), joalheria/ourivesaria (7113/7114), tabacaria
(capítulo 24), perfumes e cosméticos (3303, 3304, 3305, 3307). Xampus 33051000 e
desodorantes 330720 são exceções expressas. O código restringe a consulta; a
descrição legal e a operação concreta continuam exigindo confirmação. Responder
não incidência para NCM de categoria coberta, ou contra campos positivos de FCP-ST,
mantém pendência para revisão. Veículos e combustíveis precisam das condições específicas da DT-052; demais hipóteses exigem tratamento próprio.

Quando incidente, o usuário informa se a alíquota digitada contém os dois pontos
do adicional. Por exemplo, 25% com FECOP corresponde a 23% de ICMS e 2% de FECOP.
Informar 23% e responder que não contém o adicional produz a mesma carga de 25%
para ajustar a MVA. No modo manual, a MVA informada continua sendo a MVA final.

`ICMS-ST = BC ST × alíquota de ICMS sem FECOP/100 − ICMS próprio`

`FCP-ST = BC ST calculada, em centavos × 2/100`

O FCP-ST é arredondado HALF_UP a centavos, sem deduzir o ICMS próprio nem compensar
créditos. Base, percentual e valor são comparados separadamente com `vBCFCPST`,
`pFCPST` e `vFCPST`. A tolerância monetária é R$ 0,01; o percentual de 2% tem
comparação exata. Campo ausente permanece ausente, inclusive quando outros campos
FCP estão presentes; zero explícito não é convertido em ausência.

FCP na operação própria diferente de zero mantém somente o FCP-ST pendente de
regra específica. O resultado independente do ICMS-ST pode ficar salvo, e o item
continua pendente até concluir os componentes. Não existe compensação automática
de `vFCP`, crédito de entrada ou saldo a recolher.

A memória contém um componente principal e `additionalComponents` para o FCP-ST,
com status, regra, entradas, fórmula e comparações próprios. O banco valida a
consistência dos componentes na mesma transação, sem migration de schema SQL.
As memórias antigas de ST sem decisão de FCP são preservadas para auditoria e
ficam fora dos totais até nova conferência. O aplicativo não as recalcula nem
reescreve silenciosamente.

## Histórico e relatórios

O motor registra novas execuções com versão `PR_FISCAL_5` e preserva memórias
anteriores. As respostas de ST não são reaproveitadas automaticamente em notas
futuras. Definições antigas de ICMS próprio precisam corresponder à nova versão
do contexto antes de outro reaproveitamento.

Memórias antigas de ST incompatíveis com a perspectiva da empresa, regime ou
enquadramento ficam fora dos totais calculados e pedem nova conferência, sem
alterar o resultado original guardado para auditoria.

Lotes e conferência mensal distinguem ICMS próprio, ICMS-ST e FCP-ST mesmo dentro de
uma nota. Comparam cada componente com seu campo declarado, e notas e itens físicos são contados uma vez no resumo geral, mesmo com dois tributos. O XLSX identifica o componente e
inclui MVA original, MVA aplicada e a referência salva da tabela. O layout XLSX 4 usa a memória específica de cada componente nas colunas de resultado, regra e auditoria.

## Fontes e pendências

- [Resolução SEFA/PR 1245/2025 — tabelas e efeitos desde 01/04/2026](https://www.legislacao.pr.gov.br/legislacao/listarAtosAno.do?action=exibirImpressao&codAto=381258).
- [SEFA/PR — fórmula da MVA ajustada para importados a 4%](https://www.fazenda.pr.gov.br/Pagina/Calculo-da-MVA).
- [Lei PR 11.580/1996, art. 14A — adicional e categorias](https://www.legislacao.pr.gov.br/legislacao/pesquisarAto.do?action=exibir&codAto=278020&codTipoAto=1&tipoVisualizacao=compilado).
- [RICMS/PR, Anexo IX §§ 9º/10 e Anexo XII — carga efetiva e FECOP](https://www.fazenda.pr.gov.br/sites/default/arquivos_restritos/files/documento/2020-06/106201707871.pdf).
- [SEFA/PR — orientação de FECOP sobre a base ST sem dedução do ICMS próprio](https://atendimento.fazenda.pr.gov.br/sacsefa/portal/assuntosReferente/16).
- [Lei PR 20.554/2021 — adicional de veículos e início dos efeitos](https://www.legislacao.pr.gov.br/legislacao/listarAtosAno.do?action=exibirImpressao&codAto=247729).
- [CONFAZ 132/1992 — preços, piso de importação e MVA de veículos](https://www.confaz.fazenda.gov.br/legislacao/convenios/1992/CV132_92).
- [CONFAZ 52/1993 — preços e MVA de duas rodas](https://www.confaz.fazenda.gov.br/legislacao/convenios/1993/CV052_93).
- [CONFAZ 199/2022 — início da monofasia de diesel, biodiesel e GLP](https://www.confaz.fazenda.gov.br/legislacao/convenios/2022/CV199_22).
- [CONFAZ 15/2023 — gasolina e etanol anidro](https://www.confaz.fazenda.gov.br/legislacao/convenios/2023/CV015_23).
- [SEFA/PR — ICMS monofásico de combustíveis](https://atendimento.fazenda.pr.gov.br/sacsefa/portal/assuntosReferente/51).
- [LC 87/1996, art. 8º, II e § 5º — base ST e diferença para o imposto próprio](https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp87.htm).

Ainda faltam as demais tabelas e vigências históricas, seleção completa da
incidência e alíquota, FCP próprio e demais modalidades de FCP, descontos, reduções, pauta/PMPF/preço máximo e casos fora da DT-052,
Simples Nacional, créditos/apuração e homologação com XMLs e resultados aprovados
pelo contador. Esses casos não passam a ser considerados cobertos pela inclusão
do catálogo.
