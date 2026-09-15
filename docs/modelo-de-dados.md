# Modelo de dados inicial

Este modelo é conceitual e será refinado após a escolha técnica.

## Entidades principais

### `Organizacao`

Cliente/tenant proprietário de empresas, regras e execuções.

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
vigenciaInicial, vigenciaFinal, fundamentoLegal, versao,
autorId, aprovadorId, criadaEm, aprovadaEm
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
status, totalArquivos, totalNotas, totalPendencias, solicitadoPor
```

### `DocumentoFiscal`

```text
id, loteId, chaveAcesso, numero, serie, emissao, emitenteCnpj,
destinatarioCnpjCpf, ufOrigem, ufDestino, hashXml, status
```

### `ItemDocumento`

Contém o snapshot normalizado do XML, inclusive valores comerciais e tributários declarados.

### `ExecucaoCalculo`

```text
id, documentoId, execucaoAnteriorId, versaoMotor,
iniciadaEm, concluidaEm, status, solicitadaPor
```

### `ResultadoItem`

```text
execucaoId, itemId, regraFiscalId, versaoRegra,
baseCalculada, aliquotaCalculada, icmsCalculado,
icmsSTCalculado, difalCalculado, fcpCalculado,
valoresDeclarados, diferencas, status, memoriaCalculo
```

### `Pendencia`

```text
id, loteId, documentoId, itemId, tipo, descricao,
contexto, status, resolvidaPor, resolvidaEm, resolucao
```

### `EventoAuditoria`

```text
id, organizacaoId, usuarioId, entidade, entidadeId,
acao, dataHora, versaoAnterior, versaoNova, metadados
```

## Restrições importantes

- Chave de acesso deve ser única dentro da política de organização/execução.
- Regra publicada é imutável; correção cria nova versão.
- Datas de vigência são obrigatórias para regra aprovada.
- Resultado referencia exatamente a versão utilizada.
- Valores monetários usam decimal exato, nunca ponto flutuante binário.
- NCM, CEST, CNPJ, chave e códigos fiscais são armazenados como texto normalizado.

