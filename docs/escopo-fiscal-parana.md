# Primeiro escopo fiscal do Paraná

Decisão do usuário em 04/10/2026. Este documento registra o escopo aprovado;
não equivale a homologação fiscal nem a conclusão da interface do aplicativo.

## Regras aprovadas

- Priorizar empresas do Paraná, considerando compras e vendas separadamente.
- Começar pelo ICMS próprio das saídas internas comuns do regime normal, com
  alíquota geral de 19,5%, na vigência iniciada em 18/03/2024.
- Confirmar o enquadramento legal do produto/operação antes de aplicar a regra
  geral. O imposto declarado no XML não determina o imposto esperado.
- Aplicar o diferimento parcial para carga de 12% quando atendidos os requisitos
  do art. 28 do Anexo VIII, com encerramento conforme art. 29. Consumidor final
  contribuinte também encerra o diferimento. Excluir petróleo/combustíveis e
  destinatários de construção civil; conferir benefícios concorrentes e
  tratamentos específicos mais favoráveis, respeitando exceções legais.
- Não exigir cadastro fiscal prévio: informações faltantes serão pedidas durante
  o processamento, com item pendente enquanto a resposta não existir.
- Manter separadas a condição do emitente, a do destinatário e a perspectiva da
  empresa analisada. O CRT do emitente não identifica o regime do destinatário.
- Destinação: revenda, industrialização, ativo ou uso/consumo. Crédito de compras
  necessita regra própria e não é automaticamente igual ao ICMS destacado.
- Usar decimais exatos; arredondar cada parcela/item em duas casas, HALF_UP;
  somar parcelas arredondadas. Tolerância de conferência proposta e aceita:
  R$ 0,01 por componente/item, com diferença visível (não tolerância legal).
- Aproveitar valores distribuídos por item antes de qualquer rateio. Se necessário,
  ratear totais proporcionalmente ao valor dos produtos, distribuindo os centavos
  por maiores restos e desempate pelo número do item no XML.
- Não converter valores negativos em positivos; preservar o original e pedir
  revisão. Zero válido pode ser calculado. Campos necessários desconhecidos não
  devem assumir zero.

## Implementação deste incremento

`calculateParanaCommonIcms` recebe o contexto confirmado e os valores do item.
Compõe produto + frete + seguro + despesas + IPI quando incluído legalmente,
deduzindo apenas desconto incondicional. Encargo opcional ausente representa
ausência no item **somente depois** de o chamador resolver totais não distribuídos.
Não se adiciona novamente o ICMS já incluído no valor da operação.

A memória preserva o declarado e registra base, imposto original, imposto devido
e diferido. A parcela diferida é a diferença entre valores monetários arredondados,
evitando calcular com o percentual aproximado de 38,46%. Em uma base de R$ 1.000,
registra R$ 195 originais, R$ 120 devidos e R$ 75 diferidos; a alíquota nominal
permanece 19,5%. Não lança crédito de compra nem cobrança autônoma futura do
imposto diferido. O encerramento exige tributar a operação subsequente conforme
suas regras, não transportar automaticamente aquele valor para a próxima nota.

## Fluxo de perguntas no lote

Após a importação concluída, a tela abre o lote e apresenta os itens com dados
fiscais faltantes. Pergunta destinação, construção civil, petróleo/combustível e
confirmação expressa do enquadramento comum; a indicação `indIEDest` do XML informa
a condição do contribuinte, quando disponível. IPI e desconto não nulos geram
perguntas específicas. As notas antigas sem `indIEDest` normalizado perguntam a
condição do destinatário. Nenhum valor da base/alíquota/imposto pode ser enviado
pela interface como resposta: esses valores vêm do documento persistido.

Salvar admite respostas parciais e cria execução imutável com origem das respostas,
data e vínculo à execução anterior. Somente o item escolhido é recalculado; irmãos
mantêm seus resultados. Repetição da solicitação é idempotente e conflito com uma
tela desatualizada bloqueia a gravação. A resposta pode valer só para o item atual
ou, por escolha expressa, para as próximas notas desta empresa e produto do
fornecedor. Não cria cadastro obrigatório. O usuário pode avançar para outra pendência.

A integração inicial cobre NF-e modelo 55, CRT 3, saída e finalidade normal,
CFOP 5101/5102, CST 00/51, PR–PR. Isso é um filtro de cobertura, não prova de
enquadramento fiscal do produto: o usuário confirma expressamente o tratamento
comum. Valores declarados de redução de base, ST/FCP, documento não elegível,
cancelamento/denegação associados ou valores impossíveis de distribuir impedem este cálculo.
A destinação conflitante com `indFinal` ou exclusão indevida do IPI preservam
pendência e as respostas. O resultado é conferência do ICMS da operação; não
concede crédito nem integra automaticamente uma apuração definitiva.

