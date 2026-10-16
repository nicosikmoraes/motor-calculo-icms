# Manual do usuário e do contador

## 1. Acesso e atividades

No MVP não existe distinção de permissões: todos os usuários da instalação podem executar todas as operações.

### Atividades operacionais

- envia arquivos XML ou ZIP;
- acompanha o processamento;
- consulta resultados e pendências;
- baixa o XLSX.

### Consultar um lote importado

A **Visão geral** mostra notas recebidas, notas com cálculo salvo e itens que
precisam de conferência. Filtre por empresa e pelo mês da importação; o gráfico
pode ser agrupado por empresa ou data. Clique nas barras de uma empresa para
filtrar o painel. **Atualizar** consulta novamente as memórias salvas.

Uma nota é contada como calculada quando todos os seus itens com CFOP iniciado em **6**
têm resultado salvo. O gráfico circular separa notas calculadas, notas aguardando
cálculo, notas sem itens com CFOP iniciado em 6 e notas fora dos totais pela política documental.
Divergências são contadas por item e podem ocorrer em notas já calculadas.
O painel não executa nem modifica cálculos.

Use **Gerenciar empresas** para abrir os cadastros e **Ver histórico** para
consultar todas as importações. Os atalhos em **O que falta conferir** abrem o
lote correspondente. Perfis fiscais, regras, conflitos, revisão documental,
auditoria, transferência de cadastros e backup ficam em **Configurações**.

Abra **Histórico de lotes** para consultar as importações em uma linha do tempo,
agrupadas pelo mês de recebimento. Busque pelo nome do lote, empresa ou CNPJ e
filtre por período, empresa e situação. O resumo no topo considera todo o
histórico; os filtros delimitam a lista. Empresas inativas continuam disponíveis
para consulta. Nos lotes mistos, o filtro de empresa seleciona o lote completo,
preservando as contagens de todas as empresas que ele contém.

Clique em qualquer parte do cartão para abrir o lote. As contagens distinguem
notas recebidas, notas com cálculo salvo, itens pendentes ou divergentes e
arquivos. Revisões documentais, exclusões e diagnósticos aparecem quando existem.
A importação concluída não significa que a conferência fiscal esteja concluída.
Use **Atualizar histórico** para consultar novamente os resultados salvos.

A tela de detalhes reúne empresa, totais, notas e itens, ambiente, arquivos,
hashes, repetições, conflitos e diagnósticos. Esses dados permanecem disponíveis
depois de reiniciar o aplicativo. Importações interrompidas continuam visíveis no
histórico e podem ser retomadas com os arquivos de origem no mesmo local.

O detalhe abre em **Notas e itens**, com a primeira nota expandida. Os produtos
aparecem em cards em sequência, com valor do produto, imposto declarado, imposto
calculado e diferença alinhados. ICMS diferido e FCP-ST aparecem quando existem.
A diferença usa a comparação salva do mesmo produto e componente tributário.
Abra **Dados e memória de cálculo** para conferir respostas, enquadramento e
memória. A identificação completa fica em **Identificação da nota e chave de
acesso**. Os quatro indicadores do topo continuam abrindo as respectivas áreas
e filtros da conferência.

### Exportar produtos para Excel

No detalhe do lote, use **Exportar Excel**. A primeira aba, **Itens**, tem uma linha
por produto de cada nota: nota, série, número do item, código, descrição, ICMS
declarado, ICMS calculado e diferença. NCM, CFOP, valor do produto, empresa, CNPJ,
emissão e chave de acesso também ficam nessa linha. ICMS-ST e FCP-ST têm colunas
próprias, sem repetir o produto em novas linhas. O mesmo produto em notas
diferentes mantém uma linha para cada nota.

Produtos pendentes e excluídos continuam identificados. Cálculos indisponíveis
ficam em branco; memórias preservadas para auditoria aparecem em colunas próprias.
As abas de resumo, divergências e pendências conservam as evidências da
conferência. A exportação mensal usa essa mesma organização, incluindo o lote de
origem de cada produto. O arquivo registra o layout XLSX 6.

### Atividades contábeis

