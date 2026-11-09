# Decisão humana — Tarefa 6, rodada 2

**Achado de arquitetura — aceito.** O usuário autorizou corrigir a falha conclusiva de criação sem sessão, que não permitia abrir uma nova operação embora CA4/CA9 permitam nova tentativa para rejeição conclusiva, exceto `VALOR_NAO_ACEITO`.

**Limite do processo:** o usuário autorizou corrigir e validar sem terceira revisão formal, pois a rodada 2 já foi usada.

**Correção aplicada e validação:** o caso de uso agora permite que uma identidade nova chegue à reserva de retry quando a tentativa mais recente está `falha_na_criacao` com motivo diferente de `VALOR_NAO_ACEITO`. Repetir a identidade anterior retorna a mesma tentativa falha sem nova chamada ao gateway. Resultado: teste de tentativas end-to-end 19/19, teste PostgreSQL de tentativas 6/6, typecheck, lint e `git diff --check` aprovados.

**Sugestão não bloqueante de conformidade:** testar diretamente a borda da janela de 23 horas. Não adotada nesta rodada; os testes atuais cobrem replay dentro de um minuto e bloqueio após 25 horas. A rodada formal continua encerrada.
