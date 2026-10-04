# Desempenho e recuperação de lotes

Verificação de 04/10/2026 no ambiente Linux de desenvolvimento. CPU Intel Core
i5-11400F, Node 24.14.0. Massa sintética de XMLs NF-e/NFC-e preparada a partir da
fixture do repositório, com 1.000 documentos distintos. Dados do usuário não foram
acessados. Não é homologação fiscal nem comparação de velocidade com uma versão
anterior.

| Cenário | Tempo total | Pico RSS do processo | Maior atraso do heartbeat principal | Documentos finais |
| --- | ---: | ---: | ---: | ---: |
| 1.000 notas, importação normal | 68,777 s | 174,9 MiB | 2 ms | 1.000 |
| 1.000 notas, término forçado do worker e retomada | 67,896 s | 181,6 MiB | 2 ms | 1.000 |

No segundo cenário, o worker foi terminado após aproximadamente 50 entradas e um
novo worker retomou o manifesto preservado. A identidade final corresponde ao
ponto de recuperação. A contagem do SQLite e a contagem retornada pela operação
coincidiram em 1.000. O tempo inclui a preparação inicial até a interrupção e a
retomada; não é uma demonstração de ganho comparativo entre os dois cenários.

O heartbeat de 20 ms executou 3.424 vezes na importação normal e 3.378 vezes no
cenário de retomada. Mede disponibilidade do event loop do processo controlador,
não latência de renderização da interface. RSS é memória do processo Node inteiro,
incluindo threads e workers de validação XSD; não é memória isolada do worker de
importação. Metadados e catálogo crescem com o lote; as notas normalizadas são
lidas uma a uma do estágio durante a persistência.

Também foi executado o worker compilado no runtime Electron instalado, em modo
`ELECTRON_RUN_AS_NODE=1`: 3 notas importadas em 543 ms, Node 22.22.0, contagem final
correta. Isso verifica os recursos XSD e a conexão SQLite no runtime Electron sem
abrir a interface. Instalação Windows e renderização da interface ainda precisam
de homologação.

## Reprodução

```bash
pnpm build
node scripts/benchmark-import.mjs 1000
node scripts/benchmark-import.mjs 1000 --recover
ELECTRON_RUN_AS_NODE=1 apps/desktop/node_modules/electron/dist/electron scripts/benchmark-import.mjs 3
```

## Regressão automatizada

`pnpm check` passou com a implementação combinada de backup e recuperação.
Os testes de recuperação exercitam pausa e retomada de XMLs, leitura de ZIP após
pausa, preservação após exceção, bloqueio por SHA-256 de fonte alterada e
classificação final de repetidas sem duplicação adicional. Os testes do banco
continuam cobrindo transação, rollback e reabertura. O cancelamento continua
salvando um lote parcial cancelado; pausa conserva os checkpoints até conclusão.

## Limites da entrega

- A inspeção inicial, consulta detalhada e reavaliação ainda usam o processo principal.
- Só uma inspeção/importação pode estar ativa; não há promessa de vazão paralela.
- A retomada exige os arquivos originais disponíveis nos mesmos caminhos.
- ZIPs são percorridos novamente para segurança, reutilizando normalização já preparada.
- Os checkpoints ainda não confirmados não integram o backup SQLite.
- Windows, massa anonimizada real, volume de itens por nota e limites extremos de ZIP
  continuam pendentes de medição e homologação. Não foi fixada uma meta comercial
  de tempo ou consumo de memória.
