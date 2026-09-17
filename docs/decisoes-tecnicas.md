# Decisões técnicas aprovadas

Registro cumulativo das decisões tomadas durante a descoberta.

## DT-001 — Aplicativo desktop

**Status:** aprovado.

O produto será um aplicativo instalado, inicialmente orientado ao Windows, e não um sistema acessado pelo navegador.

## DT-002 — Stack

**Status:** aprovado.

```text
Electron + Vue + TypeScript + Vite
Pinia para estado de interface
Vue Router para navegação
```

O motor fiscal não reside em componentes Vue. Renderer, preload, processo principal e workers possuem responsabilidades separadas.

## DT-003 — Persistência do MVP

**Status:** aprovado.

Cada máquina possui SQLite independente. Não existe servidor, banco na nuvem ou mensalidade de infraestrutura obrigatória no MVP.

Consequências aceitas:

- dados não são compartilhados em tempo real;
- cada instalação deve cuidar de seu backup;
- alterações simultâneas em máquinas diferentes podem gerar conflitos posteriores;
- não se abre um mesmo SQLite por compartilhamento de rede.

## DT-004 — Transferência entre máquinas

**Status:** aprovado.

Dados cadastrados são transferidos por pacote `.icmspack`, versionado, validado por hash e importado transacionalmente. O SQLite bruto não é usado para intercâmbio.

O pacote contém empresas, perfis, vínculos de produtos, regras, benefícios e parâmetros. Não contém XMLs, resultados, XLSX, logs ou credenciais.

## DT-005 — Regras fiscais estruturadas

**Status:** aprovado.

O contador combina campos, operadores e valores controlados. Não há execução de código ou fórmula arbitrária. Fórmulas existem no motor, são versionadas e recebem parâmetros validados.

## DT-006 — Precedência

**Status:** aprovado.

Níveis, do mais forte para o mais fraco:

1. exceção para produto e empresa;
2. regra específica da empresa;
3. regra por perfil fiscal;
4. regra por NCM e CEST;
5. regra por NCM;
6. regra padrão da operação.

Algoritmo:

```text
filtrar compatibilidade e vigência
→ escolher o nível mais alto
→ escolher a maior quantidade de condições específicas
→ escolher a maior prioridade manual
→ se persistir empate, gerar REGRA_AMBIGUA
```

O sistema registra a explicação da seleção. Prioridade manual é excepcional e deve ser justificada. Nenhum empate final é resolvido silenciosamente.

## DT-007 — Escopo organizacional e permissões do MVP

**Status:** aprovado.

O MVP atende inicialmente a um único escritório e não implementa distinção de permissões dentro do aplicativo. Todos os usuários com acesso à instalação podem executar todas as operações. Arquitetura multi-tenant e controle de papéis ficam fora do MVP.

## DT-008 — Identificação da empresa

**Status:** aprovado.

O sistema tenta identificar a empresa analisada pelos CNPJ presentes no XML. Quando não houver correspondência, solicita ao usuário que selecione uma empresa existente ou cadastre uma nova. O envio do lote não exige preenchimento de parâmetros fiscais por nota.

## DT-009 — Modelos fiscais

**Status:** aprovado.

O escopo contempla NF-e modelo 55 e NFC-e modelo 65, respeitando as diferenças de leiaute, finalidade, eventos e contingência de cada modelo.

## DT-010 — Autorização flexível com rastreabilidade

**Status:** aprovado.

Documento com protocolo consistente e `cStat=100` é autorizado. XML sem protocolo ainda é calculado, mas recebe `NAO_VERIFICADA` e aviso claro. Documentos de homologação são separados de produção e protocolos inconsistentes geram erro.

A participação de `NAO_VERIFICADA` no total definitivo continua pendente de decisão.

## DT-011 — Cancelamentos

**Status:** aprovado.

Cancelamento normal e cancelamento por substituição são calculados para auditoria, permanecem visíveis no XLSX e não compõem os totais definitivos. No cancelamento por substituição, a chave substituta é vinculada à original.

## DT-012 — CC-e

**Status:** provisoriamente aprovado para o MVP.

A última CC-e autorizada é associada à nota, mas seu texto não altera campos automaticamente. A nota é calculada pelo XML original, fica pendente de revisão e fora dos totais até aprovação do contador.

## DT-013 — Documentos sem autorização válida

**Status:** aprovado.

Rejeição e denegação explícitas permitem apenas cálculo diagnóstico quando houver dados suficientes e nunca compõem os totais. Inutilização é registrada como evento, sem cálculo. Conflito entre nota e intervalo inutilizado é impeditivo.

