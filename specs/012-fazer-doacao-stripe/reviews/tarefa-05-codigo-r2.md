**APROVADO.** O teste novo cobre falha transacional determinística e agora verifica o rollback integral, incluindo `payment_intent_id`, timestamps e ausência do evento com o ID injetado. Também cobre reentrega concorrente e IDs distintos para a mesma sessão. A mudança é somente teste de banco; não há alterações de produção.

Sugestão não bloqueante: o `ALTER TABLE` pode adquirir um lock global breve se outras specs usarem o mesmo banco em paralelo. Não executei testes.
