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

- aceitar apenas XML de NF-e suportado;
- identificar a nota pela chave de acesso, não pelo nome do arquivo;
- detectar arquivos repetidos;
- validar estrutura, protocolo e situação disponíveis no documento;
- não interromper o lote quando um arquivo falhar;
- registrar cada falha com arquivo, etapa e mensagem compreensível.

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

RN-007 — A ordem padrão de especificidade é:

1. exceção para produto e empresa;
2. perfil fiscal, UFs e operação;
3. NCM, CEST, UFs e operação;
4. NCM, UFs e operação;
5. regra geral da operação.

RN-008 — Prioridade explícita resolve regras de diferentes níveis. Duas regras igualmente aplicáveis com a mesma prioridade geram `REGRA_AMBIGUA`.

RN-009 — A regra aplicada deve ser registrada com identificador, versão e fundamento.

RN-010 — Alterar uma regra cria nova versão; não altera cálculos históricos.

## 6. Produtos novos

RN-011 — O sistema tenta reconhecer o produto pela combinação `CNPJ do fornecedor + código do produto do fornecedor`.

RN-012 — Sem vínculo, o sistema tenta localizar perfil fiscal por NCM, CEST, origem e categoria.

RN-013 — Um vínculo automático só é permitido quando houver uma única correspondência aprovada.

RN-014 — NCM e CEST do XML são declarações do emissor. Divergência com cadastro validado gera pendência ou alerta conforme política da empresa.

RN-015 — Depois da validação do contador, o vínculo deve ser reutilizado em notas futuras.

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

RN-016 — O motor deve suportar cálculo por dentro quando a regra exigir.

RN-017 — Valores compartilhados no total da nota devem ser rateados por método configurado e registrado na memória de cálculo.

RN-018 — Arredondamento é feito por item conforme a regra configurada. A soma por nota utiliza os valores já arredondados dos itens.

RN-019 — Fórmulas de ST, DIFAL e FCP são módulos separados e aplicados apenas quando a regra correspondente for encontrada.

RN-020 — O valor declarado jamais substitui um parâmetro ausente da regra calculada.

## 8. Comparação

Para cada componente:

```text
diferenca = valorCalculado - valorDeclarado
```

RN-021 — A tolerância monetária deve ser configurável por componente tributário.

RN-022 — Dentro da tolerância, o componente é considerado aderente; fora dela, divergente.

RN-023 — A comparação deve conservar base, alíquota, imposto, regra e fórmula utilizados.

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
- `DUPLICADA`: chave já presente no mesmo lote ou segundo política configurada.

### Lote

- `RECEBIDO`, `VALIDANDO`, `PROCESSANDO`, `CONCLUIDO`, `CONCLUIDO_COM_PENDENCIAS` ou `FALHOU`.

## 10. Planilha de saída

O XLSX deve conter:

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

## 11. Auditoria e segurança

- Registrar autor, aprovador e datas de cada regra.
- Separar permissões de edição e aprovação.
- Guardar o snapshot/versão das regras aplicadas.
- Registrar reprocessamentos e quem os solicitou.
- Não sobrescrever resultados históricos silenciosamente.
- Proteger XML, CNPJ e dados comerciais conforme política de retenção e acesso da organização.