## DT-014 — Finalidades complementar e devolução

**Status:** aprovado.

NF-e complementar calcula e adiciona apenas seus próprios valores, mantendo referência à original. Devolução é calculada com valores positivos na memória e tem efeito sinalizado na consolidação conforme a regra fiscal e a posição da empresa.

## DT-015 — Manifestação do destinatário

**Status:** aprovado.

Confirmação permite processamento normal. Ciência e ausência de manifestação geram avisos não impeditivos. Operação não realizada e desconhecimento excluem a nota quando a empresa é destinatária; quando é emitente, geram pendência de regularização. Todo o histórico é preservado.

## DT-016 — Contingência

**Status:** aprovado.

Autorizações com `cStat=100`, `cStat=150` ou protocolo válido de SVC são definitivas. EPEC sem autorização posterior e NFC-e offline sem protocolo posterior são calculados como `CONTINGENCIA_PENDENTE`, aparecem em subtotal provisório e ficam fora do total definitivo.

## DT-017 — Retenção dos XMLs

**Status:** aprovado em princípio.

O período padrão de retenção local do XML original é de um mês e deve ser configurável. Depois do prazo, o aplicativo executará a exclusão conforme política auditável. Ainda precisam ser definidos limites de configuração, avisos, carência, segurança da exclusão e quais evidências normalizadas permanecem.

## DT-018 — Versões de NF-e e NFC-e suportadas

**Status:** aprovado.

O MVP interpreta, valida e calcula NF-e modelo 55 e NFC-e modelo 65 com
`versao="4.00"`.

Documentos em leiautes anteriores não são classificados automaticamente como XML
inválido. Quando for possível identificá-los com segurança, o sistema registra
arquivo, tipo, chave e versão disponíveis, atribui `VERSAO_NAO_SUPORTADA` e não
executa o cálculo fiscal.

O suporte ao leiaute 4.00 é versionado pela revisão dos schemas embarcados no
aplicativo. Uma nova Nota Técnica ou pacote de schemas não passa a ser suportado
silenciosamente: exige atualização, testes de regressão e registro da revisão
utilizada no processamento.

Versões de protocolos e eventos, como cancelamento, CC-e e manifestação do
destinatário, serão definidas separadamente por tipo de artefato. A inclusão de
leiautes anteriores de NF-e/NFC-e dependerá de demanda comprovada, exemplos
anonimizados e casos de teste homologados.

## DT-019 — Tolerância de ingestão e ocorrências repetidas

**Status:** aprovado.

### Validação e cálculo parcial

- Incompatibilidades de schema que não impeçam a leitura segura dos dados
  necessários são registradas como aviso e não bloqueiam o cálculo disponível.
- O MVP não valida a assinatura digital do XML. Todo documento processado deve
  informar `ASSINATURA_NAO_VERIFICADA`; isso não significa que a assinatura seja
  válida ou inválida.
- O sistema calcula todos os componentes para os quais existam dados suficientes.
- Quando faltarem dados necessários, a nota recebe a pendência
  `INFORMACOES_FALTANTES`, fica
  visível em uma página de pendências e aparece no XLSX com o aviso
  `Informações faltando`.
- Conforme RN-003, nota com item pendente não recebe total definitivo.
- O usuário pode complementar dados permitidos e solicitar novo cálculo. O XML
  original nunca é alterado; os dados informados, sua origem e o reprocessamento
  ficam registrados para auditoria.
- A lista de campos que podem ser complementados manualmente e as validações de
  cada campo ainda precisa ser aprovada.

### Escopo inicial dos artefatos

A primeira entrega do parser processa documentos NF-e modelo 55 e NFC-e modelo
65. Protocolos e eventos ficam para incremento posterior, necessário para cumprir
as decisões de ciclo documental já aprovadas. Um artefato ainda não suportado é
registrado como ocorrência ignorada pelo cálculo, e não pode alterar o estado ou
os totais da nota nessa etapa.

### Repetições

- Mesma chave e mesmo hash no mesmo lote: as duas ocorrências são processadas e
  calculadas; a partir da segunda, recebem o status `REPETIDA`. Somente a primeira
  ocorrência pode participar dos totais, desde que não possua outra pendência. As
  demais mantêm cálculo diagnóstico e nunca duplicam o total do lote.
