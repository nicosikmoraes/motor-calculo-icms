# Contrato normalizado de NF-e e NFC-e

O parser converte o leiaute XML 4.00 em tipos próprios do domínio antes que dados
cheguem ao motor fiscal. O restante do sistema não depende da estrutura produzida
pelo `fast-xml-parser`, dos nomes internos do XSD nem de detalhes de namespace.

## Documento

`NormalizedNfe` contém:

- chave, modelo, número, série e data de emissão;
- natureza, direção, destino, finalidade, ambiente, consumidor final e presença;
- emitente e destinatário, com CNPJ/CPF, IE, UF e CRT quando informados;
- itens normalizados;
- totais declarados em `ICMSTot`;
- referência de origem `NFE_XML_4_00` e caminho lógico no XML.

O destinatário é opcional porque há hipóteses válidas de NFC-e sem sua
identificação. A ausência de campo exigido em um contexto fiscal específico será
tratada pela normalização fiscal e pelo catálogo de severidades.

## Item

`NormalizedNfeItem` preserva:

- número sequencial e código do produto no fornecedor;
- descrição, NCM, CEST e CFOP;
- unidades, quantidades, valor unitário e valor total;
- frete, seguro, desconto e outras despesas atribuídos no XML;
- indicador de participação no total da nota;
- ICMS próprio, ICMS-ST, FCP, FCP-ST e DIFAL declarados, quando presentes;
- caminho lógico do item de origem.

O grupo concreto de ICMS, como `ICMS00` ou `ICMSSN102`, é preservado em `group`.
`CST` e `CSOSN` permanecem campos distintos. Os valores são declarações do
emissor para comparação futura e não determinam a regra que o motor aplicará.

## Regras de representação

- todo valor monetário, percentual e quantitativo permanece como texto decimal;
- nenhum decimal fiscal é convertido para `number` nesta fronteira;
- CNPJ, CPF, chave, NCM, CEST, CFOP, CST, CSOSN e códigos mantêm zeros à esquerda;
- campo ausente continua ausente: o normalizador não cria zero ou valor padrão;
- o XML original permanece imutável;
- a proveniência aponta o formato e o caminho lógico de documento ou item.

## Limites deste incremento

- ainda não há conversão para uma biblioteca de decimal exato;
- PIS, COFINS e IPI por item não foram normalizados porque o primeiro motor é de
  ICMS; seus totais declarados já são preservados;
- protocolo e eventos terão contratos próprios depois da decisão sobre versões;
- regras fiscais, arredondamento e valores calculados não pertencem a este
  contrato.