- configura empresas e parâmetros;
- cria e valida perfis fiscais;
- cadastra regras e exceções;
- resolve pendências;
- solicita reprocessamento;
- analisa memória de cálculo.

### Atividades de revisão fiscal

- revisa e publica regras;
- inativa regras por nova vigência;
- acompanha alterações e auditoria.

Esses agrupamentos descrevem atividades, não perfis de acesso. Qualquer usuário pode realizá-las.

## 2. Preparação inicial pelo contador

### 2.0 Configurar o espaço local

No primeiro acesso, informe o nome do escritório ou do responsável pela
instalação. O MVP mantém uma única organização local; o nome pode ser alterado
posteriormente na tela **Empresas**.

### 2.1 Cadastrar a empresa

A tela **Empresas** apresenta a carteira em cartões. Busque por razão social,
nome fantasia ou CNPJ (com ou sem pontuação) e filtre por situação e UF.
Os cartões mostram notas, lotes e itens a conferir, considerando o histórico
completo da empresa. Revisões documentais aparecem separadamente no resumo.

Use **Cadastrar empresa** para abrir o formulário. **Editar** atualiza o cadastro,
mantendo o CNPJ como vínculo permanente com as notas. **Abrir empresa** mostra os
dados cadastrais e o acompanhamento dos cálculos; **Ver lotes** abre diretamente
o histórico daquela empresa. O botão **Abrir lote** leva à conferência completa
do lote, que pode conter documentos de mais de uma empresa.

No detalhe é possível inativar ou reativar o cadastro. A inativação remove a
empresa das novas importações e mantém seus documentos e histórico disponíveis.
Use **Escritório** ou **Editar escritório** para alterar o nome da instalação.

No cadastro inicial, informe CNPJ, razão social e UF; o nome fantasia é opcional.
Quando o cadastro nasce de uma importação, esses dados podem vir preenchidos pelo
XML e precisam ser confirmados. O CNPJ fica bloqueado nesse fluxo.

Inscrição estadual, regime tributário, vigência, regimes especiais e benefícios
próprios são configurados depois no perfil fiscal e não impedem a identificação
inicial da empresa.

### 2.2 Criar perfis fiscais

Na tela **Perfis fiscais**, escolha a empresa. O aplicativo propõe perfis a partir
de produtos ainda sem vínculo nas notas importadas e elegíveis, agrupando apenas
itens com NCM, CEST e origem consistentes. Confira os produtos e confirme a
proposta para criar o perfil e vinculá-los em uma única operação. Itens com dados
ausentes ou divergentes permanecem para análise manual.

Nesta entrega, o perfil é um agrupamento cadastral com nome e vigência: ele ajuda
a localizar o vínculo do produto e poderá participar da seleção de regras futuras.
A proposta não define alíquota, benefício ou tratamento tributário, e não calcula
impostos. Também é possível criar um perfil manualmente. Para notas antigas,
escolha um início de vigência que cubra a data de emissão.

### 2.3 Vincular produtos de fornecedores

Associe `CNPJ do fornecedor + código do produto` ao perfil da empresa. Isso pode
ser feito manualmente em **Perfis fiscais** ou pelo botão **Vincular** no item do
detalhe de um lote. O detalhe mostrará **Classificado**, **Pendente** ou **Fora
da vigência**. Alterar um vínculo atualiza a classificação exibida em lotes
anteriores; não altera o XML nem calcula tributos. O histórico versionado dos
vínculos fica para uma entrega posterior.

### 2.4 Cadastrar regras

Defina condições, resultados, prioridade, vigência e fundamento legal. Salve como rascunho, valide com casos de teste e publique.

Antes de publicar, confirme:

- UFs e tipo de operação;
- NCM/CEST ou perfil abrangido;
- regime, contribuinte e consumidor final;
- finalidade e origem da mercadoria;
- composição da base e IPI;
- alíquota, redução, diferimento e benefício;
- ST, DIFAL e FCP quando aplicáveis;
- início e fim da vigência;
- prioridade diante de regras similares.

### 2.5 Homologar

