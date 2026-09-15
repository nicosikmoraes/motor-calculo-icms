# Ciclo de vida do documento fiscal

Este documento consolida as decisões aprovadas para protocolo, ambiente, finalidade da NF-e e eventos. O processamento deve primeiro interpretar todos os arquivos do lote e somente depois relacionar notas, protocolos e eventos pela chave de acesso. A ordem dos arquivos na pasta não possui significado.

## 1. Princípios gerais

- O cálculo pode ser executado para diagnóstico mesmo quando o documento não compõe o total definitivo.
- `calculada` e `incluidaNoTotal` são informações diferentes.
- O XLSX deve manter visíveis documentos excluídos, o motivo da exclusão e a memória de cálculo disponível.
- Nenhum evento altera ou reescreve o XML original.
- Todos os eventos e mudanças de estado permanecem no histórico.
- Arquivos de homologação não podem ser misturados aos de produção no mesmo lote.
- O sistema local não presume ter consultado a situação atual na SEFAZ. Ele declara quais evidências foram encontradas nos arquivos recebidos ou no banco local.

## 2. Autorização e protocolo

### 2.1 Autorizada

Um `nfeProc` com protocolo consistente e `cStat=100` é tratado como documento autorizado. A nota é calculada e pode integrar o total definitivo quando não houver outra pendência.

O sistema valida, no mínimo, a correspondência entre a chave do documento e a chave do protocolo, o ambiente e o resultado da autorização. Inconsistência impeditiva produz erro e exclui o documento dos totais.

### 2.2 XML sem protocolo

Um arquivo que contém apenas a `NFe`, sem protocolo de autorização, ainda é calculado, mas recebe `NAO_VERIFICADA`. O XLSX deve apresentar aviso claro de que a autorização não foi comprovada pelos arquivos importados.

A decisão sobre sua participação no total definitivo será refinada junto da precedência geral de estados. Quando houver indicação explícita de contingência pendente, aplica-se a seção 9.

### 2.3 Ambiente de homologação

Documentos de homologação são processados somente em lote separado e identificado como teste. Seus resultados nunca compõem consolidações de produção.

## 3. Cancelamento

Aplicam-se as mesmas consequências ao cancelamento normal e ao cancelamento por substituição da NFC-e:

- calcular integralmente a nota, item por item, para auditoria;
- marcar o documento como `CANCELADA`;
- definir `incluidaNoTotal=NAO`;
- excluir todos os seus valores dos totais definitivos;
- conservar valores declarados, calculados e memória de cálculo;
- apresentar no XLSX tipo do evento, protocolo, data e motivo da exclusão.

No cancelamento por substituição, o sistema guarda a chave da NFC-e substituta e relaciona as duas notas quando ambas estiverem disponíveis. A substituta é processada normalmente conforme sua própria situação.

## 4. Carta de Correção Eletrônica — CC-e

Esta decisão é provisória para o MVP.

- Relacionar à nota a CC-e autorizada mais recente.
- Preservar todas as CC-e anteriores no histórico.
- Não interpretar automaticamente o texto livre como alteração de campos fiscais.
- Não modificar o XML original.
- Calcular com os dados do XML original.
- Marcar como `PENDENTE_REVISAO_CCE`.
- Excluir do total definitivo até revisão do contador.
- Permitir ao contador aprovar o cálculo original; a aprovação é auditada.
- Exibir no XLSX texto da correção, protocolo, data, valores calculados e motivo da pendência.

## 5. Rejeição, denegação e inutilização

### 5.1 Rejeitada

Somente um retorno explícito da SEFAZ classifica o documento como `REJEITADA`. A simples falta de protocolo resulta em `NAO_VERIFICADA`, e não em rejeição.

Se o conteúdo completo da nota estiver disponível, o sistema calcula para diagnóstico, mas não inclui os valores nos totais. O XLSX apresenta código e mensagem da rejeição, valores diagnósticos, `incluidaNoTotal=NAO` e o motivo `Documento não autorizado pela SEFAZ`.

Se houver apenas o retorno da rejeição, sem dados suficientes da nota, o sistema registra o erro e não tenta calcular.

### 5.2 Uso denegado

O documento recebe `USO_DENEGADO`. Quando houver conteúdo suficiente, é calculado somente para diagnóstico e permanece fora dos totais. O XLSX diferencia denegação de rejeição e apresenta código, motivo e valores diagnósticos.

### 5.3 Numeração inutilizada

O XML de inutilização não representa uma operação e não produz cálculo. O sistema registra em `Eventos` o CNPJ, modelo, série, intervalo inicial e final, protocolo, data e justificativa.

