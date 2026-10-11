# Jornadas de Usuário

**Projeto:** ContabiliNico
**Versão:** 0.2.0 — revisão da Entrega 1
**Última atualização:** 11/10/2026

> Este documento descreve o que a pessoa vive durante as histórias mais críticas.
> Regras fiscais permanecem no PRD e em `regras-de-negocio.md`.

<a id="jornada-lote"></a>
## Jornada 1 — Importar, processar e resolver um lote

**Stories:** [US03](prd.md#us03), [US04 — Draft](prd.md#us04), [US05](prd.md#us05), [US06](prd.md#us06) e [US07](prd.md#us07).
**Protótipo:** Novo lote → Conferência → Pendências → nova execução → prévia do XLSX.
**Critérios que ela marca:** depende do tempo; pode ser abandonada no meio.

```mermaid
flowchart TD
    A(["Usuário acessa Novo lote"]) --> B["«pessoa» seleciona XMLs ou ZIP"]
    B --> C{"As entradas são seguras e reconhecidas?"}
    C -->|"não, em alguns arquivos"| D["Sistema registra os erros<br/>e preserva os arquivos seguros"]
    C -->|"sim"| CNPJ{"A empresa do CNPJ<br/>está cadastrada?"}
    D --> CNPJ
    CNPJ -->|"não"| CAD["«pessoa» cria e confirma<br/>o cadastro da empresa"]
    CNPJ -->|"sim"| E["«pessoa» confirma o envio"]
    CAD --> E
    E --> F["Sistema cria o lote<br/>e processa cada ocorrência"]
    F --> G{"Todas as notas têm<br/>dados suficientes?"}
    G -->|"sim"| H["«pessoa» consulta os resultados<br/>e exporta o XLSX"]
    G -->|"não"| X1[["Trava — existem notas sem<br/>resultado definitivo"]]
    X1 --> I["Sistema mantém as notas visíveis<br/>na página de pendências e no XLSX"]
    I --> J["«pessoa» informa somente<br/>dados complementares permitidos"]
    J --> K["«pessoa» solicita o reprocessamento"]
    K --> F

    style X1 fill:#ffe0e0,color:#7f1d1d,stroke:#c62828,stroke-width:2px
```

**O que decidimos sobre o nó vermelho:** quando faltam informações, o sistema não
inventa valores e não esconde a nota. Ele calcula apenas o que for possível,
mantém a ocorrência na página de pendências e a apresenta no XLSX com o aviso
“Informações faltando”. Enquanto a pendência não for resolvida, a nota não compõe
o total definitivo. O usuário pode voltar posteriormente, informar apenas os
campos autorizados e solicitar um novo cálculo; o XML original e a execução
anterior permanecem preservados.

O protótipo permite explorar também a lista vazia, o CNPJ ainda não cadastrado,
um arquivo inválido, uma repetição e um conflito com justificativa. As decisões
correspondem aos critérios de US01, US03 e US06 e às regras RN-003, RN-024 e RN-035.

<a id="jornada-regras"></a>
## Jornada 2 — Publicar uma regra fiscal sem alterar o passado

**Story:** [US02 — Criar e versionar regras fiscais](prd.md#us02).
**Protótipo:** Regras fiscais → criar rascunho → simular validação → publicar outra versão.
**Critérios que ela marca:** depende de outra pessoa agir; pode ser abandonada no meio.

```mermaid
flowchart TD
    A(["Contador inicia uma regra"]) --> B["«pessoa» informa condições,<br/>resultados, vigência e fundamento"]
    B --> C{"Cadastro está completo<br/>e sem ambiguidade conhecida?"}
    C -->|"não"| D["Sistema mostra os campos<br/>ou conflitos encontrados"]
    D --> B
    C -->|"sim"| E["«pessoa» valida a regra<br/>com casos homologados"]
    E --> F{"Resultado foi aprovado<br/>pelo responsável fiscal?"}
    F -->|"não"| X1[["Trava — regra permanece<br/>rascunho e não calcula lotes"]]
    F -->|"sim"| G["«pessoa» publica a versão"]
    G --> H["Sistema preserva a versão<br/>para cálculos e auditoria"]

    style X1 fill:#ffe0e0,color:#7f1d1d,stroke:#c62828,stroke-width:2px
```

**O que decidimos sobre o nó vermelho:** uma regra incompleta ou não homologada
permanece como rascunho e não participa da seleção usada pelos lotes. O contador
pode abandonar a edição e retomá-la depois, mas somente uma versão explicitamente
publicada e vigente pode afetar cálculos. Depois de publicada, uma correção cria
outra versão; o sistema não reescreve silenciosamente os resultados anteriores.

<a id="jornada-doacao"></a>
## Jornada 3 — Doar sem confundir intenção com pagamento

**Story:** [US09 — Fazer doação pelo Stripe](prd.md#us09).
**Protótipo:** Apoiar o projeto → criar pedido → simular recusa → nova tentativa → confirmação.

```mermaid
flowchart TD
    A["Pessoa escolhe valor positivo em BRL"] --> B["Sistema cria pedido e tentativa pendentes"]
    B --> C["Pessoa abre Checkout de testes"]
    C --> D{"O gateway recusou a tentativa?"}
    D -->|"sim"| X[["Trava — pagamento recusado"]]
    X --> N["Pessoa inicia nova tentativa no mesmo pedido"]
    N --> C
    D -->|"não"| E["Pessoa retorna ao aplicativo"]
    E --> F{"Chegou webhook válido de confirmação?"}
    F -->|"não"| G["Pedido continua pendente"]
    G --> F
    F -->|"sim"| H["Sistema confirma pagamento uma única vez"]
    H --> I["Pessoa vê a doação confirmada"]
    style X fill:#ffe0e0,color:#7f1d1d,stroke:#c62828,stroke-width:2px
```

**Decisão no nó vermelho:** recusar uma tentativa não apaga o pedido nem o
histórico. A pessoa pode tentar novamente. O retorno do Checkout mantém o
pedido pendente; somente a confirmação válida muda seu estado para pago.
Repetir a mesma notificação não duplica a confirmação. São as regras RN-036 a
RN-039 do PRD. Os botões do protótipo simulam esses estados sem acessar Stripe.

## Dúvidas em aberto

| # | Dúvida | Onde precisa ser resolvida |
| :--- | :--- | :--- |
| 1 | O lote deve retomar automaticamente após o aplicativo ser fechado durante o processamento? | Decisão de recuperação e persistência no roadmap |
| 2 | Quais campos ausentes podem ser complementados manualmente? | Política fiscal de complementação |
| 3 | Quem homologa formalmente uma regra quando houver mais de um usuário na instalação? | Evolução de atores e permissões |
