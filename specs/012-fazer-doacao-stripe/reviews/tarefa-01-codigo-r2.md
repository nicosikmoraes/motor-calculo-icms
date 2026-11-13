**APROVADO.** Os três guias agora geram o cliente Prisma e aplicam a migration antes da verificação do schema e dos testes de persistência. A ordem confere com os scripts da API e o workflow, e o PostgreSQL local usa um volume próprio, separado do SQLite fiscal.

A revisão foi somente leitura. `git diff --check` passou para os três guias. A execução dos testes em PostgreSQL descartável foi verificada pelo relato da rodada.