Não alterar automaticamente regras DRAFT para aprovadas nem inferir destinação
apenas de CFOP, CST ou inscrição estadual. A reavaliação do catálogo de regras
continua separada do cálculo, preservando seus registros anteriores.

## Integrações ainda necessárias

A consolidação de conferência por empresa e mês está disponível na tela do lote
(DT-044), com compras/vendas, ambientes e protocolos separados. Ela resume apenas
o lote aberto; não apura créditos nem saldo a recolher. Falta ampliação do
catálogo fiscal para automatizar o enquadramento sem confirmação manual.

## Reaproveitamento das respostas

A definição é vinculada à empresa analisada, CNPJ do emitente e código do produto
no XML. Para salvar nas próximas notas, o item precisa estar calculado; respostas
incompletas continuam podendo ser salvas só no item. Alterar só o item não altera
a definição futura. Revisões da definição são imutáveis e vinculadas à execução
de cálculo de origem, na mesma transação. Concorrência ou falha desfazem ambas as
gravações. A migration 15 integra as definições ao mesmo SQLite dos backups.

Ao abrir a análise do lote, o aplicativo aplica e grava as definições compatíveis
antes de mostrar os resultados. A definição precisa corresponder à versão do
motor, destinatário, modelo, UF, regime, direção/finalidade, ambiente, consumidor
final, descrição, NCM/CEST, CFOP, unidade e características fiscais declaradas,
incluindo presença de IPI/desconto. Valores e quantidades podem variar: o cálculo
sempre usa os valores da nova nota. Somente a definição mais recente da chave é
considerada; uma versão antiga não volta a ser aplicada automaticamente.

A operação e o recebimento do lote não podem ser anteriores aos da definição de
origem. Itens ainda não respondidos do mesmo lote podem aproveitar a definição,
mas respostas manuais (inclusive parciais) e resultados já gravados permanecem
preservados. Mudanças ou conflitos deixam o item sem aplicação automática e
pedem nova conferência. A memória registra definição e execução de origem; a tela
informa quando houve reaproveitamento. O alcance continua sendo o mesmo ICMS
próprio comum, sem crédito automático ou apuração definitiva.

Simples, MEI, operações interestaduais, importações, ST, FCP, benefícios específicos,
outras alíquotas e vigências anteriores exigem incrementos próprios. O marco
inicial não autoriza aplicar 19,5% sem conferir alterações legais posteriores;
a seleção de regras por vigência continua sendo responsabilidade da integração.

## Rateio e conferência do XML

Frete, seguro, desconto e outras despesas são distribuídos quando o total existe
e há saldo sem distribuição nos itens. Valores explícitos, inclusive zero, são
preservados. O saldo é dividido só entre campos ausentes, proporcionalmente ao
valor dos produtos desses itens. Cálculo inteiro em centavos e pesos decimais
exatos; centavos restantes seguem os maiores restos, desempate pelo número
numérico do item. A soma fecha exatamente o total, sem adicionar o encargo duas
vezes. Sem total, permanece o valor do item e encargo opcional ausente vale zero.

Totais negativos, mais de duas casas monetárias não nulas, saldo negativo,
valores completamente distribuídos que não fecham, pesos desconhecidos,
negativos ou todos zero impedem o rateio. Itens excluídos do total com encargos
compartilhados exigem revisão da composição. IPI divergente não é distribuído
como despesa: exige revisar o tributo por produto. Desconto rateado não nulo gera
a pergunta de tratamento condicional/incondicional antes de compor a base.

A memória registra total, saldo, peso total elegível, produto, parcela, método e
origem dos valores. A versão PR_COMMON_2 preserva cálculos existentes e exige
reconfirmar definições reutilizáveis de outra versão. Novos cálculos comparam base
e ICMS devido ao declarado, por item: igualdade, diferença até R$ 0,01 inclusive,
divergência, valor ausente ou inválido. Diferença = calculado menos declarado,
sempre visível. A tolerância é de conferência e não altera o imposto. Não há
compensação de diferenças entre itens nem autorização para crédito de compra.

## Fontes oficiais consultadas em 04/10/2026

- [RICMS/PR consolidado, Decreto 7.871/2017](https://www.sefanet.pr.gov.br/dados/SEFADOCUMENTOS/106201707871.pdf): art. 17 e Anexo VIII, arts. 28–29 (páginas impressas 2248–2252).
- [Decreto 5.143/2024](https://www.sefanet.pr.gov.br/dados/SEFADOCUMENTOS/102202405143.pdf): alterações 933 e 936, efeitos em 18/03/2024.
- [LC 87/1996, art. 13](https://www.planalto.gov.br/ccivil_03/leis/lcp/lcp87.htm): composição da base e condições de exclusão do IPI.