Use notas com memória de cálculo previamente aprovada. Compare item a item e publique somente após alcançar os resultados esperados.

## 3. Processar um lote

1. Acesse **Novo lote** e selecione XMLs individuais ou um ZIP.
2. O sistema identifica empresas cadastradas pelo CNPJ do XML. Nas compras
   com ST destinadas ao Paraná, sugere a compradora; nos demais casos, usa a
   única empresa compatível ou pede a escolha quando há duas possibilidades.
3. Para cada nota ainda sem empresa, cadastre o CNPJ necessário e confirme a
   associação. O cadastro rápido traz CNPJ, nome e UF do XML, e a empresa salva
   já fica associada às notas correspondentes. O cadastro não é criado sem envio.
4. Confirme o ambiente e processe o lote. Um mesmo ZIP pode conter empresas
   diferentes, mas nenhuma nota reconhecida é processada sem associação.
5. Acompanhe o contador de entradas durante a inspeção e o processamento. Use
   **Cancelar** para parar após a entrada atual. Na inspeção não há lote salvo;
   durante o processamento, os arquivos e diagnósticos já lidos ficam em um
   lote `CANCELADO`. Para processar os restantes, inicie nova importação.
6. Abra os detalhes do lote para conferir documentos, protocolos, eventos e pendências.

Protocolos e eventos XML podem vir no mesmo ZIP das notas ou em arquivos avulsos.
Se o lote contiver somente protocolos/eventos, escolha a empresa responsável.
O histórico indica se cada artefato foi associado a uma nota do lote, ficou órfão
ou tem associação ambígua. Essa associação ainda não altera o resultado fiscal
nem os totais; a revisão dos efeitos documentais será feita em etapa posterior.

O usuário não informa alíquota, finalidade ou tratamento durante o envio. O sistema usa os cadastros previamente aprovados.

## 4. Interpretar o resultado

### Cálculo automático dos parâmetros do XML

Após importar, o aplicativo grava o cálculo somente dos itens cujo **CFOP começa
com 6** e que têm dados suficientes. A presença de ICMS declarado não seleciona
o item: sem esse valor, ele continua elegível, mas fica pendente se faltar um
dado necessário à fórmula. Em notas com CFOPs diferentes, cada produto segue
seu próprio CFOP. Os demais produtos permanecem visíveis na nota e no Excel,
com o motivo da exclusão e sem participar dos totais calculados. Memórias
anteriores são preservadas para auditoria. Nas compras com ST declarada que correspondem a uma única
linha do catálogo vigente, obtém a MVA por NCM, CEST e data e combina com as
alíquotas e valores do XML. O resultado aparece como **Calculado por XML e
catálogo**. A tela mostra a origem dos percentuais, sem pedir que sejam
digitados novamente. Os demais cenários cobertos podem aparecer como
**Calculado pelo XML**, conferindo os parâmetros declarados.
Esse cálculo confere a declaração recebida. A revisão do enquadramento pelas
regras fiscais continua disponível em **Revisar enquadramento fiscal**.

Na aba **Revisão**, ficam os itens com dados ausentes ou divergências, incluindo
os que já foram calculados automaticamente. Se a tabela indicar 47,77% e o
XML declarar 0%, o cálculo por catálogo usa a tabela e mostra a divergência de
MVA em percentual. A conferência exclusiva dos parâmetros declarados mantém
a margem do XML. Uma alteração manual de MVA é aceita e suas diferenças são
calculadas, preservando o histórico.
Modalidades não suportadas continuam com o motivo da pendência. Respostas
manuais anteriores são preservadas. O XLSX traz o CNPJ da empresa no cabeçalho,
nas linhas da conferência e no nome sugerido para o arquivo.

**Salvar e calcular** indica junto a cada campo o dado ausente ou inválido e
leva o foco ao primeiro problema. **Salvar rascunho** guarda respostas
incompletas e informa que o cálculo continua pendente. Na alíquota interna,
**Usar valor do XML** restaura o percentual de pICMSST e indica que o FECOP
está separado. Um cálculo concluído avança a fila; divergências continuam
disponíveis para conferência.

