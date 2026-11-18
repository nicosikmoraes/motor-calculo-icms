# Revisão final da US10 — dois revisores independentes

Os dois revisores foram subagentes de leitura, sem acesso à conversa de
implementação. Cada um recebeu a branch, a spec e o escopo do próprio papel.
A revisão aconteceu depois das nove tarefas, sobre o diff inteiro contra
`origin/main`, e não tarefa a tarefa como no ciclo da US09.

## Revisor de código e segurança

| # | Sev. | Apontamento | Triagem | Correção |
| --- | --- | --- | --- | --- |
| 1 | média | O teste "assinado com outro segredo" passava por engano: o usuário nem existia, então o 401 vinha de `/auth/me` e não da assinatura | procede | O teste entra antes, cobre também uma rota que não consulta usuário e confere que `findById` não roda (`1388723`) |
| 2 | média | O login no desktop adotava o token novo antes do `/auth/me`: falha de rede deixava o token de B com "Conectado como A", e um 401 virava "sessão expirada" no meio do login | procede | O token só é adotado depois da confirmação; a falha mantém a sessão anterior; teste novo (`1388723`) |
| 3 | baixa | O login aceitava senha acima de 72 bytes; "senha cadastrada + qualquer coisa" entrava, porque o bcrypt ignora o resto | procede | Compara com o hash fictício e responde o mesmo 401; teste e2e novo (`1388723`) |
| 4 | baixa | `maxlength="72"` truncava em silêncio a senha colada; a mensagem de 400 falava em caracteres | procede | `maxlength` subiu para 1024; a mensagem segue a regra de bytes (`1388723`) |
| 5 | baixa | A sessão expirada tirava a pessoa de qualquer tela, inclusive das fiscais | procede | Só redireciona se a rota tem `meta.requiresSession`; teste novo (`1388723`) |
| 6 | baixa | `verifyAsync` aceita JWT sem `exp` (token eterno, se o segredo vazasse) | procede | O Guard exige `exp`; teste novo (`1388723`) |
| 7 | baixa | `voltar=/Entrar` voltava à tela de entrar (o vue-router ignora maiúsculas) | procede | A comparação passou a ignorar maiúsculas; teste ampliado (`1388723`) |

## Revisor de conformidade

Os 14 critérios foram considerados cumpridos (CA12 e CA14 com teste parcial na
parte de tela) e o checklist da disciplina foi atendido. O revisor não achou
nada implementado fora do escopo.

| # | Sev. | Apontamento | Triagem | Correção |
| --- | --- | --- | --- | --- |
| 1 | média | O PRD descrevia como atual a regra "o apoiador só vê as próprias doações", que é da US11 | procede | A linha do ator agora marca US11 e diz como o pedido é alcançado até lá |
| 2 | baixa | O `architecture.md` dizia que os testes do CI "verificam a ausência de tabelas" | procede | O texto agora diz que conferem as tabelas esperadas |
| 3 | baixa | Faltava teste de que as telas fiscais seguem sem guarda e da reação à expiração | procede em parte | Teste de fronteira do router (`router-session-boundary.test.ts`; provado que falha sem a guarda) e testes de `sessionExpiredRedirect`. O aviso na `SignInView` ficou sem teste automático: foi conferido no aplicativo (print `4-sessao-expirada`). Os testes do desktop não rodam no CI; isso vem de antes desta história e fica registrado |
| 4 | baixa | O plano citava nomes que mudaram na implementação | procede | Nota com os nomes finais no plano |
