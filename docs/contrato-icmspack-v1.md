# Contrato técnico inicial de `.icmspack` — versão 1

Estado: manifesto e codec de validação implementados em `@motor/interchange`,
conforme DT-004. Ainda não há seleção de arquivo, exportação de cadastros do
SQLite, importação, resolução de conflitos ou gravação no banco.

## Envelope

O codec inicial serializa JSON em UTF-8. Não usa ZIP nem extrai arquivos. A
representação é uma preparação técnica do intercâmbio; proteção, senha ou
criptografia continuam em MD-09 e não são resolvidas por este contrato.

| Campo | Conteúdo |
| --- | --- |
| `format` | Literal `ICMSPACK` |
| `schemaVersion` | Inteiro 1; qualquer outra versão é recusada |
| `manifest.createdAt` | Instante UTC canônico com milissegundos |
| `manifest.appVersion` | Versão do aplicativo de origem |
| `manifest.sections` | Contagem e SHA-256 de cada coleção |
| `payload` | `companies`, `profiles`, `products`, `rules` |
| `sha256` | SHA-256 do envelope inteiro sem o próprio campo `sha256` |

Cada uma das quatro coleções é obrigatória, podendo estar vazia. Campos
não previstos são recusados em todos os níveis, inclusive nas condições de
regras. Não são aceitos XMLs, resultados, relatórios, logs, auditorias,
credenciais ou banco SQLite. Organização e revisões locais não são transferidas;
a atribuição à organização de destino e a revisão de conflitos pertencem à futura
importação, sem restauração de histórico por este codec.

## Cadastros do primeiro recorte

- Empresas: UUID, razão social, nome fantasia opcional, CNPJ canônico, UF e estado ativo.
- Perfis: UUID, empresa, nome, vigência e estado ativo.
- Produtos de fornecedor: UUID, empresa, CNPJ do fornecedor, código textual,
  perfil e estado ativo.
- Regras locais aprovadas para seleção: UUID, família, versão, estado `APPROVED`,
  nome, nível, prioridade e justificativa quando necessária, vigência,
  fundamento e condições de igualdade exata. Rascunhos e revogações são recusados.

UUIDs são textuais em minúsculas. A validação usa os contratos cadastrais atuais,
com CNPJ válido, UF reconhecida, datas reais, intervalos válidos e referências
fechadas dentro do pacote. Duplicações de ID por coleção, CNPJ de empresa,
identidade do vínculo de produto e família/versão de regra são recusadas. Produtos
e perfis devem pertencer à mesma empresa; condições de regra devem apontar para
cadastros presentes e coerentes entre si. A importação futura terá de resolver
colisões com a instalação de destino.

O primeiro recorte não contém benefícios ou parâmetros tributários ainda sem
schema aprovado. Isso não altera o escopo final da DT-004; esses cadastros exigirão
uma evolução versionada do contrato. Regras embarcadas no aplicativo não são
copiadas como regras locais. `APPROVED` habilita seleção no catálogo de origem;
não equivale à homologação tributária ou liberação de cálculo no destino.

## Integridade e determinismo

O construtor copia os dados e ordena cada coleção pelo UUID, sem alterar a entrada.
A serialização ordena chaves de objetos; preserva strings e a ordem dos arrays.
Hashes são calculados sobre essa representação compacta, em UTF-8. O manifesto
registra hashes individuais e o hash do envelope protege também seus metadados.
Espaçamento e ordem de chaves no JSON recebido não mudam seu significado nem hash.

SHA-256 detecta divergência em relação ao manifesto recebido. Não é assinatura,
prova de autoria ou criptografia: quem reescrever o conteúdo e recalcular todos os
hashes pode produzir outro pacote válido. Este codec não executa fórmula ou código
recebido e não escreve no banco.

Há limites defensivos iniciais de 10 MiB de JSON e 10.000 registros por coleção.
São limites do codec, sem substituir metas de escala e desempenho de MD-11. A
checagem de bytes ocorre antes do parse. Validação de schema e referências ocorre
antes de qualquer uso dos cadastros; a etapa seguinte deverá validar novamente
antes de iniciar a transação de importação.

## API e verificação

`createIcmsPack(payload, metadata)` constrói o envelope e o manifesto.
`serializeIcmsPack(pack)` valida antes de devolver o JSON canônico.
`parseIcmsPack(json)` verifica tamanho, schema, referências, contagens e hashes,
devolvendo o envelope ou `PackValidationError` com código e campo, sem expor o
conteúdo cadastral na mensagem.

Testes cobrem ida e volta, hash esperado calculado independentemente, estabilidade
por ordem, alteração de conteúdo/contagens/metadados, JSON inválido, incompatibilidade,
campos proibidos, dados inválidos, duplicação, referências ausentes, empresas
incompatíveis, pacotes vazios e limites de tamanho/quantidade.
