# Regras de negócio

## 1. Escopo funcional

O sistema recebe múltiplos XML de NF-e, recalcula a tributação esperada por item e entrega um XLSX consolidado por nota. O primeiro escopo contempla:

- ICMS próprio;
- redução de base;
- isenção, não incidência, diferimento e desoneração quando parametrizados;
- ICMS-ST por MVA, pauta, PMPF ou preço máximo quando parametrizado;
- DIFAL;
- FCP e FCP-ST;
- comparação entre valores declarados e calculados.

O cálculo de crédito aproveitável é uma dimensão distinta do imposto devido na nota. Caso seja incorporado, deverá considerar empresa destinatária, finalidade da aquisição e restrições específicas.

## 2. Entradas do lote

O usuário envia uma pasta, vários arquivos XML ou um ZIP. O sistema deve:

- interpretar, validar e calcular NF-e modelo 55 e NFC-e modelo 65 no leiaute 4.00;
- registrar leiaute anterior identificável como `VERSAO_NAO_SUPORTADA`, sem tratá-lo automaticamente como XML inválido e sem executar cálculo fiscal;
- identificar a nota pela chave de acesso, não pelo nome do arquivo;
- detectar arquivos repetidos;
- validar estrutura, protocolo e situação disponíveis no documento;
- não interromper o lote quando um arquivo falhar;
- registrar cada falha com arquivo, etapa e mensagem compreensível.

Incompatibilidade de schema que não impeça a extração segura dos dados necessários
gera aviso. O MVP não valida assinatura digital e identifica essa condição como
`ASSINATURA_NAO_VERIFICADA`. Ausência de dados necessários gera a pendência
`INFORMACOES_FALTANTES`, sem impedir o cálculo dos demais componentes possíveis.

PDF e DANFE não são fonte suficiente para o cálculo e devem ser recusados ou marcados como formato não suportado.

## 3. Fonte dos dados

### 3.1 Dados transacionais extraídos do XML

- chave, número, série e data de emissão;
- emitente, destinatário e respectivas UFs;
- regime declarado do emitente;
- indicadores de destino, consumidor final e contribuinte;
- CFOP, NCM, CEST, origem, CST ou CSOSN declarados;
- quantidade, unidade, valor unitário e valor do produto;
- frete, seguro, desconto, outras despesas e IPI;
- bases, alíquotas e valores tributários declarados.

### 3.2 Dados mestres e regras mantidos no sistema

- empresas, inscrições, regimes e benefícios próprios;
- perfis fiscais e vínculos de produtos de fornecedores;
- finalidade padrão: revenda, industrialização, ativo ou uso/consumo;
- alíquotas internas e interestaduais;
- composição e redução de base;
- ST, MVA, pauta, PMPF e preço máximo;
- DIFAL e FCP;
- isenções, não incidências, diferimentos, desonerações e benefícios;
- CST/CSOSN esperado;
- vigência, prioridade e fundamento legal.

## 4. Unidade de cálculo

RN-001 — Cada item da NF-e é calculado individualmente.

RN-002 — O resultado da nota é a soma dos resultados válidos de seus itens.

RN-003 — Uma nota com pelo menos um item pendente não pode receber resultado definitivo.

RN-004 — Totais parciais podem ser exibidos, desde que identificados explicitamente como parciais.

RN-005 — ICMS próprio, ICMS-ST, DIFAL, FCP e FCP-ST devem permanecer separados. Um total geral pode existir apenas como coluna adicional claramente nomeada.

## 5. Localização da regra

Para cada item, o sistema monta um contexto com:

```text
data da emissão
empresa analisada
UF de origem e destino
regime tributário
tipo de operação e CFOP
NCM e CEST
perfil fiscal
origem da mercadoria
contribuinte ou não contribuinte
consumidor final
finalidade
```

RN-006 — Somente regras aprovadas e vigentes na data da emissão podem ser utilizadas.

RN-007 — A ordem padrão de níveis é:

1. exceção para produto e empresa;
2. regra específica da empresa;
3. regra por perfil fiscal;
4. regra por NCM e CEST;
5. regra por NCM;
6. regra geral da operação.

RN-008 — Antes da ordenação, são eliminadas regras incompatíveis com data de emissão, UFs, operação/CFOP, regime, destinatário, consumidor final, finalidade, origem, NCM, CEST, perfil ou produto. Um campo vazio em uma condição significa “qualquer valor”.

