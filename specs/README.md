# Especificações de histórias

| Issue | História | Spec | Plano | Estado |
| --- | --- | --- | --- | --- |
| [#12](https://github.com/nicosikmoraes/motor-calculo-icms/issues/12) | US09 — Fazer doação pelo Stripe | [spec](012-fazer-doacao-stripe/spec.md) | [plano](012-fazer-doacao-stripe/plan.md) | implementada |

## Atividade 09 — recorte e origem

- História selecionada: único cartão da coluna `Backlog` do [quadro](https://github.com/users/nicosikmoraes/projects/2), conferido em 01/11/2026.
- Branch: `feature/12-fazer-doacao-stripe`, criada da `main` no commit `2e445ca5f898601c34c7b9e53cc2ca670dd9d6a5`.
- A API dessa história ainda é o scaffold da Atividade 08. O código fiscal preexistente não é apresentado como implementação posterior desta spec.
- O trabalho desta atividade fica exclusivamente em `specs/`. Não há alteração de código, schema, banco, configuração ou dependências; não se abre PR.
- O roteiro permite escrever os documentos manualmente. `/utf-issue` e seus modelos não estão instalados neste checkout; as conferências são feitas explicitamente.
- O autor autorizou no chat de 01/11/2026 a preparação das decisões, a aprovação delegada e a publicação. Essa delegação é uma adaptação ao enunciado, que exige edição e commit de aprovação realizados pessoalmente pelo aluno. A autorização no chat não prova que esse ato manual aconteceu.

## Conferências da entrega

- Spec: 13 critérios numerados em Dado/Quando/Então; o nó vermelho de recusa tem cobertura explícita no CA9.
- Fora de escopo preenchido; dúvidas em aberto vazias; nenhuma dependência funcional pendente ou premissa simulada de outra Issue.
- Plano: nove tarefas ainda não executadas; CA1–CA13 mapeados; seção "Critérios sem tarefa" vazia.
- Histórico: rascunho → aprovação delegada → plano, antes de qualquer implementação da API de doações.
- Diff restrito a três arquivos Markdown em `specs/`; código do aplicativo, schema e configurações idênticos à base.
- Publicar a branch e conferir seu acesso público, manter a Issue aberta e mover o cartão para `In Progress`; nenhum PR deve ser aberto nesta atividade.
- Limitação acadêmica explícita: a edição e o commit pessoais da aprovação, exigidos pelo enunciado, não foram realizados manualmente pelo aluno nesta sessão. A delegação foi registrada, sem apresentar equivalência garantida para avaliação.

## Tutor independente

Um subagente leu somente a spec e `docs/architecture.md`, sem o chat da entrevista
ou outros arquivos. A revisão apontou ambiguidades de identidade de operação,
janela de retomada, fonte da confirmação, vínculo antecipado do webhook,
histórico de recusas, eventos fora de ordem, recuperação após resposta perdida e
minimização do corpo do webhook. O rascunho foi corrigido antes da aprovação,
incluindo estado explícito `falha_na_criacao` para rejeição conclusiva sem sessão.

Consequências técnicas: PostgreSQL conserva pedido, tentativas, operações e
histórico mínimo; confirmação e deduplicação exigem transação e controle de
concorrência. Conciliação recupera vínculos, mas só webhook válido confirma
pagamento. Incerteza bloqueia outra sessão; retomada usa identidades locais e
chave portadora. O processamento fiscal permanece local e independente.
O tutor não aprovou a spec nem implementou código.

## Entrega

[Branch da história no GitHub](https://github.com/nicosikmoraes/motor-calculo-icms/tree/feature/12-fazer-doacao-stripe).

Sugestão de parágrafo para o autor revisar com suas palavras:

> Especifiquei a US09, doação pelo Stripe em ambiente de testes, separada do processamento fiscal do ContabiliNico.
> Descobri que o gateway pode criar o Checkout e a resposta se perder; a spec exige retomar a mesma operação para evitar duplicação.
> A aprovação precisa ser um commit meu porque autoria, data e ordem no Git demonstram que os critérios foram aceitos antes do código.
> Nesta preparação deleguei ao assistente a execução desse commit; essa adaptação ficou registrada e não substitui a exigência de ato manual do enunciado.
