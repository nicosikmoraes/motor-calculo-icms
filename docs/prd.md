# Product Requirements Document (PRD)

**Projeto:** ContabiliNico
**Versão:** 0.2.0 — backlog preparado
**Última atualização:** 25/09/2026

> Este documento apresenta o que o produto faz em formato acadêmico. As regras
> fiscais completas continuam em [Regras de negócio](regras-de-negocio.md), sem
> serem substituídas ou simplificadas por este resumo.

## 1. Visão Geral e Objetivo

**O problema:** escritórios contábeis recebem lotes de notas fiscais e precisam
conferir, item por item, se o ICMS declarado corresponde às regras aplicáveis. A
conferência manual é repetitiva, sujeita a inconsistências e difícil de auditar.

**A solução:** uma aplicação local na qual o contador mantém empresas, perfis e
regras fiscais. O usuário envia XMLs de NF-e/NFC-e; o sistema valida os documentos,
seleciona regras vigentes, recalcula os componentes do ICMS, identifica
divergências e produz um relatório com memória de cálculo e pendências.
Como fluxo independente do tratamento fiscal, a aplicação permite doações
básicas pelo Stripe em ambiente de testes.

**Como saberemos que deu certo:** para um lote homologado, cada item terá um
resultado calculado ou uma pendência explícita; o usuário conseguirá rastrear a
regra utilizada, comparar declarado e calculado e exportar o resultado sem
preencher manualmente os dados tributários de cada nota.

## 2. Glossário Ubíquo

| Termo | Significa | Não confundir com |
| :--- | :--- | :--- |
| Lote | Um envio confirmado de XMLs, pasta ou ZIP, com identidade e histórico próprios | Uma única nota fiscal |
| Ocorrência | Uma aparição de um arquivo dentro de um lote, inclusive quando repetido | Documento fiscal deduplicado |
| Nota | NF-e modelo 55 ou NFC-e modelo 65 representada pelo XML | DANFE ou PDF |
| Item | Produto ou operação detalhada dentro da nota e unidade básica do cálculo | Total consolidado da nota |
| Regra fiscal | Condições e parâmetros aprovados para um cálculo em determinada vigência | Valor declarado no XML |
| Perfil fiscal | Classificação reutilizável que agrupa produtos com tratamento semelhante | Produto específico do fornecedor |
| Valor declarado | Base, alíquota ou imposto informado pelo emissor no XML | Resultado recalculado pelo motor |
| Valor calculado | Resultado obtido pela regra fiscal selecionada | Cópia do valor declarado |
| Pendência | Situação que impede uma conclusão segura ou um total definitivo | Erro técnico necessariamente fatal |
| Memória de cálculo | Evidência da regra, fórmula, entradas e etapas usadas no resultado | Apenas o total final |
| Resultado definitivo | Resultado completo e elegível para consolidação | Subtotal provisório ou diagnóstico |
| Reprocessamento | Nova execução após mudança autorizada, preservando a anterior | Alteração do XML original |

## 3. Atores e Permissões

No MVP, as atividades não criam perfis técnicos de acesso distintos: todos os
usuários da instalação podem executá-las. A separação abaixo descreve
responsabilidades de negócio.

| Ator | Quem é | Pode | Não pode |
| :--- | :--- | :--- | :--- |
| Usuário operacional | Pessoa que recebe e organiza documentos | Criar lote, acompanhar processamento, consultar resultados e exportar relatório | Inventar valores para completar uma nota ou alterar o XML original |
| Contador responsável | Profissional que configura e revisa o tratamento fiscal | Cadastrar empresas, perfis e regras; resolver pendências; aprovar versões e reprocessar | Alterar retroativamente uma regra publicada ou apagar silenciosamente resultados históricos |
| Responsável pela instalação | Pessoa que mantém os dados locais | Configurar retenção, exportar/importar configurações e realizar backup quando disponível | Mesclar bancos de instalações ou expor documentos fiscais sem autorização |

## 4. Escopo Funcional — User Stories

> As histórias com critérios definidos foram promovidas para `🟡 Ready` por
> solicitação do autor. US04 permanece `⚪ Draft` até ser dividida por componente fiscal.

### US01 — Manter empresas e perfis fiscais · `Must Have` · `M` · Status: `🟡 Ready`

