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

## Fila de decisões

A fila detalhada e priorizada está em [Decisões pendentes](decisoes-pendentes.md). O próximo item recomendado é a política de duplicidade de XMLs.
