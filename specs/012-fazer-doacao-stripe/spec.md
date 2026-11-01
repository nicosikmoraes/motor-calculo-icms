---
issue: 12
status: rascunho
---

# US09 — Fazer doação pelo Stripe

Fonte: [PRD, US09](../../docs/prd.md#us09), regras RN-036 a RN-039.
Jornada: [Doar sem confundir intenção com pagamento](../../docs/user-flows.md#jornada-doacao).
Recorte técnico existente: [arquitetura](../../docs/architecture.md) e [Atividade 08](../../docs/atividade-08.md).

## O problema

O apoiador quer contribuir com o ContabiliNico e saber se sua doação foi
confirmada. Hoje não existe fluxo funcional de doação: há apenas um protótipo e
a infraestrutura da API. Uma intenção, um retorno do navegador ou uma tentativa
recusada não demonstram recebimento; perder essa distinção pode mostrar uma
doação inexistente como paga ou induzir a pessoa a repetir um pagamento.

## A história

**Como** apoiador do projeto, **eu quero** fazer uma doação pelo Stripe
**para que** eu possa contribuir com o ContabiliNico de forma simples.

O texto acima é o da US09 do PRD. O fluxo é independente do cálculo de ICMS e
usa exclusivamente o ambiente de testes do Stripe. As definições abaixo
detalham os quatro critérios do PRD; não afirmam disponibilidade em produção.

Decisões tomadas nesta especificação, por delegação do autor:

- Doação avulsa por cartão no Checkout hospedado; sem cadastro de apoiador.
- Valor em BRL, em centavos exatos, com até duas casas decimais. O mínimo
  operacional é R$ 0,50, conforme a documentação do gateway para BRL sem
  conversão. Esse limite explicita uma restrição que o PRD resumiu como
  "valor positivo"; não se promete abrir Checkout para R$ 0,01.
- Pedido e tentativa são registros distintos. O pedido fica `pendente` até a
  confirmação válida e depois `pago`; a tentativa pode estar `pendente`,
  `recusada`, `expirada`, `falha_na_criacao`, `indeterminada` ou `paga`. O valor e a moeda do pedido
  não mudam; outro valor exige outra intenção explícita.
- Um pedido tem, no máximo, uma sessão utilizável por vez. Uma recusa no
  Checkout pode permitir outra entrada de cartão na mesma sessão; uma nova
  tentativa com sessão diferente só nasce quando a anterior estiver
  comprovadamente expirada e não paga, ou existir prova de que nenhuma sessão
  foi criada. Sessão concluída aguarda webhook; resultado incerto bloqueia nova sessão.
- Antes da primeira requisição, a interface guarda localmente uma chave de
  intenção aleatória e não enumerável e a identidade da operação inicial. A
  chave funciona como credencial portadora para consultar ou retomar apenas esse
  pedido, sem login; seu detentor tem esse acesso. Ela não aparece em URL, logs
  ou metadados enviados ao Stripe. Não há listagem pública de pedidos, conta,
  dados do apoiador ou associação com empresas fiscais.

## Critérios de aceite

**CA1 — Criar a intenção e abrir o Checkout.** **Dado** um valor de pelo menos
R$ 0,50, representável em centavos e aceito pelo gateway de testes, **quando** o
apoiador confirma a intenção na área "Apoiar o projeto", **então** existe um
pedido identificável em BRL com valor imutável, uma tentativa vinculada e uma
sessão de Checkout de testes para exatamente esse valor; a interface permite
abrir essa sessão e mostra o pedido como `pendente`.

**CA2 — Rejeitar valor inválido sem iniciar cobrança.** **Dado** valor vazio,
zero, negativo, não numérico, com mais de duas casas decimais, inferior a
R$ 0,50 ou moeda diferente de BRL, **quando** ocorre confirmação, **então** o
servidor rejeita a entrada sem criar pedido, tentativa ou sessão; a interface
indica o campo e mostra "Informe um valor em reais de pelo menos R$ 0,50, com
até duas casas decimais". Se um valor ultrapassar limite adicional do gateway,
o pedido preserva o valor, a tentativa fica `falha_na_criacao` com o motivo
`VALOR_NAO_ACEITO`, nenhuma sessão é apresentada como utilizável e a interface
informa "Valor não aceito pelo serviço de pagamentos". Outra quantia exige nova
intenção, sem alterar o valor desse pedido.

**CA3 — Repetir a mesma operação sem duplicar.** **Dado** a mesma chave de
intenção, identidade da operação e valor/moeda, **quando** há duplo clique,
requisições concorrentes ou repetição após perda da resposta, **então** a criação
inicial produz apenas um pedido e uma primeira tentativa, e uma operação de
retomada produz no máximo a tentativa permitida pelo CA9. Repetir a operação
retorna seu mesmo resultado e sessão se conhecidos. Reutilizar a identidade da
operação com outros parâmetros é rejeitado sem modificar o pedido nem chamar
o gateway novamente. Uma ação explícita para nova tentativa usa outra
identidade de operação, preservando a chave de intenção e o pedido.

**CA4 — Tratar a resposta perdida do gateway.** **Dado** um pedido cuja criação
de sessão terminou em timeout ou resultado incerto, **quando** o apoiador
consulta ou retoma a operação, **então** o pedido continua não pago, a tentativa
fica `indeterminada` até resolução e a interface mostra "Não foi possível
confirmar a abertura do pagamento. Consulte o pedido antes de tentar novamente".
Nas primeiras 24 horas contadas do instante persistido imediatamente antes do
primeiro envio da operação ao gateway, retomar usa a mesma operação e seus
mesmos parâmetros. Após essa janela, sem evidência conclusiva, não se cria outra
sessão automaticamente nem se libera nova tentativa nesse pedido; a interface
mostra "Pagamento em verificação; nenhuma nova tentativa foi aberta".
Conciliação pode recuperar a sessão original e seu vínculo, mas não marcar o
pedido pago: isso continua reservado ao webhook válido do CA5. Sessão aberta
recuperada volta a ser utilizável; sessão expirada e não paga permite o CA9;
sessão concluída aguarda webhook. Uma resposta conclusiva de rejeição antes de
criar sessão encerra a incerteza: a tentativa fica `falha_na_criacao`, com motivo
e evidência operacional mínima da rejeição, e permite outra operação nas
condições do CA9. Isso não é recusa de cartão e não depende de webhook de falha
de pagamento. Ausência de resposta ou de resultado em busca não prova que a
sessão não foi criada.

**CA5 — Confirmar somente uma evidência válida e correspondente.** **Dado** um
webhook com assinatura válida do ambiente de testes que confirma sessão paga,
associada ao pedido e à tentativa existentes, com valor e BRL correspondentes,
**quando** o processamento e sua persistência terminam, **então** a tentativa e
o pedido ficam `pagos` uma vez, com identificador do gateway e instante da
confirmação; uma consulta passa a mostrar "Doação confirmada". O webhook pode
chegar antes de a resposta da criação ter sido gravada: nesse caso os IDs de
pedido e tentativa previamente persistidos, enviados como metadados não secretos
na criação, permitem recuperar e conferir a sessão no gateway antes de vinculá-la
e confirmar, sem duplicação. Sessão ainda não vinculada localmente é diferente
de sessão já vinculada a outro pedido, que deve ser rejeitada.

**CA6 — Não confiar em evento inválido ou divergente.** **Dado** webhook sem
assinatura válida, de produção, de pedido desconhecido, com sessão não
correspondente, valor/moeda divergentes ou sem confirmação de pagamento,
**quando** ele é recebido, **então** ele não confirma nem altera silenciosamente
valor, moeda ou vínculo de pedido existente. Uma divergência verificável é
registrada apenas com identificadores e motivo, sem dados de cartão ou fiscais;
eventos desconhecidos não criam pedidos.

**CA7 — Processar duplicação e falha de persistência.** **Dado** a mesma
confirmação entregue de novo, em paralelo ou com outro ID de evento para a mesma
sessão, **quando** os webhooks são processados, **então** existe uma única
confirmação do pedido e uma única transição da tentativa para `paga`.
**Dado** falha no banco durante essa transição, **quando** o processamento
termina, **então** não sobra atualização parcial nem confirmação de recebimento
com sucesso; a reentrega consegue concluir a operação.

**CA8 — Voltar ou abandonar sem fingir pagamento.** **Dado** Checkout aberto,
**quando** o apoiador cancela, fecha a janela, volta à tela de sucesso ou perde a
conexão sem confirmação válida já persistida, **então** o pedido permanece
`pendente` e a interface mostra "Aguardando confirmação do pagamento". O retorno
do navegador não confirma nem cancela o pedido no servidor. Se a confirmação
já foi persistida, a consulta mostra `pago`, mesmo após esse retorno.

**CA9 — Recusa e retomada preservam o histórico.** **Dado** uma tentativa
recusada, expirada ou com `falha_na_criacao` e pedido ainda pendente, **quando** o apoiador escolhe tentar novamente,
**então** a tentativa anterior e sua recusa permanecem rastreáveis. Se sua sessão
ainda aceitar pagamento, ela é reutilizada; só uma consulta autenticada ao
gateway comprovando sessão expirada e não paga, ou rejeição conclusiva antes de
criar sessão, permite criar outra tentativa no mesmo pedido e com o mesmo valor.
Uma sessão concluída não autoriza nova tentativa enquanto aguarda webhook.
Para `VALOR_NAO_ACEITO`, corrigir a quantia exige nova intenção (CA2), sem
retentar o mesmo valor rejeitado. Não há duas sessões utilizáveis simultaneamente nem nova tentativa para pedido pago ou com resultado
indeterminado. Sem conexão ou resposta do gateway, mostra-se "Não foi possível
retomar o pagamento agora" sem apagar o estado anterior. Recusa só é registrada
a partir de notificação assinada de falha de pagamento associada à tentativa;
retorno da interface não é evidência de recusa. O histórico conserva cada
ocorrência e transição, mesmo se a mesma sessão for paga posteriormente.

**CA10 — Expiração e notificações fora de ordem.** **Dado** uma sessão cuja
expiração foi confirmada pelo gateway, **quando** o pedido é consultado,
**então** a tentativa aparece `expirada` e o pedido não é marcado pago; é possível
iniciar outra tentativa nas condições do CA9. **Dado** pedido já pago, **quando**
chega recusa, expiração ou retorno antigo, **então** o pedido continua pago e a
tentativa confirmada não é rebaixada. Expiração exige consulta autenticada da
sessão ou notificação assinada correspondente; relógio local não basta. Uma
confirmação válida tardia de tentativa recusada ou indeterminada pode torná-la
paga, preservando o histórico. A abertura de tentativa é serializada por pedido
e revalida o estado do gateway; uma tentativa nova não é liberada enquanto a
anterior estiver aberta, concluída aguardando webhook ou incerta. Se uma corrida
externa excepcional produzir outra sessão aberta ao confirmar o pedido, solicita-se
seu encerramento e bloqueia-se nova tentativa enquanto a solicitação falhar.
Outra confirmação real é registrada na respectiva tentativa e como ocorrência
operacional, sem duplicar a confirmação do pedido, sem esconder o recebimento
e sem disparar reembolso automático, que está fora do escopo.

**CA11 — Retomar após reiniciar sem bloquear o fiscal.** **Dado** uma intenção
cuja chave e operação foram guardadas nesta instalação antes do primeiro envio,
**quando** o apoiador reabre a área de apoio ou reinicia o aplicativo, **então**
ele consegue recuperar o pedido correspondente, mesmo se perdeu a primeira
resposta e ainda não conhece seu ID, sem criar intenção nova. Consulta ou
retomada sem a chave portadora correta não expõe nem altera o pedido e tem a
mesma resposta de pedido desconhecido: "Pedido não encontrado"; API indisponível mostra "Serviço de doações indisponível. Tente
novamente mais tarde" e conserva os identificadores para outra consulta. Em
ambos os casos a navegação e as funções fiscais continuam disponíveis.

**CA12 — Minimização e separação de dados.** **Dado** qualquer criação, consulta,
recusa, confirmação ou erro de doação, **quando** se inspecionam contratos
enviados pelo aplicativo ao servidor e ao gateway, banco e logs da aplicação,
**então** os dados de negócio limitam-se a valor, BRL, estados, instantes,
identificadores e motivos operacionais necessários. Não se envia nem se
persiste nome/email do apoiador, PAN, CVC, XML, CNPJ, empresa, regra fiscal ou
resultado de cálculo. A chave de intenção só trafega no cabeçalho de acesso à
API; não vai ao Stripe nem aos logs. A API pode receber e processar
transitoriamente o corpo bruto do webhook para validar assinatura e extrair
campos permitidos, mas não persiste nem registra esse corpo ou seus dados de
pagador/cartão. A API não acessa o SQLite fiscal. A interface não recebe chave
secreta Stripe ou segredo de webhook. O Checkout recebe dados de cartão
diretamente no domínio do Stripe; a aplicação não coleta esses campos.

**CA13 — Ambiente indisponível ou configuração ausente.** **Dado** ausência de
configuração válida de testes, uso de chave de produção, banco inacessível antes
da persistência da intenção ou serviço de pagamentos indisponível, **quando**
ocorre uma nova confirmação, **então** nenhuma sessão é aberta sem pedido local
durável, nenhuma cobrança de produção é iniciada e a interface apresenta
indisponibilidade sem interferir no fluxo fiscal. Se a intenção já foi persistida
antes da falha, sua identidade é conservada e a retomada segue CA3/CA4.

## Fora de escopo

- Qualquer implementação nesta Atividade 09; modelos, migrations, endpoints,
  componentes e testes de negócio pertencem à Atividade 10, na mesma branch.
- Cobranças reais, chaves de produção, deploy e exposição pública da API.
- Pix, boleto, assinatura recorrente, reembolso, estorno, disputa, recibo fiscal,
  cadastro/login de apoiadores, histórico de todas as instalações e notificações
  por email. A demonstração usa cartão de testes no Checkout hospedado.
- Alterações de regras fiscais, parser, cálculos, banco SQLite, relatórios,
  instalador ou funcionalidades do ContabiliNico já existentes.
- Promessa de confirmação com gateway ou rede indisponível e restauração do
  vínculo depois de a pessoa apagar os identificadores locais da intenção.
- Resolver automaticamente operação ainda indeterminada após a janela segura
  de retomada; é mantido o estado explícito de verificação, sem inventar sucesso.

## Abandono no meio

| Situação | Resultado observável e critério |
| --- | --- |
| Duplo clique ou resposta da API perdida | Mesma intenção e pedido, sem duplicação — CA3. |
| Stripe cria sessão, mas a resposta se perde | Resultado indeterminado, retomada com a mesma operação; após 24h sem evidência, bloqueia nova sessão — CA4. |
| Webhook chega antes de a resposta do Checkout ser salva | Concilia com a intenção durável antes de confirmar — CA5. |
| Pessoa fecha o Checkout ou volta pela página de sucesso | Consulta a fonte persistida; retorno não paga nem cancela — CA8. |
| Cartão recusado, o nó vermelho da Jornada 3 | Conserva recusa e permite retomada controlada no mesmo pedido — CA9. |
| Sessão expira ou um evento antigo chega depois de pago | Preserva histórico e estado pago monotônico — CA10. |
| Aplicativo fecha, rede cai ou API fica fora do ar | Retoma pelos IDs locais e preserva acesso fiscal — CA11/CA13. |
| Banco falha durante confirmação ou webhook repete | Transação integral ou reentrega; uma confirmação — CA7. |

O erro adicional descoberto além do PRD é a **resposta perdida após a criação
da sessão**: reenviar cegamente pode abrir outro Checkout. A spec exige
preservar a identidade da operação, distinguir resultado incerto de recusa e
não repetir automaticamente após o período seguro (CA3/CA4).

## Assume que

Não há premissa simulada dependente de outra história futura. Tudo que falta no
fluxo de doação pertence à própria Issue #12 e deverá ser implementado na
Atividade 10; não será substituído por confirmação falsa, valor fixo ou gateway
fictício na demonstração de aceite. Portanto não há `// TODO #<outra-issue>` a
planejar. Dublês de gateway são permitidos apenas nos testes automatizados.

Pré-condições reais: scaffold da API integrado na `main` de origem, ambiente
PostgreSQL exclusivo de pagamentos, configuração de conta Stripe de testes em
BRL sem conversão e encaminhamento de seus webhooks para a API de testes.
Credenciais não são criadas nem publicadas nesta atividade. Configuração ausente
ou inválida deve ter o comportamento do CA13, sem declarar o fluxo aprovado em
execução real. A conta e seus limites deverão ser conferidos na demonstração da
Atividade 10; R$ 0,50 vem da documentação, não de conta já configurada aqui.

## Depende de

Nenhuma Issue funcional pendente. A infraestrutura necessária já está na
`main`, pelo PR de manutenção [#45](https://github.com/nicosikmoraes/motor-calculo-icms/pull/45),
merge `2e445ca5f898601c34c7b9e53cc2ca670dd9d6a5`. As histórias fiscais em andamento
não são pré-requisitos dessa doação independente.

## Dúvidas em aberto