**Como** contador responsável, **eu quero** cadastrar empresas e perfis fiscais
**para que** o motor conheça o contexto utilizado na seleção das regras.

**Critérios de aceite:**

- [ ] **Dado** um cadastro válido, **quando** o contador o confirma, **então** a empresa ou perfil fica disponível com sua vigência.
- [ ] **Dado** um CNPJ, UF ou vigência inválida, **quando** o contador tenta confirmar, **então** o cadastro não é aceito e o campo problemático é indicado.
- [ ] **Dado** um cadastro iniciado a partir de um XML, **quando** o contador o
  revisa, **então** CNPJ, razão social e UF aparecem pré-preenchidos, o CNPJ não
  pode ser trocado nesse fluxo e o nome fantasia permanece opcional.
- [ ] **Dado** um perfil já utilizado, **quando** ele precisa mudar, **então** o histórico anterior permanece rastreável.

**Regras relacionadas:** RN-006, RN-014, RN-015 a RN-019.

### US02 — Criar e versionar regras fiscais · `Must Have` · `M` · Status: `🟡 Ready`

**Como** contador responsável, **eu quero** cadastrar e publicar regras fiscais
com vigência e fundamento **para que** os cálculos sejam consistentes e auditáveis.

**Critérios de aceite:**

- [ ] **Dado** uma regra com condições, resultados, vigência e fundamento, **quando** ela é publicada, **então** recebe uma versão imutável.
- [ ] **Dado** uma regra publicada, **quando** o contador precisa corrigi-la, **então** uma nova versão é criada sem alterar cálculos históricos.
- [ ] **Dado** regras empatadas em nível, especificidade e prioridade, **quando** o motor tenta selecionar uma delas, **então** o item recebe a pendência `REGRA_AMBIGUA`.

**Regras relacionadas:** RN-006 a RN-014, RN-028 a RN-031.

### US03 — Importar um lote de documentos fiscais · `Must Have` · `M` · Status: `🟡 Ready`

**Como** usuário operacional, **eu quero** enviar XMLs ou um ZIP **para que** as
notas sejam inventariadas, validadas e preparadas para cálculo em conjunto.

**Critérios de aceite:**

- [ ] **Dado** um conjunto de NF-e/NFC-e 4.00, **quando** o envio é confirmado, **então** um lote com identidade própria registra cada ocorrência e seu hash.
- [ ] **Dado** um arquivo inválido, inseguro ou não suportado, **quando** o lote é analisado, **então** o problema é registrado sem interromper os demais arquivos seguros.
- [ ] **Dado** o mesmo conjunto em outra ordem, **quando** ele é inventariado, **então** a ordem canônica e o hash do inventário permanecem iguais.
- [ ] **Dado** um ZIP com uma entrada individual insegura, **quando** ele é
  inspecionado, **então** a entrada é rejeitada com motivo explícito e as demais
  entradas seguras são preservadas; violação estrutural ou de limite global
  rejeita o ZIP inteiro.
- [ ] **Dado** um CNPJ candidato ainda não cadastrado, **quando** o lote é preparado,
  **então** o sistema solicita a criação e confirmação da empresa antes do
  processamento, sem cadastrá-la automaticamente.

**Regras relacionadas:** RN-001, RN-003, RN-032 a RN-035 e DT-018 a DT-022.

### US04 — Recalcular o ICMS por item · `Must Have` · `L` · Status: `⚪ Draft`

**Como** contador responsável, **eu quero** que cada item seja recalculado pela
regra vigente **para que** eu possa comparar o imposto esperado com o declarado.

**Critérios de aceite:**

- [ ] **Dado** um item com contexto e regra suficientes, **quando** o lote é processado, **então** ICMS próprio e componentes aplicáveis são calculados separadamente com memória de cálculo.
- [ ] **Dado** um valor declarado, **quando** falta parâmetro na regra, **então** o valor declarado não é usado para completar o cálculo.
- [ ] **Dado** um item sem regra ou com dados insuficientes, **quando** o processamento termina, **então** ele recebe uma pendência explícita e não produz resultado definitivo.

**Regras relacionadas:** RN-001 a RN-005, RN-020 a RN-027.

> **Atenção:** esta história é obrigatória e grande. Antes de promovê-la para
> `Ready`, deve ser dividida verticalmente por componente fiscal homologável.