- Mesma chave com hashes diferentes: cada ocorrência é processada e calculada, e
  ambas recebem alerta de que representam a mesma nota fiscal com conteúdos
  diferentes. Nenhuma participa dos totais enquanto o conflito não for resolvido.
  A resolução seleciona a ocorrência válida, exige justificativa, fica registrada
  na auditoria e gera nova consolidação.
- Repetição entre lotes: cada envio cria uma nova ocorrência e uma nova execução
  de cálculo vinculada ao respectivo lote. O resultado do lote mais recente não
  sobrescreve o anterior.
- Evento órfão não participa do processamento inicial. Quando o suporte a eventos
  for implementado, sua retenção e associação posterior deverão ser decididas.

### Identidade do lote

Cada envio confirmado — pasta, conjunto de arquivos ou ZIP — cria um lote. O lote
recebe identificador UUID estável e `recebidoEm`. A data e hora representam o
momento do envio, mas não são usadas sozinhas como chave técnica, pois dois lotes
podem ser criados no mesmo instante e horários podem sofrer ajustes.

### Limites de entrada

Não haverá limite comercial de quantidade de notas por plano ou licença no MVP.
Limites técnicos de segurança continuam obrigatórios para impedir exaustão de
memória, disco, CPU, XML excessivamente profundo e ZIP expansivo. Os valores serão
definidos por teste de carga e poderão resultar em processamento por partes, sem
reduzir arbitrariamente a quantidade de notas aceita pelo produto.

## DT-020 — Bibliotecas de parsing e validação XML

**Status:** aprovado.

O MVP utiliza:

- `fast-xml-parser` para leitura e extração dos dados do XML;
- `xmllint-wasm` para validação contra os schemas XSD oficiais em worker local.

Os schemas e suas dependências são embarcados no aplicativo, com versões
registradas. A validação não realiza acesso de rede. `DOCTYPE` e entidades externas
são recusados antes do parsing. Identificadores e valores fiscais permanecem como
texto até a normalização explícita do domínio.

As versões `fast-xml-parser` 5.11.1 e `xmllint-wasm` 5.3.0 estão fixadas no
lockfile. A prova de conceito validou o carregamento offline dos `include`/`import`,
a execução do WASM no runtime Electron 38.8.6 e o comportamento básico de erros,
conforme [Prova de conceito do parser XML](prova-conceito-parser-xml.md).
Empacotamento no instalador Windows, massa representativa e consumo de memória em
lotes continuam como critérios de homologação. Bloqueio técnico comprovado exige
nova decisão registrada, não substituição silenciosa.

## DT-021 — Severidades da ingestão XML

**Status:** aprovado e implementado.

Cada ocorrência recebe código estável, severidade e decisão de processamento. As
severidades são `AVISO`, `INFORMACAO_FALTANTE` e `ERRO_IMPEDITIVO`; as decisões
correspondentes são `PROCESSAR`, `PROCESSAR_PARCIALMENTE` e `REJEITAR`. Em um
conjunto de diagnósticos prevalece a decisão mais restritiva.

XML inseguro, malformado, de raiz desconhecida, leiaute diferente de 4.00 ou
modelo diferente de 55/65 é impeditivo. Campo obrigatório ausente ou valor
inválido segundo o XSD gera informação faltante. Outras incompatibilidades XSD
geram aviso enquanto a extração segura permanecer possível. A normalização fiscal
pode elevar um aviso a pendência ao constatar que o dado é necessário ao cálculo.

O catálogo completo está em
[Catálogo de severidades da ingestão](catalogo-severidades-ingestao.md).

## DT-022 — Inspeção segura de arquivos ZIP

**Status:** solução técnica aprovada; limites de produção pendentes na MD-04.

O MVP usa `yauzl` 3.4.0 para ler o diretório central e verificar cada entrada de
forma sequencial, sem extrair no disco. Caminhos inseguros, criptografia, links
simbólicos, corrupção e violações da política de expansão são impeditivos.

Os limites não são fixados pela biblioteca nem escondidos no código. O chamador é
obrigado a fornecer tamanho do arquivo, quantidade de entradas, tamanho por
entrada, tamanho total expandido, taxa de compressão e profundidade de caminho.
Os valores de produção serão registrados quando a MD-04 for aprovada.

O contrato completo está em [Segurança das entradas XML e ZIP](seguranca-entradas.md).

## Fila de decisões

A fila detalhada e priorizada está em [Decisões pendentes](decisoes-pendentes.md).
Os próximos itens recomendados são definir os tipos normalizados de nota e item,
os limites técnicos de segurança e homologar uma massa anonimizada representativa.
