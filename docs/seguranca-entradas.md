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

Falhas locais rejeitam somente a entrada afetada; falhas estruturais ou limites
globais rejeitam o ZIP inteiro:

| Código | Condição | Efeito |
|---|---|---|
| `ZIP_INVALID` | estrutura truncada, metadados inválidos ou stream corrompido | rejeita o ZIP |
| `ZIP_CRC_MISMATCH` | conteúdo descomprimido não corresponde ao CRC-32 declarado | rejeita a entrada |
| `ZIP_ARCHIVE_TOO_LARGE` | tamanho do ZIP acima da política | rejeita o ZIP |
| `ZIP_TOO_MANY_ENTRIES` | quantidade de entradas acima da política | rejeita o ZIP |
| `ZIP_ENTRY_TOO_LARGE` | uma entrada excede o tamanho descomprimido permitido | rejeita a entrada |
| `ZIP_EXPANDED_CONTENT_TOO_LARGE` | soma descomprimida excede a política | rejeita o ZIP |
| `ZIP_COMPRESSION_RATIO_EXCEEDED` | razão descomprimido/comprimido excessiva | rejeita a entrada |
| `ZIP_PATH_UNSAFE` | caminho absoluto, ascendente, inválido ou profundo demais | rejeita a entrada |
| `ZIP_ENCRYPTED` | entrada protegida por senha ou criptografada | rejeita a entrada |
| `ZIP_SYMBOLIC_LINK` | entrada identificada como link simbólico Unix | rejeita a entrada |

Diretórios são inventariados durante a inspeção, mas não abertos como streams.
Os nomes são lidos sem a validação global do `yauzl` para que um caminho malicioso
possa ser isolado sem ocultar as demais entradas; cada nome passa obrigatoriamente
pela mesma normalização segura usada no inventário.

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
o conteúdo total expandido a 2 GB, a taxa de compressão a 100:1, o total de
entradas a 10.000 e a profundidade do caminho a 20 segmentos. XMLs aceitam no
máximo 100 elementos aninhados. Uma política ausente, infinita, zero ou negativa é rejeitada em vez de
desabilitar silenciosamente a proteção.

## Limites deste incremento

- a inspeção não persiste nem extrai arquivos aprovados;
- ainda falta decidir o destino temporário e a limpeza após cancelamento;
- ainda falta integrar a política definitiva ao processo principal do Electron;
- testes de carga e arquivos ZIP64 representativos pertencem à homologação.
