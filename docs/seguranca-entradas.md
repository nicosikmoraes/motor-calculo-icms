# Segurança das entradas XML e ZIP

Esta camada executa antes do parsing fiscal e antes de qualquer escrita de uma
entrada ZIP no disco. Seu objetivo é rejeitar construções inseguras com códigos
estáveis sem depender do nome ou extensão do arquivo.

## XML

`DOCTYPE` e qualquer declaração `ENTITY` são recusados antes do
`fast-xml-parser` e do validador XSD. Isso bloqueia entidades externas, expansão
de entidades e leitura indireta de recursos locais ou remotos. As cinco entidades
predefinidas do XML continuam permitidas e são decodificadas normalmente.

## ZIP

A inspeção utiliza `yauzl` 3.4.0 com:

- leitura sequencial (`lazyEntries`);
- validação do tamanho descomprimido informado;
- nomes estritos;
- descompressão para sumidouro controlado, sem criar arquivos;
- conferência do tamanho efetivamente produzido;
- cálculo incremental de CRC-32 e comparação com o diretório central;
- interrupção assim que um limite for excedido.

São recusados:

| Código | Condição |
|---|---|
| `ZIP_INVALID` | estrutura truncada, metadados inválidos ou stream corrompido |
| `ZIP_CRC_MISMATCH` | conteúdo descomprimido não corresponde ao CRC-32 declarado |
| `ZIP_ARCHIVE_TOO_LARGE` | tamanho do ZIP acima da política |
| `ZIP_TOO_MANY_ENTRIES` | quantidade de entradas acima da política |
| `ZIP_ENTRY_TOO_LARGE` | uma entrada excede o tamanho descomprimido permitido |
| `ZIP_EXPANDED_CONTENT_TOO_LARGE` | soma descomprimida excede a política |
| `ZIP_COMPRESSION_RATIO_EXCEEDED` | razão descomprimido/comprimido excessiva |
| `ZIP_PATH_UNSAFE` | caminho absoluto, ascendente, inválido ou profundo demais |
| `ZIP_ENCRYPTED` | entrada protegida por senha ou criptografada |
| `ZIP_SYMBOLIC_LINK` | entrada identificada como link simbólico Unix |

Diretórios são inventariados durante a inspeção, mas não abertos como streams.
Backslash é recusado pelo modo estrito. Caminhos aceitos ainda passam pela mesma
normalização usada no inventário.

## Política de limites

Não existem constantes ocultas. Toda inspeção exige uma `ZipSecurityPolicy` com:

- tamanho máximo do arquivo ZIP;
- quantidade máxima de entradas;
- tamanho máximo descomprimido por entrada;
- tamanho máximo descomprimido total;
- taxa máxima de compressão;
- profundidade máxima de caminho.

Os testes usam valores pequenos e explícitos para provar os bloqueios. A política
inicial de produção aprovada limita cada ZIP a 500 MB, cada XML expandido a 10 MB,
o conteúdo total expandido a 2 GB e a taxa de compressão a 100:1. O limite
técnico de entradas e a profundidade máxima de caminho permanecem pendentes na
MD-04. Uma política ausente, infinita, zero ou negativa é rejeitada em vez de
desabilitar silenciosamente a proteção.

## Limites deste incremento

- a inspeção não persiste nem extrai arquivos aprovados;
- ainda falta decidir o destino temporário e a limpeza após cancelamento;
- ainda falta integrar a política definitiva ao processo principal do Electron;
- testes de carga e arquivos ZIP64 representativos pertencem à homologação.
