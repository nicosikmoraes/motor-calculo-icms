# Arquitetura inicial

## 1. Objetivo

Suportar cálculo fiscal em lote, determinístico e auditável em um aplicativo Windows instalado e local-first, sem servidor obrigatório no MVP.

## 2. Stack aprovada

```text
Electron
Vue
TypeScript
Vite
Pinia
Vue Router
SQLite por máquina
fast-xml-parser para leitura XML
xmllint-wasm para validação XSD em worker
```

O renderer contém apenas a interface Vue. Acesso a arquivos, banco e recursos do sistema operacional ocorre no processo principal ou em workers, por contratos IPC restritos expostos pelo preload.

## 3. Componentes

```text
[Interface Vue]
       |
  [IPC seguro]
       |
 +-----+----------------+
 |                      |
 v                      v
[Processo principal] [Worker local]
 |                      |
 |               +------+-------+
 |               |              |
 v               v              v
[Arquivos]  [Parser NF-e] [Motor fiscal]
                              |
                       +------+------+
                       |             |
                       v             v
                   [SQLite]    [Gerador XLSX]
```

### Interface Vue

- cadastro e consulta;
- seleção de XML/ZIP;
- acompanhamento de lotes;
- pendências e memória de cálculo;
- exportação/importação e relatórios.

### Processo principal e preload

- selecionar pastas, arquivos e destinos;
- expor apenas operações autorizadas ao renderer;
- manter isolamento de contexto;
- coordenar workers sem bloquear a interface.

### Ingestão e normalização

- descompactar com limites de segurança;
- usar `fast-xml-parser` para extração e `xmllint-wasm` para XSD, sem acesso de rede;
- interpretar, validar e calcular NF-e/NFC-e no leiaute 4.00;
- identificar leiaute anterior como `VERSAO_NAO_SUPORTADA`, sem cálculo;
- registrar a revisão do pacote de schemas utilizada;
- impedir entidades XML externas;
- normalizar datas, identificadores, valores e itens;
- calcular hash e detectar duplicidade;
- preservar cada ocorrência recebida; repetições não sobrescrevem registros;
- criar UUID para cada lote e registrar separadamente sua data/hora de recebimento;
- observar a política de retenção do XML original.
- processar primeiro o inventário completo do lote e depois relacionar documentos, protocolos e eventos por chave;
- separar situação documental, situação de cálculo e participação nos totais.

### Motor de regras

- receber um contexto por item;
- filtrar regras aprovadas, compatíveis e vigentes;
- aplicar nível, especificidade e prioridade;
- retornar uma única regra ou pendência explicável;
- registrar alternativas consideradas.

### Motor de cálculo

- ser independente de Vue, Electron e SQLite;
- usar representação decimal exata;
- aplicar composição de base, redução, alíquota e arredondamento;
- executar módulos de ICMS próprio, ST, DIFAL e FCP;
- produzir memória intermediária das fórmulas.

### Gerador XLSX

- gerar células numéricas e datas corretamente tipadas;
- criar abas de resumo, itens, pendências, regras e erros;
- manter rastreabilidade entre linha, item, nota e execução.

## 4. Organização lógica do código

```text
apps/
  desktop/
    main/
    preload/
    renderer/

packages/
  domain/
  tax-engine/
  nfe-parser/
  reporting/
  contracts/
  database/
```

Regras fiscais e cálculos não ficam em componentes Vue. Pinia mantém somente estado da interface.

## 5. Processamento

Lotes podem conter milhares de notas. A importação cria uma execução e o processamento ocorre em worker local, fora do processo da interface. Repetir a mesma etapa não pode duplicar notas ou resultados.

A unidade inicial de paralelização é a nota. A concorrência será limitada para não comprometer memória ou responsividade do computador.

## 6. Persistência local

Cada instalação possui seu próprio SQLite. Não existe sincronização automática entre máquinas. Migrações de schema acompanham as versões do aplicativo.

O SQLite não deve ser colocado em pasta de rede para acesso simultâneo por diferentes computadores.

O XML original possui retenção padrão de um mês, configurável. A rotina segura de expurgo e o conjunto de evidências preservadas ainda serão definidos.

## 7. Exportação e importação

O compartilhamento dos dados cadastrados ocorre por arquivo `.icmspack`, um pacote ZIP lógico e versionado. O arquivo SQLite bruto não é exportado para intercâmbio.

```text
manifest.json
empresas.json
perfis-fiscais.json
produtos-fornecedores.json
regras-fiscais.json
beneficios.json
```

O manifesto contém identificador, versão do formato, versão do aplicativo, data, contagens e hash do conteúdo. XMLs, resultados, XLSX, logs, caminhos locais e credenciais não integram o pacote de configuração.

A importação valida estrutura, hash e compatibilidade; apresenta resumo, novidades e conflitos; e aplica as alterações em uma única transação. Em caso de erro, nenhuma alteração permanece.

```text
registro novo                  -> importar
mesmo ID e mesmo conteúdo      -> ignorar
mesmo ID e conteúdo diferente  -> mostrar conflito
versão importada mais recente  -> sugerir atualização
versão local mais recente      -> manter local por padrão
```

Esse mecanismo é transferência manual, não sincronização em tempo real.

## 8. Versionamento e reprocessamento

Cada cálculo registra:

```text
versaoMotor
versaoRegra
dataHoraExecucao
identificadorLote
hashXML
parametrosDeArredondamento
resultado
```

O reprocessamento cria nova execução vinculada à anterior. Resultados históricos não são sobrescritos silenciosamente.

## 9. Segurança mínima

- proteção do banco e arquivos conforme o usuário do sistema operacional;
- renderer isolado, sem acesso Node direto;
- validação de mensagens IPC;
- validação rigorosa de todo pacote importado;
- prevenção contra Zip Slip, XML External Entity e ZIP expansivo;
- trilha de auditoria para regras, cálculos e importações;
- backup e restauração explícitos do banco local.

No MVP não existe distinção de permissões dentro do aplicativo: todo usuário da instalação pode executar todas as operações.

## 10. Observabilidade local

- notas e itens processados;
- tempo por lote e nota;
- aderências e divergências;
- regras não encontradas ou ambíguas;
- produtos não classificados;
- erros por versão de XML;
- relatório de cada importação.

Logs não devem expor XML integral nem dados comerciais sem necessidade.

## 11. Decisões ainda abertas

A lista priorizada está em [Decisões pendentes](decisoes-pendentes.md). Ela inclui a conclusão da política de ingestão, o contrato fiscal detalhado, o XLSX, persistência física, retenção, backup, desempenho, homologação, instalação e bibliotecas.
