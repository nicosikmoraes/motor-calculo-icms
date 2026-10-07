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

Diretriz para novas funcionalidades da interface:

- usar **Vue Router** para navegação entre telas e rotas; não controlar a tela ativa por condições manuais em `App.vue`;
- usar **Pinia** para estado de interface compartilhado entre telas ou componentes e que precisa permanecer ao navegar;
- manter estado exclusivo de um componente no próprio componente; não criar uma store para cada campo local;
- manter regras fiscais, cálculos e persistência fora das stores e dos componentes Vue, acessando-os pelos contratos IPC.

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

No primeiro controle de pressão de retorno, há apenas uma inspeção ou importação
ativa por instalação. O leitor de XML/ZIP aguarda o estágio temporário da nota
normalizada antes de avançar para a próxima entrada; o conteúdo normalizado é
carregado uma nota por vez na transação final e o estágio é removido ao terminar
ou falhar. Assim, não há fila de notas normalizadas acumulada na memória. A meta
de vazão e o processamento paralelo continuam sujeitos às medições de MD-11.

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

Quando uma empresa é selecionada antes dos arquivos, CNPJs desconhecidos das
outras partes não provocam cadastro. Sem seleção prévia, uma única correspondência
cadastrada é proposta, múltiplas correspondências exigem escolha e nenhuma
correspondência exige que o usuário indique qual CNPJ representa a empresa
analisada antes de abrir seu cadastro assistido.

Quando houver mais de uma empresa candidata, a escolha não é automática. O
usuário deve indicar a perspectiva do lote. Documento que não envolva a empresa
confirmada recebe `EMPRESA_DIVERGENTE`, permanece visível para auditoria e não
participa do cálculo nem dos totais daquele lote.

Se o CNPJ escolhido não estiver cadastrado, a importação fica aguardando e o
sistema solicita que o usuário crie a empresa. O CNPJ pode ser pré-preenchido a
partir do XML, mas o cadastro nunca é criado automaticamente. O processamento só
continua depois da validação e confirmação explícita do cadastro.

Nesse fluxo, o cadastro mínimo exige CNPJ, razão social e UF; nome fantasia é
opcional. CNPJ, razão social e UF podem ser pré-preenchidos pelo XML, mas razão
social e UF devem permanecer revisáveis. O CNPJ identificado fica bloqueado para
evitar que o usuário cadastre outra empresa e associe indevidamente o lote.
Inscrição estadual, regime tributário, vigência e benefícios pertencem ao perfil
fiscal posterior e não bloqueiam esse cadastro inicial.

Se emitente e destinatário forem empresas cadastradas, o documento é analisado
pela perspectiva da empresa do lote. Para analisar a outra perspectiva, o mesmo
XML pode integrar outro lote, preservando execução e histórico próprios.

Como evolução, um único envio poderá ser separado automaticamente em lotes ou
perspectivas por CNPJ. Essa automação exigirá fluxo explícito de confirmação e não
altera a regra do MVP de que cada consolidação e relatório pertencem a uma única
empresa.

## DT-031 — Organização única por instalação no MVP

**Status:** aprovado e implementado.

No primeiro acesso, o usuário informa somente o nome do escritório ou responsável
e o aplicativo cria uma organização local. O nome pode ser alterado depois. Não
se exige CNPJ do escritório nesse onboarding e não se oferecem múltiplas
organizações na mesma instalação durante o MVP.

Toda empresa cadastrada pertence a essa organização. O processo principal do
Electron aplica a unicidade no caso de uso e expõe ao renderer somente contratos
IPC validados; o renderer não acessa o SQLite diretamente.

## DT-032 — Núcleo decimal e histórico das execuções

**Status:** decisão técnica implementada; contrato fiscal MD-05 permanece pendente.

`decimal.js` 10.6.0 foi escolhido como representação para aritmética decimal do motor.
Os valores entram como texto, sem conversão por `number`. O adaptador limita entradas
e resultados a 40 algarismos e usa 100 dígitos de precisão interna para as
operações de adição, subtração e multiplicação. Divisão, rateio e arredondamento
fiscal não foram habilitados: escala, modo, etapas e tolerância dependem de MD-05.

