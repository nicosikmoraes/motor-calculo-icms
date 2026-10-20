# Antecipação e ICMS-ST de entradas

A conferência mensal exporta a aba **Entradas** antes das abas de auditoria.
Ela contém o diferencial de entrada, o ICMS-ST agrupado por nota, NCM e
alíquota, os subtotais e as pendências. O FCP-ST tem subtotal separado.
Uma obrigação só participa dos valores conferidos quando possui uma memória
salva, incidência confirmada, ambiente de produção e protocolo associado.
Pendências e exclusões mantêm o total das entradas em aberto.

## Importação

Além de `NFe` e `nfeProc`, a aplicação lê a exportação
`NFeLog versao="1.00"/procNFe/NFe`, com um único documento e no máximo um
protocolo. O original e seu hash são preservados; não é necessário converter o
ZIP. A leitura não certifica a assinatura. DTD, entidades externas, versões
incompatíveis e múltiplos documentos no mesmo envelope continuam recusados.
O protocolo embutido passa pela validação estrutural, inclusive no envelope
do exportador.

## Conferir uma entrada

1. Importe o XML ou ZIP para a empresa compradora.
2. No lote, abra **Notas e itens**, depois **Conferir dados e calcular**.
   Se existir cálculo automático, clique em **Revisar enquadramento fiscal**.
3. Nas compras interestaduais destinadas ao PR, escolha a obrigação do produto:
   antecipação sem ST, ICMS-ST da entrada ou ausência de novo débito, com
   confirmação e fundamento registrado. A última opção permite concluir a
   revisão de mercadorias que não geram nova obrigação para o adquirente.
4. Confira as premissas e salve o cálculo. Respostas incompletas ficam pendentes.
5. Consulte empresa e mês em **Conferência mensal** e exporte o Excel mensal.

O ICMS próprio do fornecedor continua visível como dado da nota. Ele não é
comparado com a antecipação nem entra automaticamente como débito do comprador.
Uma revisão manual conserva a execução anterior no histórico.

## Premissa padrão de destinação

Por orientação do usuário, compras sem destinação informada adotam **revenda
presumida**. Uma destinação específica registrada, inclusive uso/consumo ou
ativo, tem prioridade sobre o padrão. A premissa vale para a empresa compradora,
identificada pela perspectiva da nota, e não para o fornecedor.

As respostas registram `destination=RESALE` e
`destinationBasis=ASSUMED_RESALE`; a memória guarda a origem
`USER_POLICY/DEFAULT_RESALE`. A interface e o relatório identificam a premissa.
Selecionar expressamente outra destinação troca sua origem para `CONFIRMED`.
Nenhuma resposta de incidência, base, MVA, alíquota, regime ou recolhimento é
confirmada pela escolha padrão de destinação.

Os XMLs originais são preservados. Indicação de consumidor final ou CFOP de
amostra grátis continua visível como divergência documental, com a destinação
de trabalho em revenda presumida. Essa divergência e as limitações da regra de
cálculo permanecem fora do total definitivo até serem resolvidas. As novas
execuções usam `PR_FISCAL_9`; memórias anteriores não são reescritas.

## Antecipação por diferença de alíquotas

O componente `ICMS_ENTRY` atende o recorte de mercadoria importada, fornecedor
CRT 3, operação interestadual a 4%, adquirente contribuinte no Paraná e
destinação para comercialização ou industrialização. Outros enquadramentos
continuam sinalizados para tratamento próprio.

A base do XML é apresentada para confirmação de sua correspondência com o
valor legal da operação, incluindo encargos e tributos aplicáveis. A indicação
de 12% é uma sugestão condicionada ao diferimento parcial; não substitui a
conferência de benefícios, da descrição da mercadoria ou da não sujeição à ST.
A ausência dessas confirmações impede o cálculo definitivo.

`Antecipação = base confirmada × (carga interna efetiva − alíquota interestadual) / 100`

O motor mantém decimais exatos nos passos e apresenta o imposto de cada item
em centavos pelo método HALF_UP. Para a antecipação, a consolidação soma as
diferenças exatas e arredonda somente o total do grupo fiscal mensal. A aba
Entradas também agrupa os valores exatos antes de arredondar os subtotais,
conforme o modelo de referência. A aba Itens conserva uma coluna com o valor
exato para rastreabilidade. Somar os números exibidos em centavos por item pode
produzir diferença em relação ao total calculado com precisão integral.
O ICMS-ST e FCP-ST continuam somando os valores monetários das memórias salvas.