RN-009 — A seleção utiliza, nesta ordem: nível, quantidade de condições específicas e prioridade manual.

RN-010 — Dentro do mesmo nível, vence a regra que possuir mais condições específicas preenchidas e compatíveis com o contexto.

RN-011 — Persistindo mais de uma candidata, vence a maior prioridade numérica cadastrada pelo contador. A prioridade é excepcional e deve ter justificativa.

RN-012 — Persistindo empate de nível, especificidade e prioridade, o item recebe `REGRA_AMBIGUA` e não é calculado.

RN-013 — A regra aplicada deve ser registrada com identificador, versão, nível, especificidade, prioridade e fundamento.

RN-014 — Alterar uma regra cria nova versão; não altera cálculos históricos.

## 6. Produtos novos

RN-015 — O sistema tenta reconhecer o produto pela combinação `CNPJ do fornecedor + código do produto do fornecedor`.

RN-016 — Sem vínculo, o sistema tenta localizar perfil fiscal por NCM, CEST, origem e categoria.

RN-017 — Um vínculo automático só é permitido quando houver uma única correspondência aprovada.

RN-018 — NCM e CEST do XML são declarações do emissor. Divergência com cadastro validado gera pendência ou alerta conforme política da empresa.

RN-019 — Depois da validação do contador, o vínculo deve ser reutilizado em notas futuras.

## 7. Composição de base e cálculo

A regra define a composição da base, incluindo ou excluindo frete, seguro, outras despesas, desconto e IPI. O modelo conceitual do ICMS próprio é:

```text
baseInicial =
    valorProduto
  + freteRateado
  + seguroRateado
  + outrasDespesasRateadas
  + ipiQuandoAplicavel
  - descontoAplicavel

baseICMS = baseInicial × (1 - percentualReducao)
icmsCalculado = baseICMS × aliquotaAplicavel
```

RN-020 — O motor deve suportar cálculo por dentro quando a regra exigir.

RN-021 — Valores compartilhados no total da nota devem ser rateados por método configurado e registrado na memória de cálculo.

RN-022 — Arredondamento é feito por item conforme a regra configurada. A soma por nota utiliza os valores já arredondados dos itens.

RN-023 — Fórmulas de ST, DIFAL e FCP são módulos separados e aplicados apenas quando a regra correspondente for encontrada.

RN-024 — O valor declarado jamais substitui um parâmetro ausente da regra calculada.

## 8. Comparação

Para cada componente:

```text
diferenca = valorCalculado - valorDeclarado
```

RN-025 — A tolerância monetária deve ser configurável por componente tributário.

RN-026 — Dentro da tolerância, o componente é considerado aderente; fora dela, divergente.

RN-027 — A comparação deve conservar base, alíquota, imposto, regra e fórmula utilizados.

## 9. Estados

### Item

- `CALCULADO_ADERENTE`
- `CALCULADO_DIVERGENTE`
- `REGRA_NAO_ENCONTRADA`
- `REGRA_AMBIGUA`
- `PRODUTO_NAO_CLASSIFICADO`
- `DADOS_INSUFICIENTES`
- `DIVERGENCIA_CADASTRAL`
- `ERRO_CALCULO`

### Nota

- `CALCULADA_ADERENTE`: todos os itens calculados e aderentes;
- `CALCULADA_DIVERGENTE`: todos calculados e algum divergente;
- `PENDENTE`: algum item sem conclusão;
- `ERRO`: documento inválido ou falha impeditiva;
- `REPETIDA`: mesma chave e mesmo conteúdo já presentes no lote, conforme a
  política de ocorrências.

Ocorrências com mesma chave e mesmo hash são calculadas e, a partir da segunda no
mesmo lote, recebem `REPETIDA`. Ocorrências com a mesma chave e hashes diferentes
são calculadas separadamente e recebem alerta de conteúdo conflitante. Somente a
primeira ocorrência idêntica elegível participa dos totais; as repetições mantêm
cálculo diagnóstico. No conflito de conteúdo, nenhuma ocorrência participa dos
totais até que o usuário selecione a válida com justificativa auditada.

Estados documentais e de eventos coexistem com o estado do cálculo. Entre eles estão `NAO_VERIFICADA`, `CANCELADA`, `PENDENTE_REVISAO_CCE`, `REJEITADA`, `USO_DENEGADO`, `CONTINGENCIA_PENDENTE`, `OPERACAO_CONFIRMADA`, `OPERACAO_NAO_REALIZADA` e `OPERACAO_DESCONHECIDA`.

