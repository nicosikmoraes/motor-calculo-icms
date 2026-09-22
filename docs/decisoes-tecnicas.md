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

A DT-030 refinou esta decisão: no MVP, cada lote confirmado possui exatamente
uma empresa analisada e o reconhecimento por CNPJ é assistido pelo usuário.

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
memória, disco, CPU, XML excessivamente profundo e ZIP expansivo. O processamento
deve ser incremental e cancelável, sem carregar o lote inteiro na memória. O MVP
será testado com o volume de referência de 1.000 notas por lote, sem transformar
esse volume em bloqueio por quantidade.

Foram aprovados como limites iniciais de produção: 10 MB por XML, 500 MB por
arquivo ZIP, 2 GB de conteúdo total expandido por ZIP e taxa máxima de compressão
de 100:1. Cada ZIP aceita no máximo 10.000 entradas e profundidade de 20 segmentos
de caminho; cada XML aceita profundidade máxima de 100 elementos. A política de
temporários ainda precisa ser fechada na MD-04.

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

**Status:** solução técnica e limites de tamanho aprovados; demais controles
pendentes na MD-04.

O MVP usa `yauzl` 3.4.0 para ler o diretório central e verificar cada entrada de
forma sequencial, sem extrair no disco. Uma entrada com caminho inseguro,
criptografia, link simbólico, CRC divergente, tamanho individual ou taxa de
compressão excessiva é rejeitada isoladamente; as entradas seguras do mesmo ZIP
continuam elegíveis e o lote fica processado com pendências.

Falha estrutural que impeça enumerar o arquivo com segurança, ZIP acima de 500 MB,
mais de 10.000 entradas ou soma expandida superior a 2 GB rejeitam o ZIP inteiro.
Não se aproveita apenas o prefixo anterior ao limite, pois isso tornaria o
resultado dependente da ordem interna do arquivo.

Os limites não são fixados pela biblioteca nem escondidos no código. O chamador é
obrigado a fornecer tamanho do arquivo, quantidade de entradas, tamanho por
entrada, tamanho total expandido, taxa de compressão e profundidade de caminho.
Os limites iniciais aprovados são 500 MB para o ZIP, 10 MB por entrada XML, 2 GB
para a soma expandida, taxa de compressão de 100:1, 10.000 entradas e profundidade
máxima de 20 segmentos de caminho. XMLs aceitam no máximo 100 elementos aninhados.

O contrato completo está em [Segurança das entradas XML e ZIP](seguranca-entradas.md).

## DT-023 — Imutabilidade dos resultados históricos

**Status:** aprovado.

Uma execução de cálculo concluída é um registro histórico imutável. Alterações
posteriores em cadastros, dados complementados, regras fiscais ou versões do
motor não reescrevem o resultado existente.

Cada execução preserva a fotografia necessária para reproduzir e auditar o que
ocorreu: dados de entrada utilizados, origem dos dados, versão exata das regras,
versão do motor e memória de cálculo. Uma correção ou solicitação de recálculo
cria uma nova execução vinculada ao documento e ao lote correspondentes. A nova
execução pode ser a vigente para consultas e consolidações, mas mantém relação
explícita com a anterior e nunca a apaga ou sobrescreve.

Cadastros operacionais poderão ter edição ou inativação, porém referências
históricas apontam para versões ou snapshots estáveis. A política de retenção
poderá excluir o XML original conforme decisão específica, sem eliminar as
evidências mínimas da execução.

## DT-024 — Instância única e escrita centralizada

**Status:** aprovado.

Cada instalação executa apenas uma instância do aplicativo por vez. Uma segunda
tentativa de abertura direciona o usuário para a janela existente, em vez de
iniciar outro processo concorrente sobre o mesmo banco.

O processo principal do Electron é o único responsável por abrir o SQLite e
executar escritas. Workers podem analisar XMLs e calcular documentos em paralelo,
mas devolvem resultados ao processo principal. A persistência recebe esses
resultados por uma fila de gravação e aplica cada unidade consistente dentro de
uma transação.

