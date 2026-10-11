# Tokens de Design

**Projeto:** ContabiliNico
**Versão:** 0.2.0 — baseline aplicada ao protótipo
**Última atualização:** 11/10/2026

> Os valores abaixo foram extraídos da interface já implementada. Eles formam uma
> baseline aplicada ao protótipo acadêmico. O autor revisa essa identidade antes
> de tratá-la como decisão visual definitiva da aplicação.

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

**Link público:** [ContabiliNico — protótipo da Entrega 1](https://contabilinico-prototipo.balmygrove128.chatgpt.site).

Cinco telas principais:

1. **Visão geral:** lotes, lista vazia, cadastro assistido de empresa e detalhe de perfil — US01.
2. **Novo lote:** seleção de exemplos, diagnóstico individual, reconhecimento e confirmação da empresa — US03.
3. **Conferência:** resultados, memória, pendências, reprocessamento, repetições, conflitos e prévia do XLSX — US04 (Draft), US05, US06 e US07.
4. **Regras fiscais:** versão publicada, rascunho, aprovação simulada e nova versão — US02.
5. **Apoiar o projeto:** pedido, recusa, nova tentativa, retorno pendente e confirmação idempotente simulada — US09.

As três jornadas de `user-flows.md` têm um caminho navegável correspondente.
O protótipo usa os tokens deste documento em variáveis CSS, títulos Georgia e
corpo Inter/system UI. Usa somente dados fictícios: não lê XMLs, não calcula
tributos reais, não gera XLSX e não realiza pagamentos. A publicação demonstra
a concepção visual, sem ampliar a stack prevista para a aplicação.

## Pendências de ratificação

- confirmar a paleta como identidade definitiva do produto;
- confirmar a escala única de espaçamento;
- escolher se a fonte Georgia permanece nos títulos;
- homologar a política completa de campos complementares antes de implementar US05;
- verificar manualmente foco, legibilidade e estados antes de gravar o vídeo.