### Conferir e calcular com menos perguntas

Na aba **Revisão**, os itens sem cálculo permanecem disponíveis para revisão,
inclusive os que ficaram fora do escopo depois de uma resposta. A tela informa o
motivo e permite corrigir as respostas quando a operação estiver coberta.

Em operações comuns internas no Paraná, escolha a destinação e revise a
confirmação resumida: destinatário fora da construção civil, produto que não é
petróleo/combustível e enquadramento comum de 19,5%, com diferimento quando
aplicável. **Confirmar cenário e calcular** registra sua confirmação dessas
condições. Os dados lidos do XML ficam disponíveis em **Dados já lidos da nota**;
o indicador de consumidor final orienta a destinação sem escolher entre
uso/consumo e ativo, ou entre revenda e industrialização. Para exceções, abra as
perguntas individuais.

Quando houver itens ainda sem cálculo com o mesmo contexto fiscal na nota,
**Onde aplicar esta confirmação?** oferece os itens compatíveis e mostra os
códigos que receberão as respostas. Confira se as condições declaradas e a
destinação valem para todos eles. Cada produto mantém sua base, seus encargos,
seu rateio e sua memória de cálculo. Itens já calculados são preservados.
Essa opção não cria uma definição para notas futuras.

Para um produto recorrente, a opção **Nas próximas notas desta empresa, para
este produto do fornecedor** continua disponível no ICMS próprio. As próximas
notas compatíveis reaproveitam a definição salva; mudanças no contexto exigem
nova conferência. ICMS-ST mantém as confirmações de incidência e de enquadramento
por operação.

### Calculada aderente

Todos os itens foram calculados e as diferenças estão dentro da tolerância.

### Calculada divergente

Todos os itens foram calculados, mas pelo menos um valor declarado diverge do calculado.

### Pendente

Um ou mais itens não possuem conclusão segura. O total eventualmente exibido é parcial e não deve ser tratado como resultado definitivo.

### Erro

O arquivo não pôde ser interpretado ou houve falha impeditiva. Consulte a mensagem e envie um XML válido.

### Resultado provisório ou diagnóstico

O sistema conseguiu calcular, mas o documento não integra o total definitivo. Exemplos: contingência ainda sem autorização final, cancelamento, rejeição ou operação não realizada. Consulte `incluida_no_total` e o motivo apresentado.

### Cancelada

A nota continua visível e possui memória de cálculo para auditoria, mas seus valores não participam dos totais.

### Pendente de revisão de CC-e

O sistema calculou pelo XML original e não alterou campos com base no texto livre da carta. Um contador deve revisar e decidir se aprova o cálculo original.

### Complementar

O valor da nota complementar é adicional e não substitui a original. Quando ambas estiverem disponíveis, o sistema apresenta o vínculo e o total combinado.

### Devolução

Os valores permanecem positivos na memória, enquanto o efeito de estorno aparece com sinal na consolidação, de acordo com a regra aplicada.

## 5. Resolver pendências

Abra **Pendências**, filtre pelo lote e escolha um item. O sistema deve mostrar:

- dados do XML;
- perfis e regras considerados;
- informação ausente ou conflito;
- ação sugerida.

Ações típicas:

- vincular produto a perfil fiscal;
- corrigir classificação validada;
- criar regra inexistente;
- ajustar prioridade entre regras;
- cadastrar finalidade padrão;
- registrar exceção específica.
- complementar um campo autorizado ausente no XML, sem modificar o arquivo original.

Após resolver, publique a alteração quando necessário e use **Reprocessar**. O novo resultado ficará vinculado ao anterior para auditoria.

Quando a pendência for `INFORMACOES_FALTANTES`, o sistema indica quais campos
podem ser complementados. O valor informado pelo usuário fica identificado como
dado complementar e a nota continua preservando os valores originais do XML.

## 6. Manter regras com segurança

- Nunca altere retroativamente uma regra publicada.
- Crie nova versão com nova vigência.
- Registre o fundamento legal.
- Use regra específica apenas quando a geral não for suficiente.
- Teste antes de publicar.
- Revise periodicamente regras próximas do fim de vigência.