A migration `0008` cria execuções e memórias por item, vinculadas a documento e
lote. Solicitações repetidas com o mesmo identificador são idempotentes; um
recálculo explícito cria nova execução vinculada à anterior. Triggers impedem
alteração e exclusão dos resultados concluídos. O detalhe do lote exibe entradas
e valores declarados como pendentes enquanto não houver regra fiscal aprovada;
nenhum ICMS novo é calculado ou comparado nesta etapa.

## DT-033 — Casos de uso e auditoria local de cadastros

**Status:** decisões de produto aprovadas em 28–29/09/2026; casos de uso implementados.

Os casos de uso de organização, empresa, perfil fiscal e produto de fornecedor
são concluídos antes do schema de regras versionadas. Criar e editar, assim
como inativar e reativar empresa, perfil e produto, gera evento imutável de auditoria na mesma transação da
mudança. Falhas geram diagnóstico técnico, sem evento de alteração. Cada evento
inclui entidade, identificador, operação, horário UTC, campos efetivamente
alterados com valores anterior e novo, usuário do Windows e nome real do
computador. A interface exibe a origem como **Seu computador**; essa informação
não autentica a pessoa. CNPJ e dados de produtos podem constar na auditoria;
XMLs, arquivos e segredos não constam.

Qualquer pessoa com acesso à instalação pode operar os cadastros e consultar a
auditoria até que haja perfis. Edição baseada em revisão desatualizada é rejeitada.
A organização única pode ser renomeada, mas não inativada no MVP. O CNPJ da
empresa não é editável. Empresa inativa não recebe novos lotes. Perfil e produto
inativos não participam de novos vínculos nem da classificação cadastral atual;
a inativação não é propagada. Lotes e registros antigos seguem consultáveis.
Perfil usado pode ter nome e vigência editados com revisão e auditoria: a
classificação cadastral atual pode mudar, enquanto avaliações e execuções
históricas salvas não são reescritas. Reativação valida os cadastros relacionados.
Não há exclusão física pelos casos de uso.

A consulta permite filtrar por cadastro, período e operação. Cada evento é
retido por seis meses desde sua criação. A limpeza automática roda na abertura,
diariamente durante o uso e após restauração bem-sucedida, antes da consulta;
registra horário e quantidade removida. Falha de limpeza produz diagnóstico e
nova tentativa sem impedir uso. O schema de regras versionadas virá em migration
separada depois dos casos de uso. Ver [plano da Fase 2](plano-fase-2-casos-de-uso.md)
para sequência e critérios de conclusão. A política geral de proteção e backup
continua em MD-09/MD-10.

## DT-034 — Versões locais de regras fiscais

**Status:** ciclo de vida técnico aprovado em 29/09/2026; contratos tributários MD-05/MD-06 pendentes.

Qualquer usuário local pode criar e editar rascunhos, aprovar uma versão de seleção,
criar outra versão e revogar uma versão aprovada, sem perfil de acesso no MVP.
A auditoria registra usuário do sistema e computador, que identificam a sessão local
sem autenticar a pessoa. Aprovação exige fundamento legal, vigência válida e condições
estruturadas compatíveis com o nível; prioridade manual exige justificativa.

A migration `0013` separa família, versões, revogações e eventos imutáveis. Uma versão
aprovada não é editada nem excluída; a revogação é um registro próprio, preservando
seu conteúdo. Nova versão começa como rascunho. Os eventos são gravados na mesma
transação das mudanças. O catálogo local alimenta as novas avaliações dos lotes,
mas não produz cálculo fiscal: resultados tributários e homologação dependem de
MD-05/MD-06 e dos casos aprovados pelo contador.

## DT-035 — Substituição de versões nas avaliações

**Status:** aprovado em 29/09/2026; seleção cadastral implementada.

A versão aprovada mais nova de uma família substitui a anterior somente nas novas
avaliações dos itens. Enquanto a nova versão é rascunho, a última aprovada segue
selecionável. Revogar a versão mais nova não reativa uma versão antiga: é preciso
criar e aprovar uma nova versão. Importação e reavaliação usam uma fotografia do
catálogo local; avaliações e execuções já salvas permanecem imutáveis.

