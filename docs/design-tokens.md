# Tokens de Design

**Projeto:** Motor de Cálculo de ICMS
**Versão:** 0.1.0 — baseline da interface atual
**Última atualização:** 16/09/2026

> Os valores abaixo foram extraídos da interface já implementada. Eles formam uma
> baseline coerente, mas ainda precisam ser lidos e ratificados pelo autor antes de
> serem tratados como decisão visual definitiva.

## Paleta

| Token | Valor | Onde se usa |
| :--- | :--- | :--- |
| `primaria` | `#B45D30` | ação principal, chamada e destaque operacional |
| `navegacao` | `#173D32` | barra lateral, títulos de indicadores e identidade institucional |
| `navegacao-ativa` | `#28594A` | item atual da navegação e confirmação discreta |
| `fundo` | `#F4F1E8` | fundo geral da aplicação |
| `superficie` | `#FFFDF8` | cards, painéis e áreas de trabalho |
| `borda` | `#D9D4C7` | separação de cards e controles |
| `texto` | `#1F2923` | texto padrão e títulos |
| `texto-suave` | `#56615A` | descrição, legenda e apoio |
| `texto-invertido` | `#F8F4E9` | conteúdo sobre a navegação escura |
| `perigo` | `#C62828` | erro impeditivo, exclusão e nó crítico das jornadas |
| `sucesso` | `#28594A` | confirmação e resultado concluído |
| `aviso` | `#B45D30` | pendência, atenção e resultado provisório |
| `desabilitado` | `#69736D` com opacidade de `55%` | controle indisponível |

## Escala de espaçamento

Uma única progressão deve orientar margens, preenchimentos e intervalos:

| Token | Valor | Uso sugerido |
| :--- | :--- | :--- |
| `xs` | `4px` | ajuste interno mínimo |
| `sm` | `8px` | elementos diretamente relacionados |
| `md` | `16px` | conteúdo de controles e pequenos grupos |
| `lg` | `24px` | preenchimento de cards e separação de blocos |
| `xl` | `32px` | seções da página |
| `2xl` | `48px` | grandes regiões e cabeçalhos |

## Tipografia

| Token | Família · tamanho · peso | Papel |
| :--- | :--- | :--- |
| `titulo-pagina` | Georgia · `34–54px` · `700` | título principal e hierarquia máxima |
| `titulo-card` | Georgia · `25px` · `700` | título de card ou módulo |
| `indicador` | Georgia · `38px` · `700` | números resumidos do painel |
| `corpo-destaque` | Inter/system UI · `18px` · `400` | introdução e instrução principal |
| `corpo` | Inter/system UI · `16px` · `400` | conteúdo e controles |
| `legenda` | Inter/system UI · `13px` · `400` | metadados e informações auxiliares |
| `rotulo` | Inter/system UI · `12px` · `800` | rótulo curto em caixa alta |

## Estados de botão

| Estado | Aparência e comportamento |
| :--- | :--- |
| normal | fundo `primaria`, texto branco, altura mínima de `44px`, raio de `8px` |
| hover | fundo primário visualmente mais escuro e cursor de ação, sem mudar dimensões |
| foco (teclado) | contorno externo de `3px` com contraste visível e afastamento de `2px` |
| desabilitado | opacidade de `55%`, sem ação e cursor indicativo de indisponibilidade |
| carregando | mantém largura, apresenta progresso textual, bloqueia novo clique e conserva o rótulo acessível |

## Princípios de interface

- O estado não deve depender somente da cor: texto ou ícone acompanha erro, aviso e sucesso.
- O foco por teclado nunca é removido sem substituto de contraste equivalente.
- A ação principal de uma tela é única; ações secundárias não competem visualmente.
- Durante processamento, o usuário recebe estado textual e o comando não pode ser disparado duas vezes.
- Pendências e exclusões apresentam motivo e próxima ação possível.

## Protótipo

**Link:** pendente — não há link de Figma, Stitch ou equivalente aprovado.
**Telas necessárias:** visão geral; novo lote; acompanhamento do lote; pendências;
resultado e exportação.

Atualmente existem telas funcionais iniciais de visão geral e novo lote no
aplicativo. O protótipo acadêmico ainda precisa cobrir de três a cinco telas das
jornadas documentadas acima.

## Pendências de ratificação

- confirmar a paleta como identidade definitiva do produto;
- confirmar a escala única de espaçamento;
- escolher se a fonte Georgia permanece nos títulos;
- produzir e informar o link do protótipo com três a cinco telas;
- validar contraste e foco com uma ferramenta de acessibilidade.
