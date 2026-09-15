# Motor de Cálculo de ICMS

Repositório de descoberta e especificação de um sistema para recalcular ICMS em lote a partir de arquivos XML de NF-e e entregar os resultados em XLSX.

## Objetivo

Permitir que um contador mantenha previamente empresas, perfis fiscais e regras tributárias. Depois da configuração, o usuário operacional apenas envia uma pasta ou arquivo ZIP com NF-e. O sistema:

1. valida e interpreta cada XML;
2. identifica a regra fiscal vigente para cada item;
3. recalcula ICMS próprio e, quando configurados, ICMS-ST, DIFAL e FCP;
4. compara o valor calculado com o valor declarado;
5. consolida os itens por nota;
6. produz uma planilha XLSX com resultados, memória de cálculo e pendências.

## Princípios

- O cálculo ocorre por item; o resultado da nota é a soma dos itens.
- Valores tributários declarados no XML são usados para comparação, não como regra de cálculo.
- Regras fiscais são centralizadas e versionadas, nunca copiadas em cada SKU.
- A regra mais específica e vigente prevalece.
- Ausência ou ambiguidade de regra gera pendência, não um resultado presumido.
- Uma nota só é considerada calculada quando todos os seus itens forem calculados.
- Toda decisão deve ser explicável por uma memória de cálculo e uma regra identificável.

## Estado do projeto

O projeto está em fase de definição. Já foram aprovados o aplicativo desktop com Electron, Vue e TypeScript, o banco SQLite independente por máquina, o compartilhamento por pacotes de exportação/importação e as regras fiscais estruturadas. As decisões restantes serão discutidas e registradas progressivamente.

## Documentação

- [Regras de negócio](docs/regras-de-negocio.md)
- [Arquitetura inicial](docs/arquitetura-inicial.md)
- [Modelo de dados inicial](docs/modelo-de-dados.md)
- [Manual do usuário e contador](docs/manual-do-usuario.md)
- [Critérios de aceite](docs/criterios-de-aceite.md)
- [Decisões técnicas aprovadas](docs/decisoes-tecnicas.md)

## Limites e responsabilidade

O sistema é um motor parametrizável de cálculo e auditoria. A responsabilidade por classificação fiscal, vigência, fundamento legal e aprovação das regras é do profissional fiscal autorizado pela organização. O sistema deve preservar histórico e evidências, mas não substitui interpretação tributária profissional.