A seleção considera versão aprovada, vigência, condições, nível, especificidade
e prioridade conforme DT-006. O detalhe do lote guarda candidatas avaliadas,
versão, fundamento, condições e motivos de exclusão. Sobreposições potenciais
entre famílias do mesmo nível geram aviso; empates reais continuam pendentes,
sem desempate silencioso. Esta avaliação identifica a regra aplicável, mas não
calcula ICMS: resultados fiscais seguem dependentes de MD-05/MD-06.

## Fila de decisões

A fila detalhada e priorizada está em [Decisões pendentes](decisoes-pendentes.md).
Os próximos itens recomendados são definir os tipos normalizados de nota e item,
os limites técnicos de segurança e homologar uma massa anonimizada representativa.

## DT-036 — Ingestão estrutural de protocolos e eventos

**Status:** aprovado para este incremento técnico.

O parser reconhece `nfeProc` e `protNFe` 4.00, além de `procEventoNFe` e `evento`
1.00. Versões diferentes são recusadas. O limite comum de XML é 10 MB, com
profundidade máxima de 100 elementos; entradas em ZIP usam os limites de MD-04.
O XML é lido com proteção contra DTD e entidades externas. A validação XSD
específica desses artefatos fica para incremento próprio.

O protocolo embutido e os arquivos avulsos preservam chave, status, número de
protocolo e proveniência. Eventos preservam tipo, sequência, data, conteúdo
relevante e resultado do retorno, quando presente. A associação pela chave
ocorre após o inventário das notas do lote. Ausência de nota gera órfão; mais
de uma nota com a mesma chave ou conflito gera associação ambígua. Um protocolo
com chave divergente da nota ou um retorno de evento divergente gera diagnóstico.
O ambiente divergente do lote também gera diagnóstico.

Artefatos não alteram estado documental, cálculos ou totais nesta entrega.
Deduplicação, associação de órfãos entre lotes e precedência documental
continuam nas MD-02 e MD-07.

### Validação XSD offline de protocolos e eventos (incremento de DT036)

A inspeção e o salvamento do lote validam protNFe 4.00, protocolo embutido em nfeProc, evento 1.00 e procEventoNFe 1.00 com tipos oficiais embarcados. Cancelamento 110111 e carta de correção 110110 recebem validação adicional de detEvento. Outros tipos conservam o diagnóstico explícito de cobertura específica indisponível. Erros são persistidos por ocorrência e tornam a ocorrência pendente; não descartam o artefato reconhecido nem aplicam efeitos fiscais. Catálogo, fontes, hashes e adaptadores locais documentados em `packages/nfe-parser/schemas/artifacts/README.md`. A decisão sobre efeitos fiscais e cobertura adicional de eventos permanece pendente.

## DT-037 — Backup manual e agendamento diário

Aprovado pelo responsável em 04/10/2026: o primeiro backup deve ser manual;
apenas após sua conclusão validada fica habilitada a cópia automática diária.
O destino selecionado no diálogo nativo é reutilizado. O horário inicial é 23h
no relógio local do computador. Com o aplicativo fechado não há execução em
segundo plano: a próxima abertura recupera a última cópia diária vencida.
Suspensão é recuperada na primeira verificação após retomada; o relógio é
verificado a cada minuto. Falhas automáticas aguardam 15 minutos para nova tentativa.

Cada cópia é uma pasta única contendo snapshot SQLite validado por
`integrity_check` e manifesto versionado com SHA-256. A pasta parcial só recebe o
nome definitivo após concluir a cópia e o manifesto. O agendamento é persistido
por troca de arquivo temporário; falha na primeira cópia não o ativa. Cópias são
serializadas e o encerramento aguarda a cópia ativa antes de fechar o banco.

Inclui todos os dados persistidos no SQLite. XML/ZIP originais selecionados pelo
usuário, relatórios externos e estágio temporário de importação não são guardados
no pacote: o aplicativo atual não possui arquivo permanente desses originais.
A tela explicita esse alcance. Os backups não são criptografados e não são apagados
automaticamente neste incremento. A restauração pela interface e a política de
retenção das cópias continuam pendentes; não confundir esta entrega com recuperação
completa já homologada ou com intercâmbio `.icmspack`.

## DT-038 — Importação em worker e recuperação de lotes