RN-032 — O sistema deve armazenar separadamente situação documental, situação do cálculo, caráter do resultado e participação nos totais.

RN-033 — Um documento pode possuir cálculo diagnóstico mesmo com `incluidaNoTotal=NAO`.

RN-034 — A situação completa de protocolos, cancelamentos, finalidades especiais, manifestações e contingência segue [Ciclo de vida do documento fiscal](ciclo-de-vida-documento-fiscal.md).

RN-035 — O usuário pode complementar somente campos autorizados pela política de
entrada. O valor informado não altera o XML original, registra sua origem e cria
nova execução ao reprocessar a nota.

### Lote

- `RECEBIDO`, `VALIDANDO`, `PROCESSANDO`, `INTERROMPIDO`, `CONCLUIDO`,
  `CONCLUIDO_COM_PENDENCIAS` ou `FALHOU`.

## 10. Planilha de saída

Como desenho inicial, o XLSX deve conter as seguintes áreas de informação. A divisão e os nomes definitivos das abas ainda serão aprovados:

### `Resumo_Notas`

Número, série, chave, emissão, emitente, destinatário, UFs, quantidade de itens, valores declarados e calculados por componente, diferenças e status.

### `Detalhamento_Itens`

Nota, item, produto, NCM, CEST, CFOP, CST/CSOSN, bases, alíquotas, valores declarados/calculados, diferença, regra aplicada e status.

### `Pendencias`

Nota, item, código, descrição, tipo da pendência, dados ausentes/conflitantes e ação recomendada.

### `Regras_Aplicadas`

Identificador, versão, nome, vigência e fundamento das regras utilizadas.

### `Erros_XML`

Arquivo, chave quando disponível, etapa, código do erro e mensagem.

O contrato definitivo ainda será aprovado. A versão final deverá distinguir valores definitivos, provisórios, diagnósticos e excluídos e deverá comportar os eventos fiscais documentados.

## 11. Auditoria e segurança

- Registrar datas, versão e instalação de origem de cada regra.
- No MVP, todos os usuários podem cadastrar, revisar e publicar regras.
- Guardar o snapshot/versão das regras aplicadas.
- Registrar reprocessamentos e a instalação que os solicitou.
- Não sobrescrever resultados históricos silenciosamente.
- Proteger XML, CNPJ e dados comerciais conforme política de retenção e acesso da organização.

## 12. Regras estruturadas

RN-028 — O MVP utiliza regras estruturadas, compostas por condições e resultados tipados. Não haverá editor livre de código ou fórmulas arbitrárias.

RN-029 — Campos, operadores e valores possíveis serão controlados pela aplicação e validados antes da aprovação da regra.

RN-030 — Fórmulas fiscais serão implementadas e versionadas no motor. A regra escolhe fórmula e parâmetros autorizados, mas não executa código fornecido pelo usuário.

RN-031 — O sistema deve detectar sobreposição potencial no momento do cadastro ou importação e informar quais regras entram em conflito.

RN-036 — Uma execução de cálculo concluída é imutável. Correções e recálculos
criam nova execução, preservando os dados utilizados, as versões das regras e do
motor, a memória de cálculo e a relação com a execução anterior.

RN-037 — Cada documento concluído gera um checkpoint transacional. Após uma
interrupção, o lote preserva o trabalho confirmado e retoma somente unidades sem
checkpoint válido, sem duplicar ou sobrescrever execuções.

RN-038 — Retomadas e tentativas automáticas mantêm o identificador da solicitação
original e são idempotentes por documento. Um recálculo solicitado pelo usuário
recebe novo identificador e cria nova execução histórica.

RN-039 — Cadastros já utilizados são inativados em vez de excluídos. Regras
publicadas, lotes e execuções concluídas não podem ser apagados pelo fluxo
operacional, e nenhuma exclusão em cascata pode remover evidência fiscal.

RN-040 — Valores fiscais são persistidos em representação decimal exata e nunca
em ponto flutuante binário. Datas fiscais preservam o valor e o deslocamento do
XML além do instante normalizado usado internamente.

RN-041 — Cada lote confirmado possui exatamente uma empresa analisada. Documento
que não envolva essa empresa recebe `EMPRESA_DIVERGENTE`, permanece auditável e
não participa do cálculo ou dos totais do lote.
