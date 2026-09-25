# NF-e sintéticas para teste de ICMS próprio

Estes quatro XMLs são **sintéticos**. Os CNPJs, inscrições, protocolo e assinatura são valores de teste. Eles passam na validação XSD NF-e 4.00 do projeto, mas **não são NF-e autorizadas pela SEFAZ**, nem exemplos fiscais homologados. Não os envie à SEFAZ nem use seus valores para apuração.

Cada arquivo contém um item de R$ 100,00, com CST 00 e valor de ICMS declarado apenas para exercitar o parser e a futura comparação por item:

| Arquivo | Origem → destino | `pICMS` | `vICMS` declarado |
| --- | --- | ---: | ---: |
| `pr-pr-interna.xml` | PR → PR | 19,5% | R$ 19,50 |
| `pr-sp-interestadual.xml` | PR → SP | 12% | R$ 12,00 |
| `pr-ba-interestadual.xml` | PR → BA | 7% | R$ 7,00 |
| `ba-pr-interestadual.xml` | BA → PR | 12% | R$ 12,00 |

As alíquotas são **hipóteses ilustrativas** do rascunho MD-05. O NCM e o produto sintéticos não têm enquadramento fiscal validado. Para homologar o motor, ainda precisamos de NF-e reais anonimizadas, com o resultado esperado conferido por responsável fiscal.
