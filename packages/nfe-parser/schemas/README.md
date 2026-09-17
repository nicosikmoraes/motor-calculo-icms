# Schemas oficiais NF-e/NFC-e

Catálogo offline usado pela prova de conceito do parser.

## Pacote principal

- Portal Nacional da NF-e: `PL_010f_v1.04.zip`;
- publicação: 31/08/2026;
- SHA-256 do ZIP original:
  `b8589490a58a09a993a80e6ac4d7ed10f20892061ecfc56719337098d4b95998`;
- origem:
  <https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=8ITFuBLltXs=>.

O pacote oficial é incremental e contém os cinco schemas atualizados da NF-e.

## Envelope `nfeProc`

O arquivo `procNFe_v4.00.xsd`, que apenas inclui o leiaute e declara a raiz
`nfeProc`, foi obtido do pacote oficial `PL_009p_NT2024_003_v1.03`:

- SHA-256 do ZIP original:
  `2e925939a228aaf785be9fe7d6315f2da94d3a10036d54ffb7c1273aa7502b05`;
- origem:
  <https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=sjdK%2FJDjQs8=>.

Os arquivos são embarcados para validação offline. Uma atualização exige novo
inventário, hashes, testes de regressão e atualização da DT-020.
