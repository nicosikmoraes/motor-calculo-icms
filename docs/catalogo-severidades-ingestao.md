# Catálogo de severidades da ingestão

Este catálogo transforma falhas técnicas do XML em códigos estáveis para a
interface, a auditoria e o futuro XLSX. A classificação não substitui a validação
fiscal: durante a normalização, a ausência de um dado necessário para determinado
cálculo também deverá gerar `INFORMACAO_FALTANTE`.

## Efeito das severidades

| Severidade | Decisão | Efeito |
|---|---|---|
| `AVISO` | `PROCESSAR` | Calcula normalmente e apresenta o aviso. |
| `INFORMACAO_FALTANTE` | `PROCESSAR_PARCIALMENTE` | Calcula somente componentes possíveis, cria pendência e não gera total definitivo. |
| `ERRO_IMPEDITIVO` | `REJEITAR` | Não interpreta nem calcula o documento; registra o arquivo e o motivo. |

Quando houver mais de um diagnóstico, prevalece a decisão mais restritiva:
`REJEITAR`, depois `PROCESSAR_PARCIALMENTE`, depois `PROCESSAR`.

## Códigos iniciais

| Código | Severidade | Origem e uso |
|---|---|---|
| `ASSINATURA_NAO_VERIFICADA` | `AVISO` | Sempre informado em documento processado, pois o MVP não valida a assinatura criptográfica. |
| `XSD_INCOMPATIBILIDADE` | `AVISO` | Divergência XSD sem evidência de campo obrigatório ausente ou valor inutilizável. |
| `XSD_CAMPO_OBRIGATORIO_AUSENTE` | `INFORMACAO_FALTANTE` | O XSD informa elemento ou atributo obrigatório ausente. |
| `XSD_VALOR_INVALIDO` | `INFORMACAO_FALTANTE` | O valor não atende tipo, enumeração, tamanho ou padrão do XSD. |
| `INFORMACOES_FALTANTES` | `INFORMACAO_FALTANTE` | O parser não encontrou grupo ou campo mínimo necessário. |
| `XML_CONTEUDO_INSEGURO` | `ERRO_IMPEDITIVO` | O documento contém `DOCTYPE` ou declaração de entidade. |
| `XML_MALFORMADO` | `ERRO_IMPEDITIVO` | O conteúdo não é XML bem formado. |
| `TIPO_XML_NAO_SUPORTADO` | `ERRO_IMPEDITIVO` | A raiz não é `NFe` nem `nfeProc`. |
| `VERSAO_NAO_SUPORTADA` | `ERRO_IMPEDITIVO` | O leiaute não é 4.00. |
| `MODELO_NAO_SUPORTADO` | `ERRO_IMPEDITIVO` | O modelo não é 55 nem 65. |

## Regras de classificação XSD

As mensagens do `xmllint-wasm` são normalizadas sem expor seu texto como chave de
negócio:

- elemento filho ou atributo obrigatório ausente vira
  `XSD_CAMPO_OBRIGATORIO_AUSENTE`;
- falha de tipo, enumeração, tamanho ou padrão vira `XSD_VALOR_INVALIDO`;
- as demais divergências viram `XSD_INCOMPATIBILIDADE` enquanto a extração segura
  continuar possível.

O texto original e a linha permanecem no diagnóstico para auditoria. Códigos e
decisões não dependem da tradução desse texto. Se a normalização identificar que
uma incompatibilidade tornou um dado fiscal necessário indisponível, ela acrescenta
uma informação faltante e a decisão final passa a `PROCESSAR_PARCIALMENTE`.

Na primeira normalização, CNPJ/CPF e UF do emitente, além de código do produto,
NCM, CFOP, quantidade comercial, valor unitário e valor total de cada item, são
tratados como necessários. Essa lista poderá crescer quando cada módulo fiscal
for homologado, sem transformar ausência em valor presumido.

## Limites deste incremento

- a lista de campos fiscais necessários será ampliada junto dos tipos normalizados
  de nota e item;
- eventos e protocolos terão códigos próprios quando entrarem no escopo;
- erro interno ao carregar o catálogo XSD não é tratado como problema da nota e
  deve interromper o lote para suporte técnico;
- a interface de pendências e a coluna correspondente no XLSX serão implementadas
  nas respectivas fases do roadmap.
