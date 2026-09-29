# Fase 2 — Casos de uso e auditoria de cadastros

Decisões de produto confirmadas em 28/09/2026. Este plano não define fórmula, alíquota ou resultado fiscal; MD-05 e a revisão do contador continuam pendentes.

## Contrato aprovado

- Concluir os casos de uso de organização, empresa, perfil fiscal e produto de fornecedor antes de criar o schema de regras versionadas.
- Criação, edição, inativação e reativação bem-sucedidas geram auditoria. Tentativas falhas produzem diagnóstico técnico, não evento de alteração.
- Cada evento guarda entidade e identificador, horário UTC, operação e somente campos modificados com valores anterior e novo. Não guarda XML, arquivo nem segredo. CNPJ e dados cadastrais de produto podem aparecer.
- A interface mostra a origem como **Seu computador**. O evento guarda também o nome real do computador e o usuário do Windows. Isso identifica a sessão local, sem autenticar a pessoa. Não há perfis ou restrições de acesso no MVP.
- Mudança e evento de auditoria são gravados na mesma transação; falha em qualquer parte desfaz ambas. Edição com versão desatualizada é rejeitada e solicita recarregamento.
- O CNPJ da empresa não pode ser editado. Cadastros usados podem ser inativados e reativados imediatamente, sem exclusão física. A reativação preserva as validações de integridade já existentes. Resultados históricos nunca são reescritos; recálculo explícito cria nova execução.
- Eventos de auditoria são imutáveis e consultáveis por cadastro, período e tipo de mudança. Qualquer usuário da instalação pode consultar.
- Cada evento vence seis meses após sua criação. A limpeza automática roda na abertura, uma vez por dia enquanto o aplicativo estiver aberto e após restauração bem-sucedida, antes da consulta. Registra data e quantidade removida. Erro de limpeza gera diagnóstico e nova tentativa, sem bloquear o uso.
- Após a conclusão dos casos de uso, uma migration separada cria o schema necessário para regras versionadas e sua auditoria. Política de backup completa continua em MD-10.

## Sequência de implementação

1. **Contrato de operações:** criar entradas e saídas de casos de uso em `packages/domain/src/` e `packages/contracts/src/index.ts`, incluindo revisão esperada para edição concorrente e erros distinguíveis para conflito, cadastro ausente e validação. Não expor SQLite ao renderer.
2. **Casos de uso:** criar módulo em `apps/desktop/src/main/` para organização, empresa, perfil e produto. Mover para ele a coordenação hoje feita diretamente nos handlers de `apps/desktop/src/main/index.ts`; manter os repositórios em `packages/database/src/core-repositories.ts` e `packages/database/src/fiscal-catalog-repository.ts` como detalhes de persistência.
3. **Persistência e auditoria:** adicionar migration incremental posterior à `0008` em `packages/database/migrations/`, registrá-la em `packages/database/src/core-migrations.ts` e implementar repositório de eventos em `packages/database/src/`. Incluir campo de revisão nos cadastros que ainda não o tenham; nunca alterar migrations já publicadas. O schema deve impedir alteração e exclusão de eventos fora da rotina de retenção.
4. **Transações:** fazer caso de uso, alteração do cadastro e evento compartilharem a mesma conexão e transação. Comparar a revisão esperada na escrita; atualização com zero linhas por conflito não gera evento.
5. **Interface:** atualizar contratos IPC, `apps/desktop/src/preload/index.ts` e telas de cadastros em `apps/desktop/src/renderer/views/`; criar consulta de auditoria por cadastro, período e operação, exibindo **Seu computador**. Mostrar aviso de conflito de edição com ação para recarregar.
6. **Retenção:** executar limpeza na abertura, diariamente durante uso e após restauração. Preservar um registro técnico de execução da limpeza sem valores cadastrais removidos. O mecanismo de restauração será conectado quando MD-10 for implementado.
7. **Verificação:** cobrir criação, edição, inativação, reativação, rollback conjunto, conflito de revisão, histórico preservado, consulta e expurgo no limite exato de seis meses. Rodar `pnpm check`.

## Critério de conclusão

Os quatro cadastros podem ser criados, consultados, editados quando permitido, inativados e reativados por contratos de caso de uso; cada mudança concluída aparece uma vez na auditoria e nenhuma falha aparece como mudança. Conflitos de edição não sobrescrevem dados, resultados anteriores ficam intactos, e a limpeza respeita seis meses. O schema de regras versionadas é o incremento seguinte, sem bloquear esta entrega.
