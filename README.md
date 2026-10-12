# ContabiliNico

Aplicação local de cálculo e auditoria fiscal para contadores recalcularem ICMS em lote a partir de XMLs de
NF-e/NFC-e, compararem o resultado com os valores declarados e investigarem
divergências com rastreabilidade.

## Autor

- Nicolas Moraes — [@nicosikmoraes](https://github.com/nicosikmoraes)

## Estado do projeto

O projeto está em desenvolvimento. Este repositório já contém uma implementação
desktop anterior à revisão acadêmica. A Entrega 1 registra a concepção e o
planejamento; a API de doações descrita na arquitetura ainda será implementada.

- [Protótipo público — cinco telas com dados fictícios](https://contabilinico-prototipo.balmygrove128.chatgpt.site)
- [Kanban público — histórias vinculadas ao PRD](https://github.com/users/nicosikmoraes/projects/2)

## Stack

- Electron;
- Vue;
- NestJS;
- Prisma;
- PostgreSQL;
- SQLite.

## Em produção

A partir da Entrega 3. O protótipo público demonstra a navegação com dados
fictícios; não representa uma aplicação fiscal em produção.

## Quick Start

A partir da Entrega 2. As instruções técnicas da implementação desktop existente
permanecem no [guia de desenvolvimento](docs/desenvolvimento.md).

## Documentação de produto

Estes documentos resumem os requisitos, as jornadas e a arquitetura do produto:

- [Product Requirements Document — PRD](docs/prd.md)
- [Jornadas de usuário](docs/user-flows.md)
- [Tokens de design](docs/design-tokens.md)
- [Software Design Document — Arquitetura](docs/architecture.md)

O [checklist da disciplina](docs/checklist.md) registra as evidências acadêmicas
de cada entrega. US01–US03 e US05–US09 estão `Ready`; US04 continua `Draft` até
ser dividida por componente fiscal. O PRD é a fonte dos critérios de aceite;
as Issues apontam para ele.

## Documentação do produto

### Negócio e uso

- [Regras de negócio detalhadas](docs/regras-de-negocio.md)
- [Manual do usuário e do contador](docs/manual-do-usuario.md)
- [Critérios de aceite](docs/criterios-de-aceite.md)
- [Ciclo de vida do documento fiscal](docs/ciclo-de-vida-documento-fiscal.md)
- [Decisões pendentes](docs/decisoes-pendentes.md)
- [Conferência de ICMS-ST de entradas, catálogo de MVA e cobertura](docs/icms-st-entradas.md)

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
