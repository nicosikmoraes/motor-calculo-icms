# Motor de Cálculo de ICMS

Aplicação local para contadores recalcularem ICMS em lote a partir de XMLs de
NF-e/NFC-e, compararem o resultado com os valores declarados e investigarem
divergências com rastreabilidade.

## Autor

- Nicolas Moraes — [@nicosikmoraes](https://github.com/nicosikmoraes)

## Estado do projeto

O projeto está em desenvolvimento. A fundação do monorepo, o aplicativo desktop,
o parser de NF-e/NFC-e 4.00, a validação XSD offline, a normalização inicial e as
proteções de entrada já estão implementados. Persistência, fórmulas fiscais
homologadas e geração do XLSX ainda fazem parte do roadmap.

## Stack

- Electron 38, Vue 3 e TypeScript;
- pnpm workspaces em monorepo;
- Vitest para testes automatizados;
- `fast-xml-parser` para leitura dos XMLs;
- `xmllint-wasm` e schemas oficiais para validação XSD offline;
- armazenamento local planejado em SQLite.

## Em produção

- **Aplicação:** ainda não publicada;
- **Distribuição:** instalador Windows pendente de homologação.

## Quick Start

Pré-requisitos:

- Node.js 22 ou superior;
- pnpm 10.

```bash
pnpm install
pnpm dev
```

Para verificar tipagem, testes e build de produção:

```bash
pnpm check
```

## Documentação acadêmica

Estes documentos apresentam o produto no formato solicitado pela disciplina:

- [Product Requirements Document — PRD](docs/prd.md)
- [Jornadas de usuário](docs/user-flows.md)
- [Tokens de design](docs/design-tokens.md)
- [Software Design Document — Arquitetura](docs/architecture.md)
- [Checklist da disciplina](docs/checklist.md)

As histórias permanecem em `Draft` até a leitura e promoção explícita pelo autor.
O aceite do tema pelo professor e a decisão sobre o requisito acadêmico de
pagamento estão registrados como pendências no PRD.

## Documentação do produto

### Negócio e uso

- [Regras de negócio detalhadas](docs/regras-de-negocio.md)
- [Manual do usuário e do contador](docs/manual-do-usuario.md)
- [Critérios de aceite](docs/criterios-de-aceite.md)
- [Ciclo de vida do documento fiscal](docs/ciclo-de-vida-documento-fiscal.md)
- [Decisões pendentes](docs/decisoes-pendentes.md)

### Arquitetura e desenvolvimento

- [Arquitetura inicial](docs/arquitetura-inicial.md)
- [Modelo de dados inicial](docs/modelo-de-dados.md)
- [Decisões técnicas aprovadas](docs/decisoes-tecnicas.md)
- [Roadmap do MVP](docs/roadmap.md)
- [Guia de desenvolvimento](docs/desenvolvimento.md)

### Ingestão fiscal

- [Avaliação de bibliotecas XML](docs/avaliacao-bibliotecas-xml.md)
- [Prova de conceito do parser XML](docs/prova-conceito-parser-xml.md)
- [Catálogo de severidades](docs/catalogo-severidades-ingestao.md)
- [Contrato normalizado de NF-e/NFC-e](docs/contrato-normalizacao-nfe.md)
- [Contrato do inventário](docs/contrato-inventario-arquivos.md)
- [Segurança das entradas XML e ZIP](docs/seguranca-entradas.md)

## Limites e responsabilidade

O sistema é uma ferramenta parametrizável de cálculo e auditoria. A classificação
fiscal, a vigência, o fundamento legal e a aprovação das regras continuam sob a
responsabilidade do profissional fiscal autorizado. O sistema preserva histórico
e evidências, mas não substitui interpretação tributária profissional.