Incremento autorizado pelo responsável em 04/10/2026 para desempenho e recuperação.
A confirmação de importação executa leitura, normalização, avaliação de regras e
persistência em um worker Node dedicado, com uma conexão SQLite de curta duração.
O processo principal conserva sua conexão para IPC e consultas da interface.
Uma única operação de inspeção/importação continua permitida por vez. A biblioteca
`xmllint-wasm` é dependência de runtime externa ao bundle para conservar seus
workers e recursos no aplicativo compilado. SQL reutilizado possui cache limitado
a 128 statements por conexão, mantendo parâmetros vinculados.

Antes de preparar documentos, a operação grava um manifesto em `import-recovery`
com identidade do lote, confirmação do ambiente, empresas e SHA-256 de cada fonte.
Cada entrada preparada possui checkpoint publicado por rename após seus snapshots
normalizados. Na retomada, todas as fontes são verificadas por hash; arquivos
alterados ou ausentes bloqueiam a operação sem apagar os checkpoints. XMLs já
preparados não são normalizados novamente; ZIPs são percorridos novamente para
manter sua política de segurança, reutilizando as entradas já preparadas.

Pausar conserva o estágio e retorna `INTERROMPIDO`; a importação pendente aparece
no Histórico. Fechar o aplicativo interrompe o worker e conserva os checkpoints.
O lote definitivo é criado uma única vez em transação; retomadas mantêm seu ID.
Após COMMIT, o worker libera o banco antes de avisar a conclusão. Um checkpoint
remanescente de uma queda entre COMMIT e limpeza é reconhecido pelo ID do lote
persistido e removido, sem nova importação. Cancelar continua preservando um lote
parcial cancelado e não é sinônimo de pausa. O estágio legado é expurgado; pontos
de recuperação novos não são removidos na abertura.

Inspeção inicial, consulta detalhada e reavaliação de regras ainda usam o processo
principal. Fontes precisam permanecer disponíveis no caminho original. O backup
SQLite da DT-037 não inclui os checkpoints de importações ainda não confirmadas.
Metas e homologação de Windows, massa real e volumes extremos permanecem em MD-11.


## DT-039 — Restauração validada e retenção de sete backups automáticos

Autorizado pelo responsável em 04/10/2026; retenção de sete cópias automáticas
confirmada expressamente. Cópias manuais e de segurança anteriores à restauração
são preservadas. Política ajustável de 1 a 365; zero desativa o expurgo. Salvar
não apaga imediatamente. A manutenção executa após backups e na verificação
periódica diária, com operações serializadas com a criação de cópias.

Novos manifestos v1 incluem `ownerId`; versões v1 anteriores continuam restauráveis,
mas não são apagadas automaticamente por falta de identidade de instalação.
O expurgo considera apenas pacotes automáticos próprios, com manifesto e snapshot
válidos, preservando a cópia mais recente. Pacotes manuais, corrompidos e alheios
não são removidos. Falha na limpeza não invalida um backup recém-concluído.

A restauração usa diálogo nativo e confirmação da data. Verifica SHA-256,
`integrity_check`, `foreign_key_check` e sequência/checksums das migrations.
Uma cópia temporária compatível é migrada antes de trocar o banco ativo; versão
futura ou histórico incompatível bloqueiam a restauração. Após validação e
confirmação, cria snapshot de segurança do estado atual e journal local, fecha
a conexão, troca arquivos e reinicia. Journal remanescente causa recuperação do
estado anterior na abertura, após verificar seu hash e integridade. Operações
que acessam o banco ficam bloqueadas durante restauração; lote ativo impede seu
início. A confirmação cancelada não troca dados.

O alcance continua sendo o SQLite; preferências, XML/ZIP externos, relatórios e
checkpoints pendentes não são restaurados. Retenção fiscal geral continua no
MD-09. A limpeza técnica remove fragmentos e snapshots órfãos acima de 24h,
parciais de backup próprios acima de 24h e checkpoints de lotes já confirmados,
sem expirar importações pendentes. Remoções são registradas em log JSONL limitado
a aproximadamente 1 MiB por arquivo, com uma rotação anterior. Homologação de
restauração e filesystem no Windows permanece pendente.

## DT-040 — Primeiro cálculo comum PR e diferimento parcial