### US05 — Investigar e resolver pendências · `Must Have` · `M` · Status: `🟡 Ready`

**Como** contador responsável, **eu quero** visualizar o motivo de cada pendência
e complementar dados autorizados **para que** eu possa solicitar um novo cálculo
sem modificar o XML.

**Critérios de aceite:**

- [ ] **Dado** um item pendente, **quando** o contador abre seus detalhes, **então** vê o dado ausente ou conflitante, as regras consideradas e uma ação possível.
- [ ] **Dado** um campo autorizado ausente, **quando** o contador informa um valor e reprocessa, **então** o complemento, sua origem e a nova execução ficam auditáveis.
- [ ] **Dado** uma pendência não resolvida, **quando** o relatório é consolidado, **então** a nota não participa do total definitivo.

**Regras relacionadas:** RN-003, RN-004, RN-024, RN-032, RN-033 e RN-035.

### US06 — Tratar ocorrências repetidas e conflitantes · `Must Have` · `M` · Status: `🟡 Ready`

**Como** usuário operacional, **eu quero** ser avisado sobre notas repetidas ou
conflitantes **para que** o lote não duplique valores nem esconda documentos.

**Critérios de aceite:**

- [ ] **Dado** mesma chave e mesmo conteúdo no lote, **quando** as ocorrências são processadas, **então** todas são preservadas, as posteriores recebem `REPETIDA` e apenas a primeira elegível pode participar dos totais.
- [ ] **Dado** mesma chave com conteúdos diferentes, **quando** o lote é consolidado, **então** todas recebem alerta e ficam fora dos totais até resolução justificada.
- [ ] **Dado** a mesma nota em lotes diferentes, **quando** o lote novo é processado, **então** uma nova ocorrência e uma nova execução são preservadas no histórico correspondente.

**Regras relacionadas:** DT-019 e regras de estado da seção 9 de `regras-de-negocio.md`.

### US07 — Exportar relatório auditável · `Must Have` · `M` · Status: `🟡 Ready`

**Como** usuário operacional, **eu quero** exportar um XLSX consolidado **para que**
eu possa analisar, compartilhar e arquivar os resultados do lote.

**Critérios de aceite:**

- [ ] **Dado** um lote concluído, **quando** o usuário exporta, **então** o arquivo distingue resumo, itens, pendências, regras aplicadas e erros XML.
- [ ] **Dado** um resultado provisório, diagnóstico ou excluído, **quando** ele aparece no XLSX, **então** seu caráter e o motivo ficam explícitos.
- [ ] **Dado** os itens definitivos, **quando** o resumo é totalizado, **então** seus valores reconciliam com o detalhamento.

**Regras relacionadas:** RN-002 a RN-005 e seção 10 de `regras-de-negocio.md`.

### US08 — Exportar e importar configurações · `Should Have` · `M` · Status: `🟡 Ready`

**Como** responsável pela instalação, **eu quero** transportar cadastros e regras
em um pacote controlado **para que** outra instalação possa reutilizar a
configuração sem mesclar bancos.

**Critérios de aceite:**

- [ ] **Dado** um conjunto selecionado de configurações, **quando** ele é exportado, **então** o pacote informa versão, origem e integridade sem incluir XMLs ou relatórios.
- [ ] **Dado** um pacote válido, **quando** ele é importado, **então** registros novos, existentes e conflitantes são apresentados antes da confirmação.
- [ ] **Dado** uma falha durante a importação, **quando** a operação termina, **então** a instalação mantém o estado anterior.

**Regras relacionadas:** manual, seções 10 e 11.

### US09 — Fazer doação pelo Stripe · `Must Have` · `M` · Status: `🟡 Ready`

**Como** apoiador do projeto, **eu quero** fazer uma doação pelo Stripe
**para que** eu possa contribuir com o ContabiliNico de forma simples.

**Critérios de aceite:**

- [ ] **Dado** um valor positivo em BRL, **quando** o apoiador confirma a intenção,
  **então** o sistema cria um pedido de doação identificável e uma sessão do Stripe
  Checkout em ambiente de testes, inicialmente com pagamento pendente.
- [ ] **Dado** um pagamento concluído, **quando** o webhook válido do Stripe é
  recebido, **então** o pedido é marcado como pago uma única vez, mesmo que o
  evento seja entregue novamente.