Base consultada: [Consulta SEFA/PR 28/2024, de 21/05/2024, páginas 108–110](https://www.sefanet.pr.gov.br/dados/SEFADOCUMENTOS/116202402024.pdf#page=108),
com os arts. 7º e 16 do RICMS/PR e art. 28 do Anexo VIII.
Recorte de datas desta versão: 18/03/2024 a 18/10/2026. O limite superior
representa a cobertura conferida, não uma revogação da norma.

## ICMS-ST

Mantém-se o [escopo documentado da conferência de ST](icms-st-entradas.md).
O catálogo usa NCM, CEST e data; a seleção não comprova incidência ou
responsabilidade do adquirente. Quando há correspondência no catálogo, o
formulário sugere a alíquota de ICMS para conferência, separadamente do FECOP.
As sugestões usam a [Lei PR 11.580/1996, art. 14, VIII e § 9º, VI, e art. 14A](https://www.legislacao.pr.gov.br/legislacao/pesquisarAto.do?action=exibir&codAto=278020&codTipoAto=1&tipoVisualizacao=compilado).

Entradas interestaduais selecionadas como ICMS-ST exigem confirmar a
responsabilidade do adquirente, a retenção/pagamentos anteriores e, para os
produtos do art. 97 do Anexo IX, a hipótese de uso da MVA: inexistência de preço
máximo/sugerido prevalente, interdependência ou marketing direto que exija outro
tratamento. A MVA original do catálogo é ajustada para operações interestaduais
normais a 4%, 7% ou 12%, com FECOP separado e incluído na carga do ajuste quando
incidente. O modo original não conclui uma entrada normal que exija ajuste.

Remetente CRT 1 passa a ter um recorte próprio: operação interestadual com
mercadoria de origem nacional 0/4/5, CSOSN 101/102, sem desconto, MVA original e
base própria confirmada. A dedução usa a base própria (produtos, frete, seguro e
outras despesas, sem IPI neste recorte) multiplicada pela alíquota interestadual
de 12%. Não usa `pCredSN` ou `vCredICMSSN`, nem presume ICMS próprio zero pela
ausência de destaque. Outros casos do Simples permanecem pendentes.
Base: RICMS/PR, Anexo IX, arts. 1º, § 4º, II/III, e 11, § 4º, Convênio 35/2011
e Resolução do Senado 22/1989.

CEST ausente ou sem correspondência pode ser revisado expressamente, escolhendo
uma linha candidata por NCM e vigência e registrando confirmação da descrição e
fundamento. O NCM limita as candidatas; o sistema não escolhe entre máscara,
condicionador e tintura por conterem o mesmo NCM. A memória conserva CEST/NCM
originais, linha/CEST revisados e justificativa. O XML não é modificado. Uma
referência inválida ou confirmação incompleta mantém pendência.

Consumidor final permanece fora da ST por operações subsequentes até resolver a
destinação. CFOP 6911 não autoriza antecipação para comercialização nem ST de
revenda. A antecipação deste módulo atende vendas 6101/6102; amostras,
bonificações e outras remessas exigem regra própria. O relatório apresenta
motivos específicos por item, incluindo ST já destacada, classificação,
destinação e precedência de preços. A consulta de candidato não encerra essas
pendências.

Produto fora do catálogo, benefícios e outras regras específicas continuam
identificados.
O sistema não deduz uma MVA a partir do valor esperado de uma planilha.
Para a aba Entradas, escolha explicitamente ICMS-ST do adquirente; uma
reconstituição automática do imposto já destacado pelo fornecedor não constitui
uma nova obrigação a recolher.

O total conferido representa as obrigações selecionadas nessa aba, sem
apuração de créditos, conta gráfica, juros ou guias de recolhimento.

## Validação com referências externas

A comparação com uma planilha externa deve separar reprodução aritmética,
classificação dos produtos e confirmação da obrigação. A coincidência de um
valor não autoriza escolher MVA, NCM/CEST ou alíquota para atingir o resultado
esperado. Cenários de diagnóstico não salvam confirmações de produção.

A revisão documental sinaliza incompatibilidades entre nome e código:
shampoos em NCM genérico, capilares na posição de cuidados da pele,
máscaras/finalizadores no CEST de condicionador, oxidantes, loções e body
splashes que exigem conferir função e apresentação. Esses sinais não escolhem
um NCM por palavra-chave nem reescrevem o XML. O usuário registra a
classificação revisada e seu fundamento.

Artigos com o mesmo NCM podem ter descrições legais diferentes. Apontador não
corresponde automaticamente a espátula; capas, toucas e esponjas exigem
conferir função e material. A classificação fora de uma tabela de ST não
comprova ausência de qualquer imposto.

A MVA de venda porta a porta do art. 20 da Resolução 571/2019 não é atribuída
à compra comum pela coincidência do NCM. O segmento eletrônico do art. 123 do
Anexo IX foi revogado com efeitos em 01/03/2026 (Decreto 12.828/2026), sem
dispensar a base e as condições de eventual antecipação.

A antecipação permite informar `entryBaseAmount` em reais, independentemente
do limite dos percentuais. A memória registra essa base como decisão do item
e conserva `xmlOwnBaseAmount` como evidência do XML. Informar uma base não
confirma incidência nem dispensa a confirmação da base legal. O valor absoluto
não deve ser reaproveitado entre itens.

Fichas fiscais, preços históricos prevalentes e comprovantes de recolhimento
são evidências da operação. O destaque e a conferência da aritmética da NF-e
não comprovam pagamento para o Paraná. Arquivos e identificações das empresas
utilizados em validações locais não integram os testes públicos.

Texto consolidado consultado em 18/10/2026:
[RICMS/PR](https://www.sefanet.pr.gov.br/dados/SEFADOCUMENTOS/106201707871.pdf),
Anexo IX, arts. 1º, 11, 16, 96–98 e seção XXIII revogada;
[Resolução 571/2019](https://www.sefanet.pr.gov.br/dados/SEFADOCUMENTOS/101201900571.pdf),
arts. 12 e 20. As novas execuções usam `PR_FISCAL_9`.