A fila de gravação não obriga o processamento fiscal a ser sequencial: ela apenas
ordena as alterações no banco. Controle de concorrência, capacidade da fila,
pressão de retorno e granularidade das transações serão medidos antes de fixar os
limites de produção.

## DT-025 — Checkpoints e retomada de lote

**Status:** aprovado.

O lote é persistido antes do início do trabalho e cada documento concluído é
confirmado separadamente em uma transação. Erro isolado em uma nota não desfaz os
resultados já confirmados nem interrompe automaticamente as demais.

Se o processo for encerrado durante o trabalho, o lote em `PROCESSANDO` passa a
`INTERROMPIDO` na recuperação da aplicação. As execuções já concluídas são
preservadas e a retomada agenda somente as unidades que não possuem checkpoint
válido. A retomada nunca sobrescreve uma execução concluída.

Os estados de lote do MVP são `RECEBIDO`, `VALIDANDO`, `PROCESSANDO`,
`INTERROMPIDO`, `CANCELADO`, `CONCLUIDO`, `CONCLUIDO_COM_PENDENCIAS` e `FALHOU`.
`CANCELADO` representa uma interrupção solicitada pelo usuário e preserva a data
do último cancelamento; difere de `INTERROMPIDO`, usado para queda ou encerramento
inesperado. `FALHOU` é
reservado para falha do lote como um todo ou impossibilidade segura de continuar;
falhas isoladas permanecem associadas aos respectivos arquivos ou documentos.

O cancelamento passa a valer depois da unidade em execução, remove temporários,
preserva diagnósticos e checkpoints concluídos e impede que o resultado parcial
participe dos totais. A retomada é manual, conserva o mesmo lote e agenda somente
unidades sem checkpoint válido. A migration `0002` adiciona o estado sem alterar a
`0001` já publicada.

## DT-026 — Idempotência de processamento e recálculo

**Status:** aprovado.

Cada solicitação de processamento recebe um UUID estável. Retomadas e tentativas
automáticas conservam o mesmo identificador; uma ação explícita de recálculo cria
uma nova solicitação e, portanto, uma nova execução histórica.

O banco impede mais de uma execução para a mesma combinação de solicitação e
documento. Se uma mensagem ou resultado for entregue novamente, o processo de
persistência reconhece a execução já confirmada e não duplica documento,
resultado, memória ou totais. O checkpoint é gravado na mesma transação que a
execução completa e seus resultados.

Essa idempotência não deduplica ocorrências do lote: arquivos repetidos continuam
preservados e classificados conforme a DT-019. Ela impede somente que a mesma
unidade de trabalho seja confirmada duas vezes por reinício, repetição da fila ou
duplo acionamento acidental.

## DT-027 — SQLite e migrations versionadas

**Status:** aprovado.

O MVP usa o módulo `node:sqlite` fornecido pelo runtime fixado do Electron, sem
ORM. Todo acesso fica encapsulado no pacote `database`; domínio, casos de uso e
interface não importam o driver nem executam SQL diretamente.

O schema evolui por migrations SQL incrementais, imutáveis e versionadas no
repositório. Cada migration possui número sequencial, nome descritivo e checksum.
O banco mantém uma tabela de controle com versão, checksum, data de aplicação e
versão do aplicativo. Alterar uma migration já publicada é proibido; correções
exigem uma nova migration.

As migrations são aplicadas em ordem na inicialização, antes de liberar operações
do usuário. Cada migration deve ser atômica e transacional. Antes de migrar um
banco existente, o aplicativo cria e valida um backup recuperável. Falha de
migration interrompe a abertura operacional, preserva o banco anterior e oferece
restauração ou diagnóstico; o aplicativo não continua com schema parcial.

A evolução instalada é somente para frente. Não serão mantidas migrations `down`
automáticas sobre dados do usuário: rollback de versão usa backup validado e uma
versão compatível do aplicativo. Testes de integração devem cobrir banco vazio,
atualização de cada versão suportada, repetição idempotente e falha interrompida.