- [ ] **Dado** cancelamento, falha ou retorno à página sem confirmação do webhook,
  **quando** o apoiador consulta o pedido, **então** ele não aparece como pago.
- [ ] **Dado** qualquer doação, **quando** seus dados são persistidos, **então**
  o sistema guarda apenas identificadores, valor, moeda e estado necessários à
  conciliação; dados de cartão não são armazenados e dados fiscais não são
  enviados ao Stripe.

**Escopo:** fluxo independente do cálculo de ICMS; Stripe em ambiente de testes.

## 5. Regras de Negócio Consolidadas

| ID | Regra |
| :--- | :--- |
| RN-001 | O cálculo ocorre por item. |
| RN-002 | O resultado da nota é a soma dos resultados válidos dos itens. |
| RN-003 | Nota com item pendente não recebe resultado definitivo. |
| RN-006 | Apenas regras aprovadas e vigentes na emissão podem ser aplicadas. |
| RN-009 | A seleção respeita nível, especificidade e prioridade, nessa ordem. |
| RN-012 | Empate persistente gera `REGRA_AMBIGUA`, sem cálculo presumido. |
| RN-014 | Alterar regra publicada cria nova versão e preserva o histórico. |
| RN-015 | Produto é reconhecido prioritariamente por fornecedor e código informado por ele. |
| RN-020 | Cálculo por dentro somente ocorre quando a regra determinar. |
| RN-022 | Arredondamento ocorre por item; a nota soma valores já arredondados. |
| RN-024 | Valor declarado nunca completa parâmetro ausente da regra. |
| RN-025 | A tolerância de comparação é configurável por componente. |
| RN-032 | Situação documental, cálculo, caráter do resultado e inclusão no total são armazenados separadamente. |
| RN-035 | Complemento manual autorizado não altera o XML e gera nova execução auditável. |

O catálogo completo RN-001 a RN-035 está em
[Regras de negócio detalhadas](regras-de-negocio.md).

## 6. Fora de Escopo

- consulta automática à SEFAZ no MVP, porque a entrada inicial são arquivos do usuário;
- interpretação de DANFE/PDF como fonte fiscal, porque o XML é a fonte estruturada;
- validação criptográfica da assinatura digital no MVP, registrada como não verificada;
- editor livre de fórmulas ou execução de código fornecido pelo usuário;
- sincronização automática entre instalações e edição multiusuário em tempo real;
- atualização automática de legislação sem homologação do responsável fiscal;
- protocolos e eventos na primeira entrega do parser, preservados para incremento posterior.

## 7. Requisitos Não Funcionais

- **Auditabilidade:** toda regra e resultado deve conservar versão, origem e memória.
- **Determinismo:** mesma entrada e mesmas versões devem produzir o mesmo resultado.
- **Segurança local:** XMLs e dados comerciais permanecem sob as permissões da instalação.
- **Precisão:** valores fiscais não usam ponto flutuante binário.
- **Resiliência do lote:** a falha de um arquivo não interrompe os demais.
- **Segurança de entrada:** DTD, entidades externas, Zip Slip e ZIP expansivo são bloqueados.
- **Responsividade:** processamento pesado não deve bloquear a interface.
- **Explicabilidade:** pendência e exclusão devem apresentar motivo acionável.

## 8. Dúvidas e Portões em Aberto

| # | Decisão pendente | Responsável |
| :--- | :--- | :--- |
| 1 | Confirmar se o tema é único na turma | Autor, consultando a planilha do Moodle |
| 2 | Confirmar com o professor se o pedido de doação e a confirmação via Stripe atendem ao critério acadêmico de pedido e pagamento | Autor e professor |
| 3 | Dividir US04 em fatias fiscais menores antes de iniciar sua implementação | Autor |

O autor informou em 25/09/2026 que o tema ContabiliNico foi aprovado pelo
professor e definiu Stripe básico para doações como fluxo de pagamento.

## 9. Histórico

| Data | Versão | O que mudou |
| :--- | :--- | :--- |
| 16/09/2026 | 0.1.0 | Rascunho acadêmico organizado a partir das decisões documentadas no projeto |
| 25/09/2026 | 0.2.0 | Aceite do tema informado pelo autor; histórias US01–US03 e US05–US09 promovidas a Ready; doação Stripe definida como fluxo independente |