Se o lote também contiver uma suposta nota pertencente ao intervalo inutilizado, ela recebe `CONFLITO_DE_NUMERACAO` e permanece fora dos totais.

## 6. NF-e complementar

- Identificar pela finalidade `finNFe=2`.
- Calcular somente os valores próprios da nota complementar.
- Não substituir a nota original.
- Incluir seus valores uma única vez nos totais definitivos, quando não houver pendência.
- Relacionar a complementar à chave da nota original.
- Quando a original estiver disponível, exibir valor original, complemento e total combinado.
- Quando a original não estiver disponível, calcular a complementar e sinalizar `ORIGINAL_NAO_LOCALIZADA`.
- Nunca inventar nem copiar automaticamente valores ausentes da original.
- Campos insuficientes para o cálculo geram pendência.
- Complementar de uma nota original cancelada fica pendente de revisão e fora dos totais.

## 7. NF-e de devolução

- Identificar pela finalidade `finNFe=4` e validar o tratamento por regra fiscal estruturada.
- Calcular os itens normalmente.
- Relacionar à nota original quando a referência estiver disponível.
- Identificar se a empresa analisada é emitente ou destinatária.
- Manter valores positivos na memória de cálculo.
- Aplicar sinal somente na consolidação: positivo para aumento e negativo para estorno.
- A regra fiscal determina se ocorre estorno de débito, estorno de crédito ou outro efeito.
- Se o efeito não puder ser determinado com segurança, usar `DEVOLUCAO_PENDENTE` e excluir dos totais.
- O XLSX mostra chave original, tipo de estorno, valor calculado, efeito com sinal e regra aplicada.

## 8. Manifestação do destinatário

### 8.1 Operação não realizada

A nota é calculada para diagnóstico. Se a empresa analisada for a destinatária, recebe `OPERACAO_NAO_REALIZADA` e fica fora dos totais e créditos. Se for a emitente, recebe `PENDENTE_REGULARIZACAO` e fica fora dos totais até revisão.

O XLSX apresenta justificativa, protocolo, data, posição da empresa e motivo da exclusão.

### 8.2 Desconhecimento da operação

A nota é calculada para diagnóstico. Se a empresa analisada for a destinatária, recebe `OPERACAO_DESCONHECIDA` e fica fora dos totais e créditos. Se for a emitente, recebe `PENDENTE_REGULARIZACAO` e fica fora dos totais até revisão.

O alerta possui alta prioridade no XLSX.

### 8.3 Confirmação da operação

A nota recebe `OPERACAO_CONFIRMADA`, é calculada e integra os totais quando não houver outra pendência. A confirmação não substitui a comparação entre imposto declarado e calculado. Uma devolução posterior é registrada separadamente, com seu próprio efeito.

### 8.4 Ciência da emissão

A ciência não é conclusiva. A nota recebe `CIENCIA_NAO_CONCLUSIVA`, é calculada e pode integrar os totais quando autorizada e sem outra pendência. O XLSX apresenta aviso, mas não exige intervenção manual somente por esse motivo.

### 8.5 Ausência de manifestação

A ausência de evento nos arquivos locais não invalida a nota. O documento recebe `SEM_MANIFESTACAO_INFORMADA`, é calculado e pode integrar os totais quando não houver outra pendência.

O texto do relatório deve dizer que nenhuma manifestação foi localizada no lote ou no banco local, sem afirmar que ela não existe na SEFAZ.

## 9. Emissão em contingência

- `cStat=100`: autorização normal.
- `cStat=150`: autorização fora do prazo; calcular e incluir normalmente.
- Autorização válida por SVC: calcular e incluir normalmente.
- EPEC autorizado sem autorização posterior da NF-e: usar `CONTINGENCIA_PENDENTE`.
- NFC-e offline sem protocolo posterior: usar `CONTINGENCIA_PENDENTE`.
- Documento em contingência pendente é calculado, fica fora do total definitivo e aparece em subtotal provisório.
- A importação posterior do protocolo definitivo permite reprocessar e incluir a nota automaticamente.
- Rejeição ou cancelamento posterior aplica as respectivas regras já definidas.

## 10. Informações mínimas no XLSX

Além das colunas fiscais, o relatório deve comportar:

```text
situacaoDocumento
calculada
incluidaNoTotal
caraterResultado: DEFINITIVO | PROVISORIO | DIAGNOSTICO
ambiente
codigoStatusSefaz
motivoStatusSefaz
tipoEvento
protocoloEvento
dataEvento
justificativaEvento
chaveDocumentoReferenciado
posicaoEmpresa: EMITENTE | DESTINATARIA
motivoExclusaoOuPendencia
```

O contrato definitivo de abas, colunas e fórmulas do XLSX ainda será aprovado.