Como `node:sqlite` acompanha o Node embarcado, atualizar o Electron exige executar
a suíte de compatibilidade e migrations antes da publicação. A abstração do pacote
`database` preserva a possibilidade de trocar o driver se surgir bloqueio técnico.

## DT-028 — Inativação e exclusão controlada

**Status:** aprovado.

Cadastros referenciados por documentos, regras, cálculos ou auditoria não são
apagados pelo fluxo operacional. Empresa, perfil fiscal, produto de fornecedor e
outros cadastros utilizados recebem estado ativo/inativo e data de inativação.
Inativar impede novos usos, mas preserva consultas e referências históricas.

Regra publicada é imutável e nunca pode ser excluída; correção cria nova versão.
Um rascunho sem qualquer referência pode ser excluído. Lotes e execuções
concluídas não possuem exclusão no fluxo comum.

O expurgo do XML original segue a política de retenção e não remove dados
normalizados, resultados, versões aplicadas ou auditoria. Um futuro expurgo
definitivo de dados derivados exige caso de uso separado, confirmação explícita,
motivo, avaliação das dependências e evento de auditoria. Nenhum repositório pode
aplicar exclusão em cascata que apague silenciosamente evidência fiscal.

## DT-029 — Representação exata de valores, datas e identificadores

**Status:** aprovado.

Valores fiscais decimais são persistidos como texto canônico em base dez, com
ponto como separador e sem notação exponencial. SQLite `REAL` e ponto flutuante
binário não são usados para valores monetários, quantidades, alíquotas, bases ou
resultados fiscais. O formato e a escala são validados conforme o tipo do campo;
como referência inicial, dinheiro usa duas casas, alíquotas e quantidades admitem
até quatro e valor unitário admite até dez, respeitando o contrato oficial de cada
dado quando ele for mais restritivo.

O valor original extraído do XML é preservado quando necessário para evidência.
Operações aritméticas usam uma biblioteca decimal exata ainda sujeita à decisão
do contrato fiscal. Agregações fiscais não usam `SUM` sobre texto no SQLite: são
executadas pelo domínio com decimal exato e persistidas com sua memória de
cálculo. A conversão para célula numérica ocorre somente na geração do XLSX.

Identificadores internos são UUIDs armazenados como texto. Instantes internos são
normalizados para UTC em formato canônico. Datas fiscais preservam também a
representação original e o deslocamento informados no XML, porque a data local de
emissão pode afetar vigência e regras tributárias.

## DT-030 — Uma empresa analisada por lote no MVP

**Status:** aprovado para o MVP.

Cada lote confirmado pertence a exatamente uma empresa analisada. O usuário pode
selecioná-la antes da importação; caso não selecione, o sistema compara os CNPJs
de emitente e destinatário dos XMLs com os cadastros e propõe uma empresa para
confirmação. O processamento fiscal só começa depois que `empresaId` estiver
definida.

Quando houver mais de uma empresa candidata, a escolha não é automática. O
usuário deve indicar a perspectiva do lote. Documento que não envolva a empresa
confirmada recebe `EMPRESA_DIVERGENTE`, permanece visível para auditoria e não
participa do cálculo nem dos totais daquele lote.

Se emitente e destinatário forem empresas cadastradas, o documento é analisado
pela perspectiva da empresa do lote. Para analisar a outra perspectiva, o mesmo
XML pode integrar outro lote, preservando execução e histórico próprios.

Como evolução, um único envio poderá ser separado automaticamente em lotes ou
perspectivas por CNPJ. Essa automação exigirá fluxo explícito de confirmação e não
altera a regra do MVP de que cada consolidação e relatório pertencem a uma única
empresa.

## Fila de decisões

A fila detalhada e priorizada está em [Decisões pendentes](decisoes-pendentes.md).
Os próximos itens recomendados são definir os tipos normalizados de nota e item,
os limites técnicos de segurança e homologar uma massa anonimizada representativa.
