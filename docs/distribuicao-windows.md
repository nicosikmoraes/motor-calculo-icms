# Distribuição Windows inicial

O instalador de teste é NSIS x64, por usuário, com escolha de pasta, sem exigir
instalação por máquina. `pnpm --filter @motor/desktop dist:win` gera o `.exe`
em `apps/desktop/release`. O pacote inclui main, preload, renderer, worker de
importação e dependências de produção, incluindo o runtime WASM. Os schemas
usados na ingestão estão embutidos no worker pelo build.

A configuração mantém os dados do aplicativo durante a desinstalação.
O instalador inicial não possui assinatura de código; a assinatura e o canal de
atualização permanecem pendentes. Não há publicação automática de release.
Esta primeira distribuição é para validação, não declara homologação fiscal
nem compatibilidade com todas as versões de Windows.

## Verificação no GitHub Actions

`.github/workflows/windows.yml` roda em Windows Server 2022 x64:

1. Instala dependências pelo lockfile e executa tipagem, testes e build.
2. Executa os 16 testes de backup, retenção, restauração e handlers no runtime
   do Electron, incluindo agendamento às 23h, atualização após reabertura,
   preservação de manuais, corrupção e recuperação de troca interrompida.
3. Gera o instalador e instala silenciosamente em uma pasta com espaço.
4. Abre o aplicativo instalado e verifica o renderer e a opção de restauração
   do primeiro acesso pelo protocolo de depuração do Chromium.
5. Usa o executável instalado para importar cinco notas sintéticas com o
   worker distribuído, interromper e retomar o lote e conferir o SQLite final.
6. Guarda `.exe` e SHA-256 como artefato do workflow por 14 dias.

A depuração é habilitada apenas pelo script no runner descartável. O produto
não abre a porta de depuração por padrão. Os testes usam dados sintéticos.

## Validação operacional que continua necessária

Em um computador Windows de uso real, testar escolha de pasta nos diálogos
nativos, backup manual, execução diária com aplicativo aberto, recuperação no
próximo início, confirmação e cancelamento da restauração e conferência dos
dados recuperados. Testar também atualização de uma instalação anterior,
rollback, permissões e comportamento do antivírus. A suíte automatizada em
Windows Server não substitui essa verificação em Windows de usuário final.