Escopo e método aprovados pelo responsável em 04/10/2026, detalhados em
[escopo-fiscal-parana.md](escopo-fiscal-parana.md). A função isolada
`calculateParanaCommonIcms` calcula saídas comuns internas PR do regime normal
com alíquota nominal de 19,5%, desde 18/03/2024, e carga de 12% por diferimento
parcial quando satisfeitas suas condições. Entradas desconhecidas permanecem
pendentes; outros tratamentos ficam fora do escopo. O enquadramento é uma
entrada confirmada e não é deduzido do valor declarado ou de um CST isolado.

A base usa valores dos itens, sem novo acréscimo do próprio ICMS. IPI e desconto
não nulos exigem classificação expressa. Aritmética decimal e arredondamento
HALF_UP a duas casas preservam a reconciliação entre imposto original, devido
e diferido. A memória conserva também o imposto declarado. Não concede créditos
de compras nem calcula impostos ST/FCP por essa função. A interface de perguntas,
a persistência das respostas e a execução nos lotes estão descritas na DT-041;
rateio e consolidação continuam pendentes.

## DT-041 — Perguntas fiscais por item durante a análise do lote

Incremento autorizado em 04/10/2026. Após importar o lote, o aplicativo abre a
análise com as perguntas do primeiro item coberto e permite avançar para outros.
Campos do XML são somente leitura; a ponte aceita respostas enumeradas/booleanas,
valida lote/documento/item da organização atual e rejeita valores fiscais externos.
O indicador `indIEDest` passa a ser normalizado, sem deduzir regime do destinatário.

Respostas parciais geram pendências persistentes. Cada gravação cria uma execução
imutável no repositório de cálculos existente, com respostas, origem, data e
execução anterior. Preserva resultados dos demais itens e usa identificador de
solicitação para idempotência. O ID da execução esperado evita sobrescrever uma
tela concorrente. Não requer migration nova nem cadastro prévio de produto.

A regra comum é confirmada expressamente no fluxo, sem promover regras DRAFT.
Conflitos de destinação/consumidor final e IPI permanecem pendências; documentos
não elegíveis, cancelados/denegados associados, tributação específica ou totais
sem distribuição ficam bloqueados. Esse cálculo é conferência da operação,
sem apuração definitiva ou crédito automático. Respostas valem para o item atual;
reaproveitamento em notas futuras está descrito na DT-042; rateio e ampliação do
escopo ficam pendentes.

## DT-042 — Definições reutilizáveis por empresa, fornecedor e produto

Autorizado em 04/10/2026. O usuário escolhe entre só o item e próximas notas da
empresa para o produto daquele fornecedor. A migration 15 registra definições
imutáveis, com contexto fiscal, respostas, datas e execução de origem. A gravação
da definição e do cálculo é atômica; o ID esperado da definição evita sobrescrita
concorrente. Reutilização exige empresa ativa, CNPJ do emitente, código do produto
e respostas completas que permitam calcular o item de origem. Só o item continua
aceitando respostas parciais e não altera a definição futura.

Ao abrir a análise, uma chamada específica aplica as definições compatíveis e
persiste os cálculos antes da consulta. O contexto detalhado e as restrições de
datas estão em escopo-fiscal-parana.md. Mudanças voltam a pedir conferência;
valores/quantidades diferentes são recalculados com a nova nota. Não substitui
respostas manuais ou cálculos existentes. A memória mantém o ID da definição e
da execução de origem, e a aplicação repetida não duplica os resultados.

## DT-043 — Rateio e conferência por item

Autorizado em 04/10/2026 junto à criação e merge do PR deste conjunto. O motor
PR_COMMON_2 distribui saldo de frete, seguro, desconto e outras despesas entre
campos ausentes por valor do produto, preservando valores explícitos. Inteiros em
centavos, pesos decimais exatos e maiores restos (desempate numérico pelo item)
fecham o total. Inconsistências e composição ambígua de itens excluídos exigem
revisão; não distribui IPI divergente como despesa. Registra o rateio e sua origem
na memória sem alterar os dados originais do XML.

Novos cálculos guardam comparação de base e ICMS ao declarado. Tolerância de
R$ 0,01 inclusiva por componente/item; diferença assinada visível, sem alterar o
resultado ou compensar diferenças entre itens. Ausente, inválido, igualdade,
tolerância e divergência são distintos. Cálculos anteriores e sua versão ficam
preservados; definições de outra versão precisam de nova confirmação.

## DT-044 — Consolidação de conferência por empresa e mês