## 7. Planilha entregue

### `Resumo_Notas`

Use para visão gerencial: uma linha por NF-e, totais declarados/calculados, diferenças e status.

### `Detalhamento_Itens`

Use para auditoria: uma linha por item com bases, alíquotas, valores, regra e status.

### `Pendencias`

Use como fila de trabalho fiscal. Cada linha informa o problema e a ação sugerida.

### `Regras_Aplicadas`

Use para rastrear versão, vigência e fundamento das regras do relatório.

### `Erros_XML`

Use para corrigir arquivos inválidos, formatos não suportados ou duplicidades.

O desenho definitivo da planilha ainda será aprovado. Ela também deverá apresentar situação documental, participação no total, eventos e referências entre documentos.

## 8. Boas práticas

- Envie XML autorizado, não DANFE/PDF.
- Não renomeie ou edite manualmente o conteúdo do XML.
- Resolva pendências antes de utilizar totais fiscais.
- Confira a empresa selecionada antes do upload.
- Preserve o XLSX junto da identificação do lote.
- Mantenha acesso aos XMLs originais conforme a política da organização.
- Verifique a coluna de participação nos totais antes de usar o resultado.
- Não trate subtotal provisório ou cálculo diagnóstico como total fiscal definitivo.
- Arquivos de homologação devem ser processados em lote de teste separado.

## 9. Retenção dos XMLs

O período padrão de retenção do XML original será de um mês e poderá ser configurado. O aplicativo deverá avisar e registrar a exclusão conforme a política que ainda será detalhada. Resultados e evidências que precisem permanecer para auditoria serão definidos antes da implementação do expurgo.

## 10. Exportar configurações

1. Acesse **Configurações > Exportar dados**.
2. Selecione empresas e cadastros desejados.
3. Revise as quantidades mostradas.
4. Escolha o destino do arquivo `.icmspack`.
5. Compartilhe o pacote apenas com pessoas autorizadas.

O pacote de configuração não inclui XMLs, resultados ou relatórios.

## 11. Importar configurações

1. Acesse **Configurações > Importar dados**.
2. Selecione o `.icmspack` recebido.
3. Aguarde a validação de formato, versão e integridade.
4. Revise registros novos, ignorados, atualizáveis e conflitantes.
5. Resolva os conflitos apresentados.
6. Confirme a importação.

Se houver falha, o banco permanece como estava. Importar um pacote não cria sincronização contínua com a máquina de origem.

## Backup manual e diário

Abra **Backup** na navegação e clique em **Criar backup manual**. Escolha uma
pasta de destino. Após concluir e validar a primeira cópia, o aplicativo ativa
backups diários às 23h do computador nessa pasta. Para mudar o destino, faça outro
backup manual na nova pasta. Cancelar o seletor não altera o agendamento.

O aplicativo precisa estar aberto para executar o agendamento. Se estiver fechado
ou o computador suspenso, faz a cópia diária pendente ao abrir/retomar. A tela
mostra destino, última cópia e erros; após falha automática tenta novamente em
15 minutos. A execução cria uma pasta nova. Por padrão mantém sete cópias automáticas; cópias manuais concluídas são preservadas.

A cópia inclui os dados persistidos do banco, com manifesto e hash de integridade.
Não inclui XML/ZIP de origem, relatórios externos nem temporários. Guarde esses
arquivos separadamente quando precisar dos originais. Escolher unidade externa
ou pasta sincronizada permite guardar a cópia fora do computador; a sincronização
é responsabilidade da ferramenta escolhida. Use **Restaurar backup…** para recuperar os dados persistidos do banco.

## Pausar e recuperar uma importação

Durante o processamento de um novo lote, escolha **Pausar e retomar depois**.
As entradas já preparadas ficam em disco; a importação pendente aparece no
**Histórico**, onde **Retomar importação** continua a operação. O lote só aparece
como importado após a confirmação da transação final. Durante essa gravação final
não é possível pausar. **Cancelar** mantém seu comportamento anterior: salva um
lote parcial cancelado e não equivale a pausar.

