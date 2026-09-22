# Modelo de dados inicial

Este modelo é conceitual e será refinado na implementação SQLite. Cada máquina mantém um banco independente.

## Entidades principais

### `Organizacao`

Contexto local do escritório proprietário de empresas, regras e execuções. No MVP existe apenas uma organização por instalação; a entidade preserva contexto e possibilidade de evolução, mas não implementa multi-tenancy.

### `Empresa`

```text
id, organizacaoId, cnpj, razaoSocial, uf, inscricaoEstadual,
regimeTributario, vigenciaInicial, vigenciaFinal, status
```

### `ConfiguracaoFiscalEmpresa`

```text
empresaId, finalidadePadrao, tolerancias, arredondamento,
regimesEspeciais, beneficios, vigencia, versao
```

### `PerfilFiscal`

```text
id, organizacaoId, nome, categoria, ncm, cest, origemPadrao,
finalidadePadrao, unidadeTributavel, status, versao
```

### `ProdutoFornecedor`

```text
id, organizacaoId, fornecedorCnpj, codigoFornecedor, descricao,
perfilFiscalId, ncmDeclarado, cestDeclarado, statusValidacao
```

### `RegraFiscal`

```text
id, organizacaoId, nome, tipoRegra, prioridade, status,
nível, quantidadeCondicoesEspecificas,
vigenciaInicial, vigenciaFinal, fundamentoLegal, versao,
instalacaoOrigemId, criadaEm, aprovadaEm
```

Condições:

```text
empresaId opcional, produtoFornecedorId opcional, perfilFiscalId opcional,
ufOrigem, ufDestino, ncm, cest, cfop, tipoOperacao,
regimeEmitente, indIEDest, consumidorFinal, finalidade, origemMercadoria
```

Resultados:

```text
cstCsosnEsperado, aliquotaICMS, reducaoBase, diferimento,
modalidadeBase, incluiFrete, incluiSeguro, incluiOutrasDespesas,
descontoReduzBase, incluiIPI, calculaPorDentro,
aplicaST, modalidadeST, mva, pauta, pmpf, precoMaximo,
aliquotaInternaDestino, reducaoBaseST, aliquotaFCP, aliquotaFCPST
```

### `Lote`

```text
id, organizacaoId, empresaId, nomeOriginal, recebidoEm,
status, totalArquivos, totalNotas, totalPendencias, instalacaoOrigemId
```

Cada envio confirmado recebe UUID próprio; `recebidoEm` não é usado sozinho como
identidade técnica. `empresaId` pode permanecer ausente durante a identificação
inicial, mas é obrigatório antes de iniciar o processamento fiscal. Um lote
confirmado representa somente uma empresa analisada.

Na migration `0001`, estados a partir de `PROCESSANDO` exigem `empresaId`. A
foreign key composta também garante que a empresa pertença à mesma organização do
lote.

### `OcorrenciaArquivo`

```text
id, loteId, nomeOriginal, caminhoRelativo, tipoDetectado, hashConteudo,
ordemNoEnvio, statusIngestao, aviso, recebidoEm
```

Cada aparição de um arquivo no envio é preservada, inclusive quando chave e hash
se repetem. Isso permite marcar a segunda ocorrência como `REPETIDA` sem apagar a
evidência nem confundir lotes diferentes.

O formato canônico, o SHA-256 e a proveniência estão definidos em
[Contrato do inventário de arquivos](contrato-inventario-arquivos.md).

A migration `0001` preserva todas as ocorrências, não torna chave ou hash únicos e
garante apenas a unicidade de `loteId + ordemNoEnvio`. Repetições apontam para uma
ocorrência original do mesmo lote e nunca são elegíveis para os totais; conflitos
de conteúdo também ficam inelegíveis por restrição do banco.

### `DocumentoFiscal`

```text
id, loteId, ocorrenciaArquivoId, chaveAcesso, numero, serie, emissao, emitenteCnpj,
destinatarioCnpjCpf, ufOrigem, ufDestino, ambiente, modelo, finalidade,
hashXml, situacaoDocumento, situacaoCalculo, caraterResultado,
calculada, incluidaNoTotal, motivoExclusaoOuPendencia
```

### `ProtocoloDocumento`

```text
id, documentoId, tipo, numero, dataHora, ambiente,
codigoStatus, motivoStatus, chaveInformada, valido, hashXml
```