Autorizada em 04/10/2026. A tela do lote reúne exclusivamente as últimas memórias
salvas por documento, agrupando empresa, mês civil de emissão no XML, compras ou
vendas, ambiente e presença de protocolo de autorização associado. Não converte
a emissão para UTC nem mistura homologação e produção. É um resumo deste lote,
não uma apuração mensal que reúne todos os lotes, nem saldo a recolher.

Valores monetários são somados em decimal: base, ICMS calculado, declarado
nos itens elegíveis e diferimento conhecido. Declaração de itens sem cálculo
fica separada da comparação, feita apenas sobre pares calculado/declarado.
Diferença líquida e soma absoluta aparecem juntas, com contagem de divergências
e tolerância inclusiva de R$ 0,01 por item. Créditos de compras não são apurados.

Cancelamento/denegação já reconhecidos pelo fluxo, ocorrências inelegíveis,
chaves duplicadas elegíveis, empresa/orientação/ambiente/emissão não identificados
e eventos que exigem revisão ficam fora dos valores. Sem protocolo confirmado,
o subtotal aparece separado e provisório. Presença de protocolo não equivale a
verificação criptográfica. Pendentes, fora do escopo e excluídos permanecem
rastreáveis por nota, chave, item, execução e versão do motor. Ausência ou
invalidade de valores declarados e ausência de diferimento têm contadores
próprios; memórias antigas usam a etapa histórica de diferimento quando presente.
O snapshot do relatório conserva essa conferência sem recalcular as notas.

## DT-045 — Exportação XLSX da conferência do lote

Autorizada em 04/10/2026. O botão Exportar Excel na tela do lote exporta todas as
empresas e meses do lote, independentemente dos filtros visuais. O processo
principal consulta os dados da organização ativa e captura um snapshot antes
do seletor nativo, sem manter transação aberta durante a escolha do destino.
Importação em execução exige aguardar ou pausar. Não salva respostas fiscais,
não recalcula imposto e não cria execuções de cálculo.

Layout XLSX 1, biblioteca ExcelJS 4.4.0, quatro abas: Resumo, Itens, Divergências,
Pendências e exclusões. Preserva compras/vendas, produção/homologação e protocolos
em grupos separados. Resumo contém totais da DT-044, contagens e crédito não
apurado; comparação considera apenas os pares conhecidos. Divergências também
mostra diferenças dentro da tolerância, com situação e limite explícitos.
Pendências inclui motivos de exclusão, dados ausentes/inválidos, classificação,
enquadramento, artefatos, diagnósticos XML e ocorrências não totalizáveis.

Cabeçalhos e primeira coluna fixos, filtros, linhas alternadas e textos ajustados.
Chaves, números, séries, códigos, NCM, CFOP, IDs e emissão original são textuais.
Moeda com duas casas; só converte para número quando há no máximo 15 dígitos e
conversão de ida e volta preserva os centavos. Valores maiores ou inválidos ficam
textuais, ausentes ficam em branco. Não há fórmulas fiscais no arquivo; texto
externo nunca é interpretado como fórmula ou hyperlink. Cada aba identifica lote,
data de exportação, versão do aplicativo e layout, com aviso de conferência sem
crédito ou saldo a recolher. Abas vazias têm mensagem própria.

Somente destino .xlsx escolhido pelo usuário. Escrita em temporário exclusivo
na mesma pasta, sincronização e rename preservam o arquivo anterior em falhas;
limpa temporários. Cancelar ou fechar a janela não gera arquivo. O gerador recusa
textos e quantidades de linhas acima dos limites do Excel sem truncar dados.

A verificação do instalador identificou uma dependência transitiva ausente
(`concat-map`) ao carregar ExcelJS externamente. O gerador e suas dependências
JavaScript passaram a integrar os chunks compilados. A entrada distribuída
`report-generator.js` permite ao workflow gerar e inspecionar um XLSX usando o
executável Electron instalado, antes de verificar renderer e worker, sem importar
pacotes do checkout.


## DT-046 — Conferência mensal entre lotes

Autorizada em 06/10/2026. A tela Conferência mensal reúne os documentos
persistidos da organização ativa por empresa e mês civil de emissão. Inclui
empresas inativas para consulta histórica. Usa as últimas execuções salvas por
documento e mantém separados compras/vendas, produção/homologação e autorização
confirmada/subtotal provisório. Créditos e saldo a recolher continuam sem apuração.