Se o aplicativo fechar ou o worker interromper inesperadamente durante a preparação,
abra o Histórico e retome a importação pendente. Mantenha XMLs/ZIPs no caminho
original: a retomada verifica SHA-256 de todas as fontes e bloqueia conteúdo
alterado, preservando o ponto de recuperação. Entradas preparadas são reutilizadas;
ZIPs ainda são percorridos para verificar segurança e alcançar as entradas restantes.
Os checkpoints não fazem parte do backup SQLite; termine ou retome a importação
antes de depender apenas de um backup para transferir a instalação.


## Restaurar dados e gerenciar retenção

Em **Backup** ou na tela de primeiro acesso, escolha **Restaurar backup…** e selecione a pasta de uma cópia
concluída (a pasta que contém `manifest.json` e `motor-icms.sqlite`). O aplicativo
verifica formato, SHA-256, integridade do SQLite, referências e compatibilidade
do histórico de migrations. Backups antigos compatíveis são atualizados em uma
cópia separada; o original é preservado.

Depois da validação, a confirmação mostra a data da cópia e informa que os dados
atuais serão substituídos. Cancelar mantém a instalação atual. Ao confirmar,
o aplicativo cria um snapshot de segurança em `userData/backups/pre-restore-*.sqlite`,
troca o banco e reinicia. Lotes ativos precisam ser pausados ou concluídos antes
da restauração. Se a troca for interrompida, o registro de recuperação permite
voltar automaticamente ao estado anterior na próxima abertura.

O backup e a restauração abrangem os dados do SQLite. XMLs/ZIPs externos,
relatórios, preferências de agendamento e pontos de importações pendentes não são
substituídos. Cópias de segurança anteriores à restauração são mantidas.

A retenção padrão é **7 cópias automáticas**, confirmada pelo responsável em
04/10/2026. O campo permite de 1 a 365 cópias; **0** desativa o expurgo de cópias.
Salvar a política não apaga imediatamente: ela é aplicada na manutenção seguinte.
A limpeza acompanha os backups e a verificação diária com o aplicativo aberto.
Somente pacotes automáticos válidos identificados como desta instalação entram
no expurgo. Manuais, pacotes antigos sem identificação, pacotes corrompidos e
arquivos de terceiros permanecem.

A manutenção também limpa fragmentos e snapshots órfãos de importação abandonados
por mais de 24h, pastas parciais de backup desta instalação com mais de 24h e pontos
de lotes já gravados. Snapshots referenciados por checkpoints e importações
pendentes são preservados. A tela informa a última limpeza e eventuais falhas;
remoções são registradas no log local `maintenance.jsonl`, com rotação limitada.
Esta política não apaga documentos fiscais nem arquivos de origem.


## Conferência mensal entre lotes

Abra **Conferência mensal**, escolha a empresa e o mês de emissão e clique
em **Consultar / atualizar**. O mês vem da data original do XML, mesmo quando
a nota foi importada em outro mês. Empresas inativas também podem ser consultadas.

A tela reúne os últimos cálculos salvos em todos os lotes. Compras, vendas,
ambientes e protocolos permanecem separados. Os contadores mostram ocorrências
de notas; cópias excluídas aparecem no detalhamento, mas não somam valores.
Cópias idênticas são contabilizadas uma vez. A mesma chave com conteúdos
diferentes fica fora dos valores até revisão. Eventos relacionados em outros
lotes também exigem revisão documental, sem associação automática.

Em **Rastreabilidade**, use **Abrir nota e item no lote de origem** para
conferir a memória e as respostas do item destacado. Retorne à tela mensal e
clique em **Consultar / atualizar** para refletir alterações de cálculos.
Notas sem empresa ou data válida devem ser revisadas no histórico dos lotes.

**Exportar Excel mensal** consulta novamente os resultados e salva apenas
a empresa e o mês selecionados. As abas básicas são Resumo, Itens, Divergências,
Pendências e exclusões e Lotes. Quando há eventos relacionados, também aparece
Eventos e revisões. As linhas detalhadas identificam o lote de
origem. Cancelar o seletor mantém o destino anterior. Conclua ou pause a
importação antes de consultar ou exportar.