### `EventoDocumento`

```text
id, documentoId opcional, chaveAcesso, tipoEvento, sequencia,
protocolo, dataHora, codigoStatus, motivoStatus, justificativa,
chaveDocumentoReferenciado opcional, ambiente, autorizado, hashXml
```

Eventos sem documento associado permanecem armazenados até a definição da política de eventos órfãos.

### `RelacaoDocumento`

```text
id, documentoOrigemId, documentoDestinoId opcional,
chaveDocumentoDestino, tipoRelacao
```

Tipos iniciais incluem `COMPLEMENTA`, `DEVOLVE` e `SUBSTITUI`.

### `ItemDocumento`

Contém o snapshot normalizado do XML, inclusive valores comerciais e tributários declarados.
O contrato inicial está detalhado em
[Contrato normalizado de NF-e e NFC-e](contrato-normalizacao-nfe.md). Valores
decimais permanecem como texto até sua conversão explícita pela futura biblioteca
decimal.

### `ExecucaoCalculo`

```text
id, solicitacaoId, documentoId, execucaoAnteriorId, versaoMotor,
iniciadaEm, concluidaEm, status, instalacaoOrigemId
```

`solicitacaoId + documentoId` possui unicidade no banco. Retomadas reutilizam a
solicitação; recálculos explícitos criam uma nova.

### `ResultadoItem`

```text
execucaoId, itemId, regraFiscalId, versaoRegra,
baseCalculada, aliquotaCalculada, icmsCalculado,
icmsSTCalculado, difalCalculado, fcpCalculado,
valoresDeclarados, diferencas, status, memoriaCalculo
```

### `DecisaoRevisaoDocumento`

```text
id, documentoId, tipoRevisao, decisao, justificativa,
dataHora, instalacaoOrigemId, execucaoGeradaId
```

Suporta, entre outras, a aprovação auditada de nota com CC-e.

### `Pendencia`

```text
id, loteId, documentoId, itemId, tipo, descricao,
contexto, status, resolvidaNaInstalacaoId, resolvidaEm, resolucao
```

### `EventoAuditoria`

```text
id, organizacaoId, instalacaoId, entidade, entidadeId,
acao, dataHora, versaoAnterior, versaoNova, metadados
```

### `HistoricoImportacao`

```text
id, pacoteId, versaoFormato, arquivo, hashConteudo, importadoEm,
totalNovos, totalIgnorados, totalAtualizados, totalConflitos, resultado
```

## Restrições importantes

- Chave de acesso não é restrição única: ocorrências repetidas ou conflitantes são
  preservadas e relacionadas dentro do lote. Índices devem permitir localizar
  rapidamente todas as ocorrências da mesma chave.
- Regra publicada é imutável; correção cria nova versão.
- Datas de vigência são obrigatórias para regra aprovada.
- Resultado referencia exatamente a versão utilizada.
- Execução de cálculo concluída é imutável; recálculo cria uma nova execução
  vinculada à anterior e preserva entradas, versões e memória de cálculo.
- A combinação `solicitacaoId + documentoId` é idempotente e não pode gerar duas
  execuções confirmadas.
- Cadastros utilizados são inativados, não excluídos; regras publicadas, lotes e
  execuções históricas não admitem exclusão operacional.
- Todo lote em processamento possui exatamente uma empresa analisada; documento
  alheio a ela permanece registrado com `EMPRESA_DIVERGENTE` e fora dos totais.
- Chaves estrangeiras históricas usam comportamento restritivo e não podem
  apagar evidências por cascata.
- Valores monetários, bases, alíquotas, quantidades e valores unitários usam texto
  decimal canônico com escala validada, nunca ponto flutuante binário.
- Instantes internos usam UTC canônico; datas fiscais preservam também o valor e
  o deslocamento originais do XML.
- NCM, CEST, CNPJ, chave e códigos fiscais são armazenados como texto normalizado.
- Identificadores UUID permanecem estáveis entre exportações e importações.
- A aplicação nunca mescla arquivos SQLite diretamente.
- Protocolo e evento são deduplicados por identidade fiscal e hash, segundo política ainda pendente.
- Excluir o XML original no fim da retenção não pode apagar silenciosamente protocolo, eventos, dados normalizados, versões aplicadas ou resultados históricos; os detalhes serão definidos na política de retenção.
