# Arquitetura inicial

## 1. Objetivo arquitetural

Suportar cálculo fiscal em lote, determinístico, auditável e independente da interface. Esta é uma arquitetura lógica; linguagens, frameworks, banco e infraestrutura ainda não foram escolhidos.

## 2. Componentes

```text
[Interface de upload e cadastros]
               |
               v
        [API da aplicação]
               |
       +-------+--------+
       |                |
       v                v
[Ingestão de XML]   [Cadastros fiscais]
       |                |
       v                |
[Normalização]          |
       |                |
       +-------+--------+
               v
       [Motor de regras]
               |
               v
       [Motor de cálculo]
               |
       +-------+--------+
       |                |
       v                v
[Comparação/auditoria] [Pendências]
       |
       v
     [Gerador XLSX]
```

## 3. Responsabilidades

### Interface

- upload de XML/ZIP;
- acompanhamento de lotes;
- download de XLSX;
- manutenção e aprovação de cadastros;
- fila de pendências e reprocessamento;
- consulta da memória de cálculo.

### Ingestão e normalização

- descompactar com limites de segurança;
- validar formato e schema suportado;
- extrair `procNFe`, `infNFe` e protocolo;
- impedir entidades XML externas;
- normalizar valores, datas, identificadores e itens;
- calcular hash e detectar duplicidade;
- preservar o XML original de acordo com a política de retenção.

### Motor de regras

- receber um contexto fiscal por item;
- filtrar regras aprovadas e vigentes;
- ordenar por especificidade e prioridade;
- retornar uma única regra ou uma pendência explicável;
- registrar as alternativas consideradas.

### Motor de cálculo

- ser determinístico e sem dependência da interface;
- aplicar composição de base, redução, alíquota e arredondamento;
- executar módulos de ICMS próprio, ST, DIFAL e FCP;
- produzir memória intermediária de cada fórmula.

### Comparação

- confrontar declarado e calculado;
- aplicar tolerância configurada;
- classificar item e nota;
- impedir conclusão definitiva com itens pendentes.

### Gerador XLSX

- gerar células numéricas, datas e moeda corretamente tipadas;
- criar abas de resumo, itens, pendências, regras e erros;
- manter vínculo rastreável entre linha, item, nota e execução.

## 4. Processamento assíncrono

Lotes podem conter milhares de notas. O upload cria uma execução e o processamento ocorre fora da requisição da interface. A execução deve ser idempotente: repetir a mesma etapa não pode duplicar notas ou resultados.

Unidade recomendada de paralelização: nota fiscal. Dentro da nota, os itens podem ser processados sequencialmente para simplificar consistência, salvo necessidade comprovada de escala.

## 5. Versionamento e reprocessamento

Cada cálculo deve registrar:

```text
versaoMotor
versaoRegra
dataHoraExecucao
identificadorLote
hashXML
parametrosDeArredondamento
resultado
```

O reprocessamento cria uma nova execução vinculada à anterior. Resultados antigos permanecem consultáveis.

## 6. Segurança mínima

- autenticação e autorização por perfil;
- contador pode editar; aprovador fiscal publica regras;
- usuário operacional pode enviar e consultar seus lotes;
- criptografia em trânsito e em repouso conforme ambiente;
- varredura e limites de tamanho/quantidade para ZIP;
- prevenção contra Zip Slip, XML External Entity e arquivos excessivamente expansivos;
- trilha de auditoria imutável para regras e cálculos;
- isolamento dos dados por organização.

## 7. Observabilidade

Métricas mínimas:

- notas e itens processados;
- tempo por lote e por nota;
- taxa de aderência e divergência;
- regras não encontradas ou ambíguas;
- produtos não classificados;
- erros por versão de XML;
- regras mais utilizadas.

Logs técnicos não devem expor XML completo nem dados comerciais desnecessários.

## 8. Integrações futuras

- consulta a provedores de conteúdo tributário;
- atualização assistida de tabelas fiscais;
- integração com ERP e armazenamento documental;
- APIs de processamento unitário e em lote;
- notificações de conclusão;
- exportações adicionais.

Integrações externas não devem alterar regras aprovadas sem revisão, versionamento e evidência da origem.

## 9. Decisões ainda abertas

- stack de frontend, backend e tarefas assíncronas;
- banco relacional e estratégia de histórico;
- armazenamento de XML e XLSX;
- volume máximo por lote e metas de desempenho;
- escopo inicial de UFs e regimes;
- origem e processo de atualização do conteúdo fiscal;
- política de retenção;
- modelo de implantação e multiempresa;
- assinatura ou hash verificável dos relatórios.

