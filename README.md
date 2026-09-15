# Motor de Cálculo de ICMS

Repositório de descoberta e especificação de um sistema para recalcular ICMS em lote a partir de arquivos XML de NF-e e entregar os resultados em XLSX.

## Objetivo

Permitir que um contador mantenha previamente empresas, perfis fiscais e regras tributárias. Depois da configuração, o usuário operacional apenas envia uma pasta ou arquivo ZIP com NF-e. O sistema valida os XMLs, recalcula os tributos por item, compara com os valores declarados, consolida por nota e produz uma planilha auditável.

## Princípios

- O cálculo ocorre por item; o resultado da nota é a soma dos itens.
- Valores tributários declarados no XML são usados para comparação, não como regra.
- Regras fiscais são centralizadas e versionadas, nunca copiadas em cada SKU.
- A regra mais específica e vigente prevalece.
- Ausência ou ambiguidade de regra gera pendência, não um resultado presumido.
- Uma nota só é considerada calculada quando todos os itens forem calculados.
- Toda decisão possui memória de cálculo e regra identificável.

## Documentação

- [Regras de negócio](docs/regras-de-negocio.md)
- [Arquitetura inicial](docs/arquitetura-inicial.md)
- [Modelo de dados inicial](docs/modelo-de-dados.md)
- [Manual do usuário e contador](docs/manual-do-usuario.md)
- [Critérios de aceite](docs/criterios-de-aceite.md)

## Estado

O repositório contém a definição inicial de negócio e arquitetura. A tecnologia, infraestrutura e desenho físico serão discutidos na próxima etapa.

## Responsabilidade

O sistema é um motor parametrizável de cálculo e auditoria. Classificação fiscal, vigência, fundamento e aprovação das regras cabem ao profissional fiscal autorizado. O sistema preserva histórico e evidências, mas não substitui interpretação tributária profissional.
