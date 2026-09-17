# Prova de conceito do parser XML

## Resultado

**Aprovada para continuar a implementação.**

A combinação definida na DT-020 conseguiu extrair dados da NF-e, validar um
`nfeProc` 4.00 contra schemas oficiais offline e executar o WebAssembly dentro do
runtime do Electron.

## Componentes validados

- `fast-xml-parser` `5.11.1`;
- `xmllint-wasm` `5.3.0`;
- Electron `38.8.6` em modo Node para o smoke test do worker/WASM;
- schemas `PL_010f_v1.04`, publicados em 31/08/2026;
- `procNFe_v4.00.xsd` estável do pacote oficial
  `PL_009p_NT2024_003_v1.03`.

As duas bibliotecas declaram licença MIT. As versões estão fixadas no
`package.json` e no lockfile.

## Evidências automatizadas

- extração de chave, modelo, número, série, CNPJ e quantidade de itens;
- preservação de identificadores como texto, inclusive CNPJ iniciado por zeros;
- reconhecimento de `NFe` e `nfeProc`;
- rejeição de leiaute diferente de 4.00;
- rejeição de modelo diferente de 55/65;
- distinção entre XML malformado e informação fiscal ausente;
- bloqueio de `DOCTYPE` e declaração de entidade antes do parsing;
- validação de `nfeProc` sintético contra XSD oficial;
- retorno de erros XSD sem impedir a extração tolerante dos dados disponíveis;
- resolução offline de `include` e `import` do catálogo;
- execução do worker/WASM no runtime Electron.

## Medição inicial

No computador de desenvolvimento, uma validação isolada levou aproximadamente:

- 85 ms dentro do teste Vitest;
- 124 ms no smoke test com Electron.

Esses números verificam viabilidade, não constituem meta de desempenho. Medições
de lote, aquecimento, concorrência e memória dependem da decisão MD-11.

## Catálogo de schemas

O pacote PL_010f é incremental. Seus cinco arquivos foram combinados com o
`procNFe_v4.00.xsd` oficial do PL_009p, que somente inclui o leiaute atual e
declara a raiz `nfeProc`. Origens e hashes estão em
`packages/nfe-parser/schemas/README.md`.

Nenhum schema é obtido da rede durante o processamento.

## Limites desta prova

- a fixture é sintética e sua assinatura possui apenas estrutura válida; a
  assinatura criptográfica não é verificada por decisão do MVP;
- ainda precisamos testar uma massa anonimizada de documentos reais;
- o instalador Windows ainda não foi escolhido; portanto, a cópia dos schemas e
  do `.wasm` no instalador será validada novamente na fase de distribuição;
- o parser extrai somente a identificação inicial; a normalização completa de
  itens, impostos, protocolo e pendências será implementada em incrementos;
- a classificação inicial dos erros XSD está implementada na DT-021; os campos
  fiscais necessários serão ampliados junto da normalização de nota e item.

## Próximo incremento técnico

1. ~~definir tipos normalizados de nota e item~~ — concluído;
2. ~~extrair valores comerciais e tributários declarados~~ — concluído para ICMS;
3. ~~criar o catálogo de severidades da validação~~ — concluído na DT-021;
4. ~~transformar falhas em códigos estáveis de pendência~~ — concluído;
5. executar parsing e XSD em um worker coordenado pelo processo principal.