A conferência mensal não concede créditos de compras nem informa saldo final
a recolher. Esses tratamentos dependem de definição e validação fiscal.

## Revisão documental entre lotes

Abra **Revisão documental** para conferir eventos, mesmo quando a nota foi
importada em outro lote. A lista oferece busca por chave, nota, protocolo ou texto,
filtros por empresa e situação e acesso ao lote do evento e à nota original.
O Histórico e a Conferência mensal também oferecem links para essa revisão.

1. Em **Conferir associação**, confira chave, ambiente, protocolo e nota. Registre
   uma justificativa e confirme. Cancelamento confirmado mantém a nota fora dos
   totais; a memória salva permanece disponível para auditoria.
2. Para CC-e, leia o texto, confira a nota e use **Concluir revisão de CC-e**.
   Confirme expressamente o uso do XML original e registre o motivo. O aplicativo
   não transforma o texto da correção em alterações dos dados fiscais.
3. Use **Reabrir revisão** na CC-e mais recente para recolocar a pendência.
   Decisões anteriores permanecem no histórico com data, usuário e computador.
4. Consulte novamente o mês para ver os totais atualizados. A exportação sempre
   captura uma conferência nova; planilhas já exportadas permanecem intactas.

Uma nova CC-e exige nova revisão. Cancelamento, conflito de conteúdo, erro XML/XSD,
retorno inconsistente ou evento com efeito ainda não coberto mantém a exclusão.
Revisão concluída não elimina outras pendências nem duplica notas entre lotes.
A tela usa evidências locais e não consulta a SEFAZ nem verifica assinaturas.

O Excel inclui **Eventos e revisões** quando há eventos relacionados: protocolo,
data, texto, origem e decisões. Em **Itens**, as colunas de valores salvos para
auditoria conservam base e ICMS, inclusive em notas excluídas. Esses valores não
são acrescentados aos totais do resumo.


## Conflitos entre versões da mesma nota

Abra **Conflitos de notas** para encontrar arquivos de mesma chave e ambiente
com conteúdos diferentes, dentro de um lote ou entre lotes. Filtre por empresa,
situação, chave, número ou arquivo. Histórico, Conferência mensal e Revisão
documental oferecem acesso à comparação.

1. Clique em **Comparar versões** e escolha os dois arquivos nos seletores.
   Confira origem, empresa, datas e as diferenças por campo. Os itens são
   alinhados pelo número; **Não informado** permanece diferente de zero.
2. Use **Escolher primeira versão** ou **Escolher segunda versão**. Registre a
   justificativa e confirme expressamente a escolha antes de gravar.
3. Atualize a conferência mensal. Só o conteúdo escolhido pode participar dos
   totais, e suas cópias idênticas são contadas uma vez por empresa. A ocorrência
   escolhida é preferida quando elegível; cada lote mantém seu resumo próprio.
4. Use **Reabrir conflito** para suspender a escolha, explicando o motivo.
   As decisões anteriores permanecem no histórico com data, usuário e computador.

A escolha vale para o conteúdo da mesma chave e ambiente na organização atual.
Uma nova versão diferente exige nova análise. Uma cópia idêntica não desfaz a
escolha. A entrada de arquivos ou decisões durante a conferência da tela exige
atualizar e comparar novamente antes de salvar.

Escolher uma versão não altera o XML nem cria cálculo. Quando a única restrição
era a ocorrência conflitante, a versão escolhida pode seguir para análise fiscal.
Perguntas fiscais e outras pendências continuam aplicáveis. Cancelamento ou
denegação reconhecidos em qualquer versão mantêm a exclusão. CC-e vinculada a
um conteúdo descartado exige confirmar o vínculo à versão escolhida e revisá-la
novamente. Nenhum arquivo ou cálculo anterior é removido.

O Excel acrescenta **Conflitos e decisões** quando houver conflitos relacionados,
com conteúdo, arquivo e lote de cada ocorrência, escolha vigente e histórico.
Memórias salvas para auditoria continuam separadas dos valores totalizados.
