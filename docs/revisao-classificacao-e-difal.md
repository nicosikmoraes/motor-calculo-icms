# Revisão de classificação e entradas interestaduais

## O que mudou

- A conferência de ST já declarada é encaminhada antes dos filtros de revenda e CFOP da estimativa de novo débito. CFOP 6403 não é tratado como remessa genérica sem cálculo.
- As versões automáticas são XML_ARITHMETIC_7 e XML_CATALOG_3. A versão 7 reconhece também ST anterior em entradas interestaduais para o PR, preservando respostas manuais e o histórico.
- A busca de MVA apresenta candidatas pelo NCM e destaca maquiagem para lábios quando a descrição é gloss/batom/lip. A sugestão não altera CEST nem confirma incidência: a revisão exige confirmação e fundamento.
- Uma classificação revisada pode ser compartilhada. No lote, exige mesma empresa, fornecedor, mês e características fiscais; a descrição deve ser idêntica, exceto a família estreita de maquiagem dos lábios. Cada produto conserva seus próprios valores. Itens calculados ou já revisados são preservados. Todas as notas afetadas são gravadas em uma transação.
- O compartilhamento não copia bases em reais, ausência de débito ou regras setoriais individuais. O formulário mostra as notas e itens afetados.
- Notas de consumidor final deixam de receber a premissa de revenda. A escolha explícita encaminha para ST ou DIFAL de uso/ativo. Uma destinação diferente do XML exige justificativa, sem modificar o documento.

## Preparação automática das pendências

A conferência agrupa itens por destinação, ST anterior, seção revogada, CEST ausente, classificação sugerida ou enquadramento fora do catálogo. Cada item informa a próxima decisão necessária. A regra de revogação fica limitada às datas verificadas, de 01/08/2024 a 12/10/2026.

Para maquiagem de lábios com descrição compatível e classificação divergente, a tela calcula uma simulação com o CEST sugerido. A simulação usa o rateio próprio do produto e as premissas da estimativa de entrada por MVA. Ela registra o CEST original, o sugerido e o caráter não confirmado da classificação, sem gravar respostas ou entrar nos totais. O botão de preparação seleciona a referência no formulário; as confirmações fiscais continuam explícitas. Ao confirmar uma revisão válida, os equivalentes escolhidos no lote são calculados individualmente.

A ST anterior (CST 60/CSOSN 500) permanece como tratamento documental sem apuração. Mesmo sem valores de retenção no XML, não é convertida em imposto zero nem em nova cobrança. O reconhecimento interestadual não amplia as regras de isenção, Simples sem destaque ou diferimento interno.

Referência de classificação, Convênio ICMS 142/18, cláusula sétima e CEST 20.009.00:
https://www.confaz.fazenda.gov.br/legislacao/convenios/2018/CV142_18

## Conferência em três etapas

1. **Sobre a compra:** informa uso real, correspondência do produto à descrição sugerida e, quando há ST anterior, existência e referência de comprovante. Há opções para informação desconhecida. Uma premissa antiga de revenda não é apresentada como escolha já confirmada.
2. **Confira a análise:** apresenta a sugestão em linguagem simples e as simulações disponíveis. Classificação fiscal, percentuais, incidência e demais confirmações ficam em **Revisão fiscal avançada**, inicialmente recolhida. Confirmar o tipo de produto não confirma sua classificação legal.
3. **Aplicar e calcular:** mostra o resumo, começa em **Somente neste item** e permite selecionar os equivalentes antes de enviar. Informações desconhecidas ou confirmações ausentes mantêm o cálculo bloqueado; **Guardar para revisão** salva somente o item atual, sem resultado ou imposto zero.

Os fatos da compra e a solicitação de revisão são gravados no histórico das respostas. O processo principal mantém a pendência mesmo se receber confirmações fiscais antigas junto com informação desconhecida. Mudar destinação, descrição ou informação de pagamento invalida as confirmações relacionadas na tela. Referências de comprovantes não são compartilhadas com outras notas. A rotina automática preserva essas revisões.

## DIFAL de uso/ativo

Recorte para contribuinte PR, aquisição interestadual normal, CRT 1/3, CST 00 ou CSOSN 101/102, sem ST anterior, redução, isenção, regra setorial ou FECOP. Exige confirmação de incidência, ausência de pagamentos anteriores, composição do valor da operação e alíquotas efetivas. Não utiliza o diferimento de revenda.

A partir do valor da operação na origem, apura o imposto nominal interestadual, expurga-o e recompõe a base no destino por dentro. DIFAL = ICMS do destino − ICMS da origem, arredondado por item. A memória registra as duas bases e as escolhas do responsável. Não representa apuração de créditos.

Referência: Lei PR 11.580/1996, arts. 2º, VI, 5º, XIV, 6º, IX, § 1º, I, e § 3º, I:
https://www.legislacao.pr.gov.br/legislacao/exibirAto.do?action=iniciarProcesso&codAto=278020&codItemAto=1766149

## Artefatos domésticos

O CEST 14.005.00 com NCM 3924 recebe aviso da revogação da seção de artefatos de uso doméstico a partir de 01/08/2024. A rotina não injeta MVA antiga nem assume ausência de outra obrigação de entrada. A decisão permanece explícita no fluxo de revisão.

Decreto PR 6.048/2024:
https://www.legislacao.pr.gov.br/legislacao/exibirAto.do?action=iniciarProcesso&codAto=327771&codItemAto=2074937

Resolução 571/2019 compilada, seção VI, nota da Resolução 852/2024:
https://www.sefanet.pr.gov.br/dados/SEFADOCUMENTOS/101201900571.pdf
