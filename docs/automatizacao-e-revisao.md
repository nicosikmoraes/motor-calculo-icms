# Cálculo automático das compras interestaduais para o Paraná

## Recorte aprovado

O aplicativo calcula apenas compras de outra UF destinadas à empresa compradora do Paraná. O CFOP original não é convertido: normalmente 6xxx na saída do fornecedor, ou 2xxx na nota de entrada emitida pela compradora. UFs, sentido da operação e CNPJ da empresa são conferidos juntos. Notas internas permanecem para consulta, excluídas dos cálculos e totais. Memórias anteriores permanecem no histórico.

## Cálculo

Para mercadorias da tabela da Resolução SEFA 1245/2025, com NCM/CEST e vigência correspondentes:

- Base da operação: produtos + IPI + frete + seguro + despesas, deduzindo desconto incondicional confirmado/reconciliado quando a base é por MVA.
- Base ST: base da operação × (1 + MVA aplicada/100).
- Regime normal: MVA ajustada interestadual quando exigida; dedução do ICMS próprio informado no XML.
- Simples no recorte nacional admitido: MVA original; dedução pela base própria e alíquota interestadual, sem usar crédito do Simples.
- Alíquota interna e FCP separados conforme categoria e data da regra embarcada. O FCP integra a carga do ajuste de MVA, sem ser contado duas vezes no ICMS.

O resultado automático de entrada é uma estimativa sob a premissa de revenda e base por MVA. A memória distingue dados do XML, catálogo, regras e premissas. Descrição legal, preço prevalente, responsabilidade e pagamentos anteriores precisam ser considerados antes de efetuar recolhimento. A existência de ST retida não gera nova cobrança automática.

## Validação com o arquivo fornecido

No DownloadDFe_87.zip: 114 NF-e, 988 itens. São 137 itens em 13 notas interestaduais; 851 itens de operações internas ficam fora dos totais. Foram obtidos 105 itens calculados e 32 exceções com motivos próprios: classificação ausente/fora do catálogo, remessa específica ou consumidor final. As notas 6838 (ES, CFOP 6102) e 163859 (SP, CFOP 6101), também citadas na planilha do usuário, têm seus itens calculados.

A planilha de setembro contém fórmulas de diferença de alíquotas e valores finais de ST digitados manualmente. Esses valores não são impostos ao motor para forçar conciliação. Ajuste de MVA, classificação, IPI, descontos, FCP e arredondamento por item ficam explícitos para comparação.

Os XMLs reais não são incluídos no repositório. A suíte usa notas sintéticas para cálculo, descontos, limites, exclusão de operações internas e revisão compartilhada.

## Interface e histórico

A conferência separa itens sem cálculo, divergências e tratamentos documentais sem apuração. Respostas podem ser aplicadas aos produtos fiscalmente compatíveis da mesma nota. Respostas manuais e execuções antigas são preservadas. Ausência de destaque não é convertida em imposto zero calculado.

## Fontes

- Resolução 1245/2025: https://www.legislacao.pr.gov.br/legislacao/listarAtosAno.do?action=exibirImpressao&codAto=381258
- Desconto incondicional na base por MVA: Consulta SEFA/PR 038/2018, páginas 124–126 de https://www.sefanet.pr.gov.br/dados/SEFADOCUMENTOS/116201802018.pdf
