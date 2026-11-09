# Decisões da triagem — Tarefa 9, rodada 1

| Apontamento | Decisão | Ação |
| --- | --- | --- |
| O teste integrado HTTP usava repositórios simulados e não provava persistência/consulta pela mesma intenção. | Corrigido. | Adicionado `donations.integration.db-spec.ts` com AppModule, repositórios Prisma reais, webhook assinado, consultas HTTP e PostgreSQL descartável. |
| Faltava recusa assinada seguida de retomada e consulta no fluxo integrado. | Corrigido. | Segundo cenário no mesmo arquivo percorre recusa assinada, verificação de expiração, POST de retry e GET do histórico. |
| A demonstração manual com cartão Stripe de teste está pendente. | Limitação externa registrada. | Documentada como não executada; não declarar a atividade concluída até configurar credenciais e registrar o resultado. |
