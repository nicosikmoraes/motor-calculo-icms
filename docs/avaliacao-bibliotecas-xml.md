# Avaliação de bibliotecas XML

Avaliação do parser NF-e/NFC-e do aplicativo Electron. A escolha foi confirmada
com uma prova de conceito usando schemas oficiais e XMLs sintéticos. A validação
do instalador Windows permanece como atividade de empacotamento.

**Decisão:** `fast-xml-parser` e `xmllint-wasm` foram aprovados na DT-020. A prova
de conceito foi concluída com sucesso e está registrada em
[Prova de conceito do parser XML](prova-conceito-parser-xml.md).

## Necessidades do projeto

- execução local no processo principal ou worker, nunca no renderer;
- TypeScript e compatibilidade com Electron;
- namespaces XML;
- preservação de identificadores como texto, sem conversão automática para número;
- rejeição de DTD e entidades externas;
- mensagens que possam ser convertidas em aviso ou pendência;
- validação XSD offline com todos os `include` e `import` fornecidos pelo aplicativo;
- nenhum acesso de rede durante a análise;
- processamento de lotes sem bloquear a interface.

## Opções avaliadas

### `fast-xml-parser`

**Pontos positivos**

- implementação JavaScript, sem binário nativo ou `node-gyp`;
- simples de integrar com TypeScript e Electron;
- converte XML diretamente para objetos e permite controlar atributos, arrays,
  namespaces, valores e preservação de ordem;
- projeto ativo e voltado a desempenho.

**Pontos negativos**

- sua validação verifica principalmente se o XML é bem formado; não substitui a
  validação completa contra XSD;
- opções incorretas podem converter chaves, CNPJ, NCM e outros códigos em número;
- possui suporte a entidades e `DOCTYPE`, que devem ser bloqueados explicitamente
  antes do parsing;
- a normalização precisa ser nossa, sem depender diretamente do objeto produzido.

Fonte: <https://github.com/NaturalIntelligence/fast-xml-parser>

### `xmllint-wasm`

**Pontos positivos**

- disponibiliza o `xmllint`/libxml2 em WebAssembly;
- valida XML contra XSD sem exigir biblioteca nativa instalada no Windows;
- funciona em Node.js e aceita schemas dependentes pré-carregados;
- não busca automaticamente os `include`/`import`, permitindo operação offline e
  controlada;
- mantém parsing e validação XSD separados.

**Pontos negativos**

- adiciona artefato WASM, tempo de inicialização e consumo de memória;
- mensagens vêm no formato do `xmllint` e precisam ser normalizadas;
- precisamos verificar inclusão do `.wasm` no empacotamento Electron;
- deve rodar em worker e ter testes para schemas da NF-e com múltiplos includes.

Fonte: <https://github.com/noppa/xmllint-wasm>

### `libxml2-wasm`

**Pontos positivos**

- reúne parsing, XPath e validação XSD usando libxml2 em WebAssembly;
- não exige toolchain C/C++ no computador do usuário;
- é compatível com Node.js moderno e oferece API TypeScript;
- evita incompatibilidade de binários nativos entre versões do Electron.

**Pontos negativos**

- objetos alocados no heap WASM exigem `dispose()` explícito;
- `include` e `import` de XSD aparecem como experimentais na documentação do
  pacote e precisam ser validados com o conjunto oficial da NF-e;
- acopla parsing e consulta a uma API de mais baixo nível;
- possui superfície maior do que a necessária para apenas validar XSD.

Fonte: <https://www.npmjs.com/package/libxml2-wasm>

### `libxmljs2-xsd`

**Pontos positivos**

- valida XSD 1.0 usando libxml2;
- API direta para compilar schema e retornar os erros de validação;
- tecnologia conhecida e madura na camada nativa.

**Pontos negativos**

- depende de módulo nativo e `node-gyp`, aumentando o risco de instalação,
  empacotamento e compatibilidade ABI com Electron;
- a documentação declara suporte antigo de Node e requisitos específicos de
  Windows;
- o mantenedor informa que não trabalha ativamente no projeto;
- última publicação observada é antiga para a stack atual.

Fonte: <https://github.com/cdegalitt/libxmljs2-xsd>

### `@xmldom/xmldom`

**Pontos positivos**

- API DOM conhecida;
- implementação JavaScript sem binário nativo;
- útil quando é necessário navegar ou serializar uma árvore DOM.

**Pontos negativos**

- não oferece validação XSD completa;
- a documentação reconhece diferenças e partes incompletas em relação aos padrões;
- construir uma árvore DOM inteira é mais pesado que o necessário para extração;
- o histórico recente de avisos de segurança aumenta a exigência de atualização e
  testes com entrada não confiável.

Se utilizado, deve ser o pacote com escopo `@xmldom/xmldom`; o pacote antigo sem
escopo é considerado depreciado pelo próprio projeto.

Fontes: <https://github.com/xmldom/xmldom> e
<https://github.com/xmldom/xmldom/security>

### `saxes`

**Pontos positivos**

- parser SAX em streaming, estrito quanto a XML bem formado;
- baixo uso de memória;
- suporte a namespaces.

**Pontos negativos**

- API de baixo nível exige construir manualmente toda a normalização;
- não valida XSD;
- o repositório foi arquivado em dezembro de 2025 e está somente para leitura.

Fonte: <https://github.com/lddubeau/saxes>

## Solução aprovada e implementada

A prova de conceito implementa:

1. `fast-xml-parser` para leitura e extração;
2. `xmllint-wasm` para validação XSD em worker;
3. schemas oficiais embarcados e acesso externo desabilitado;
4. normalização própria para tipos do domínio;
5. XML original tratado como imutável.

Essa combinação evita módulos nativos do Electron, mantém a validação XSD
independente e permite que incompatibilidades classificadas como pequenas gerem
aviso sem impedir a extração dos dados disponíveis.

## Evidências da prova de conceito

- [x] validar um `nfeProc` 4.00 sintético;
- [x] coletar os erros de um XML incompatível com o XSD;
- [x] carregar os `include` e `import` do pacote oficial sem rede;
- [x] recusar `DOCTYPE` e entidades externas;
- [x] conservar identificadores e valores como texto;
- [x] executar o worker/WASM no runtime do Electron;
- [x] medir o tempo inicial de uma validação isolada;
- [x] confirmar licenças e registrar versões exatas;
- [ ] testar uma massa anonimizada representativa e medir memória/lotes;
- [ ] validar a cópia do WASM e dos schemas no instalador Windows.