Para mesma empresa, ambiente e chave, hashes diferentes excluem todas as
ocorrências, inclusive quando a outra ocorrência informa outro mês. Hashes
idênticos conservam a primeira ocorrência elegível por recebimento do lote, ID
do lote e ID do documento; as demais têm motivo de exclusão e referência à
origem canônica. Inelegibilidade prévia não é promovida. Bloqueios documentais
em outra cópia protegem a ocorrência canônica; inelegibilidade apenas por
repetição não invalida a original. Contadores de documentos representam
ocorrências importadas, incluindo cópias excluídas; somente elegíveis somam valores.

Eventos com mesma chave e ambiente em outros lotes geram revisão documental
e excluem os valores provisoriamente. Esta leitura não associa eventos órfãos,
modifica XMLs ou aplica automaticamente efeitos fiscais. Lotes com eventos
relacionados também aparecem como origem. Protocolos órfãos não são promovidos
a autorização. Documentos sem empresa ou mês válido continuam no histórico
dos lotes, pois não podem ser atribuídos ao filtro escolhido.

Consulta e preparação do XLSX usam transação curta na conexão ativa, recusando
importação em andamento. A consulta pode ser atualizada após novas importações
ou cálculos; o Excel captura um novo snapshot antes do diálogo de destino.
A escolha nativa e a escrita atômica da DT-045 são reaproveitadas. O relatório
mensal identifica empresa/mês, acrescenta origem nas linhas e a aba Lotes às
quatro abas da DT-045. Só inclui documentos e evidências atribuíveis ao recorte;
diagnósticos sem documento permanecem no lote. Não cria um lote no banco: o
identificador monthly:empresa:mês é exclusivo do snapshot interno do relatório.
Links na tela abrem e destacam o item no lote original.

## DT-047 — Revisão documental entre lotes

Incremento autorizado em 06/10/2026 após o merge das telas no PR #35. A tela
Revisão documental reúne eventos da organização atual, localiza notas por chave
e ambiente e registra confirmação de associação, conclusão de CC-e e reabertura.
Cada decisão exige justificativa e fica em registro imutável, com revisão,
data, usuário e computador. A migration 16 integra esses registros ao SQLite
e aos backups; a associação da importação original permanece intacta.

Confirmação exige retorno registrado consistente, protocolo, sequência e
ausência de erro estrutural XML/XSD. Novos retornos de evento também conferem
igualdade do ambiente entre solicitação e retorno. Eventos de chave/ambiente
sem nota, conteúdos diferentes da nota ou do mesmo evento e efeitos ainda não
cobertos continuam pendentes. Não promove protocolo órfão nem consulta a SEFAZ.

Cancelamento confirmado exclui os valores em todas as cópias de conteúdo
idêntico da nota e conserva as memórias. Bloqueios de cancelamento já reconhecidos
na ingestão permanecem. A CC-e de maior sequência exige confirmação do vínculo
de todos os eventos relacionados e revisão expressa do texto antes de autorizar
o uso do XML original na conferência. Nenhum texto altera campos fiscais.
Nova CC-e exige revisão nova; cancelamento, evento desconhecido, conflito ou
inconsistência continua impedindo os totais. Reabrir a CC-e mais recente preserva
a decisão anterior e recoloca a pendência. Demais restrições fiscais, documentais,
de vigência e deduplicação continuam aplicáveis.

Associação e revisão usam transação curta, snapshot dos documentos/eventos e
últimas decisões, com identificação idempotente da solicitação. Uma importação
ou decisão posterior invalida uma confirmação antiga. A ponte recusa campos
externos, nota de outra chave/ambiente/organização e chamadas de subframes.
Importação em andamento exige aguardar ou pausar.

Histórico e consolidações consultam a mesma evidência atual. Nenhuma execução
de cálculo é criada pela revisão, e snapshots de relatórios já capturados
permanecem intactos. O XLSX acrescenta a aba Eventos e revisões quando há eventos,
incluindo texto, protocolo, origem e decisões. Colunas de base e ICMS salvos
para auditoria mantêm visíveis as memórias mesmo em itens excluídos; não somam
esses valores ao resumo. Créditos e saldo a recolher permanecem sem apuração.
