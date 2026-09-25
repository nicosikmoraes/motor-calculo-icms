# Revisão fiscal do pacote embarcado PR — versão 1

**Estado:** o usuário aprovou nesta conversa, em 25/09/2026, os três recortes e suas alíquotas propostos. As regras permanecem em `DRAFT` para cálculo porque base, exceções, arredondamento e exemplos homologados ainda não foram aprovados. A seleção automática apenas explica correspondências; não calcula nem compara ICMS.

## Cobertura técnica proposta

Todas as propostas exigem NF-e com emissão a partir de **2026-01-01** (limite inicial do pacote, não data de início da lei), saída normal (`tpNF=1`, `finNFe=1`), regime do emitente `CRT=3`, ICMS `CST=00` e origem da mercadoria `orig=0`. São apenas revendas comuns com CFOP exato e as UFs abaixo. Não cobrem outras combinações, benefícios, base reduzida, ST, DIFAL, FCP, mercadoria importada ou outras origens da mercadoria.

| ID | Origem → destino | CFOP | Alíquota proposta | Fundamento a revisar |
| --- | --- | --- | ---: | --- |
| `pr-interna-cfop-5102-cst-00` | PR → PR | 5102 | 19,50% | Lei PR 11.580/1996, art. 14, VIII, hipótese dos demais bens e mercadorias |
| `pr-sp-cfop-6102-cst-00` | PR → SP | 6102 | 12,00% | Resolução do Senado 22/1989, art. 1º |
| `pr-ba-cfop-6102-cst-00` | PR → BA | 6102 | 7,00% | Resolução do Senado 22/1989, art. 1º, parágrafo único, II |

## Pontos ainda necessários para ativar o cálculo

1. Identificar mercadorias ou benefícios que exigem exceção antes da regra geral interna do PR.
2. Aprovar separadamente a composição da base, inclusive frete, seguro, desconto e IPI, com exemplos esperados. A LC 87/1996, art. 13, § 2º, traz condição específica para a exclusão do IPI.
3. Aprovar arredondamento e tolerância de comparação com exemplos. O valor declarado no XML não substitui um parâmetro ausente.
4. Definir a próxima expansão da matriz para as demais UFs e operações de entrada no PR.

**Ativação:** a aprovação dos recortes e alíquotas registrada acima não libera cálculo. A regra só poderá passar de rascunho a aprovada depois que suas exceções, base, arredondamento e exemplos forem validados e versionados. Uma atualização do pacote exige nova versão, mantendo rastreável a utilizada em cada cálculo futuro.

## Fontes oficiais

- [Lei 11.580/1996 do Paraná, art. 14](https://www.legislacao.pr.gov.br/legislacao/listarAtosAno.do?action=exibir&codAto=278020&codItemAto=2215421)
- [Resolução do Senado 22/1989](https://legis.senado.leg.br/norma/586152/publicacao/15646891)
- [Lei Complementar 87/1996, art. 13](https://legis.senado.leg.br/norma/572842/publicacao/34621002)
