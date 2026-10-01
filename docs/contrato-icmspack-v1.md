# Contrato técnico inicial de `.icmspack` — versão 1

Estado: codec em `@motor/interchange`, exportação e importação conectadas à tela
**Exportar e importar**, com prévia de conflitos e escrita transacional no SQLite,
conforme DT-004. O banco de destino deve ter uma organização configurada.

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
a atribuição é feita à organização já configurada no destino, sem restauração
de histórico ou revisões de origem.

## Cadastros do primeiro recorte

- Empresas: UUID, razão social, nome fantasia opcional, CNPJ canônico, UF e estado ativo.
- Perfis: UUID, empresa, nome, vigência e estado ativo.
- Produtos de fornecedor: UUID, empresa, CNPJ do fornecedor, código textual,
  perfil e estado ativo.
- Regras locais na última versão final aprovada para seleção: UUID, família, versão, estado `APPROVED`,
  nome, nível, prioridade e justificativa quando necessária, vigência,
  fundamento e condições de igualdade exata. Rascunhos e revogações são recusados.

UUIDs são textuais em minúsculas. A validação usa os contratos cadastrais atuais,
com CNPJ válido, UF reconhecida, datas reais, intervalos válidos e referências
fechadas dentro do pacote. Duplicações de ID por coleção, CNPJ de empresa,
identidade do vínculo de produto e família/versão de regra são recusadas. Produtos
e perfis devem pertencer à mesma empresa; condições de regra devem apontar para
cadastros presentes e coerentes entre si. A prévia da importação apresenta colisões com a instalação de destino.

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
antes de qualquer uso dos cadastros; o pacote é revalidado na confirmação. A combinação de referências resultante
das escolhas também é validada antes das escritas, dentro da transação.

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

## Fluxo da interface e conflitos

A tela **Exportar e importar** usa os seletores nativos do Electron. O renderer
não fornece caminhos arbitrários: exportação recebe o destino do diálogo Salvar;
importação lê somente o arquivo escolhido em Abrir. O arquivo salvo deve ter
extensão `.icmspack`. A escrita usa temporário exclusivo na mesma pasta, sync e
rename; não trunca o destino antes de produzir um pacote válido. A leitura tem
limite durante todo o percurso e exige UTF-8 válido.

A exportação registra o snapshot consistente dos cadastros. Uma família cujo
último estado final é revogado não exporta uma aprovação anterior. Rascunhos
mais novos não deslocam a última versão final aprovada.

A prévia apresenta novidades, registros iguais, conflitos e colisões bloqueantes,
com comparação dos campos. Há filtro por estado e páginas de 30 registros. Em
conflitos mutáveis, cada escolha é **Manter cadastro local** ou **Usar valores do
pacote**; a interface inicia com manter local e só grava após **Confirmar
importação**. Registros novos são incluídos, registros iguais são ignorados.

Empresas são reconciliadas por CNPJ. Produtos são reconciliados por empresa,
CNPJ do fornecedor e código do produto. IDs de referências são remapeados quando
a identidade natural corresponde a um cadastro local. Perfis usam seu UUID.
Colisões de UUID com identidades incompatíveis são bloqueadas: exigem correção
na origem, sem substituição silenciosa. Regras existentes que coincidam por ID
ou família/versão são preservadas quando diferem; não é possível substituir uma
regra publicada, revogada ou um rascunho já local. Novas versões são incluídas sem
reescrever as anteriores e podem participar das próximas avaliações.

O pacote lido é retido no processo principal em uma sessão opaca, vinculada à
janela principal que pediu a prévia, válida por 15 minutos. Selecionar nova prévia
substitui a anterior; cancelar, concluir ou fechar a janela limpa a sessão. A
confirmação usa exatamente o conteúdo exibido, mesmo se o arquivo de origem
mudar depois. Tokens de outra janela, expirados ou já consumidos são recusados.

Um fingerprint dos cadastros e revisões locais é conferido dentro da transação
na confirmação. Se algum cadastro mudou após a prévia, a operação pede nova
seleção e revisão, sem gravação. As escolhas efetivas também não podem criar
vínculos incoerentes entre empresa, perfil, produto e condições da regra.

Todos os cadastros e seus eventos de auditoria são gravados em uma única transação.
Falha em qualquer escrita ou auditoria desfaz o conjunto, incluindo famílias de
regras criadas na operação. Auditorias recebem o hash do pacote e snapshots de
antes/depois; as revisões e datas registradas são locais. Reimportação idêntica
não duplica cadastros nem eventos. O histórico de lotes, avaliações e cálculos
não é reescrito. A transferência não restaura uma instalação ou substitui backup.
