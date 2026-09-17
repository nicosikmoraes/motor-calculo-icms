# Contrato do inventário de arquivos

O inventário é a primeira etapa de um lote confirmado. Ele registra cada aparição
de um arquivo antes do parsing e produz uma ordem reproduzível, sem deduplicar ou
interpretar consequências fiscais.

## Identidade e proveniência

O lote possui:

- `batchId`: UUID estável da ocorrência do envio;
- `receivedAt`: data e hora em ISO 8601;
- `inventoryHash`: SHA-256 da representação canônica do inventário.

O `inventoryHash` identifica o mesmo conjunto de entradas, mas não substitui o
`batchId`. Dois lotes com os mesmos arquivos mantêm identidades e históricos
independentes.

Cada ocorrência contém:

- posição estável, iniciada em 1;
- SHA-256 do conteúdo;
- tamanho em bytes;
- tipo detectado pelo conteúdo: `XML`, `ZIP` ou `UNKNOWN`;
- origem: arquivo selecionado, arquivo de pasta ou futura entrada de ZIP;
- caminho relativo normalizado e nome original;
- nome do contêiner, quando a futura extração de ZIP for implementada.

## Determinismo

Antes de atribuir posições, as ocorrências são ordenadas por caminho relativo,
hash, tamanho, tipo de origem e contêiner. Comparações não dependem do locale do
sistema operacional. Separadores `\\` viram `/` e nomes Unicode usam NFC.

A representação canônica usa JSON de arrays com campos em ordem fixa. Assim,
nomes com espaços ou quebras de linha não tornam o hash ambíguo. Alterar apenas a
ordem em que os mesmos arquivos foram recebidos não altera ocorrências ordenadas
nem `inventoryHash`.

## Segurança e integridade

- caminhos absolutos, segmentos `..`, caminho vazio e byte nulo são recusados;
- o tipo é detectado pelos primeiros bytes, sem confiar na extensão;
- arquivos locais são lidos em streaming durante o SHA-256;
- tamanho, horário de alteração e inode são conferidos novamente depois da leitura;
- alteração observável durante o inventário interrompe aquela operação;
- ocorrências com o mesmo hash são preservadas, não apagadas.

A condição `REPETIDA` depende também da chave da nota e somente será atribuída
depois do parsing. O inventário não presume que dois arquivos de mesmo conteúdo
representam uma decisão fiscal duplicada.

## Limites deste incremento

- o adaptador recebe arquivos já enumerados; seleção recursiva de pastas ainda
  será conectada ao processo principal;
- ZIP ainda é apenas detectado, não extraído;
- limites de tamanho, profundidade e quantidade dependem da MD-04;
- persistência das ocorrências depende da decisão MD-03.
