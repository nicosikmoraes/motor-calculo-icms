# Histórico de lotes — exploração visual

## Detalhe do lote

Abra `batch-detail.html`. A revisão atual mantém os quatro indicadores da tela
real e concentra a exploração nos cards das notas e dos produtos:

- **Cards em sequência:** produtos em cartões horizontais, com os valores alinhados.
- **Cards em grade:** produtos lado a lado, destacando a comparação do ICMS.

As duas variações usam os mesmos dados fictícios. Os indicadores filtram a lista;
as notas e a área de dados/memória de cada produto podem ser expandidas. A busca,
os filtros, o resumo e as prévias de Excel, arquivos e auditoria funcionam
localmente. A opção **Cards em sequência** foi aprovada e aplicada à tela real,
mantendo os quatro indicadores e as funções de conferência.

## Histórico de lotes

Abra `batch-history.html`. A proposta 3, linha do tempo, é a opção inicial.
O estilo compacto está em `batch-history-refined.css`.

Os exemplos são fictícios. A busca e os filtros atuam sobre os quatro lotes de
demonstração. Cada card inteiro é um link para o respectivo lote de demonstração,
com notas expansíveis e inventário de arquivos. O link de retorno e o histórico
do navegador retornam à linha do tempo, preservando os filtros.
A ação Novo lote representa a posição da ação futura na aplicação.

## Banner exclusivo

Arquivo: [batch-history-banner.png](../src/renderer/assets/batch-history-banner.png).

Criado com a ferramenta integrada `image_gen`, em 15 de outubro de 2026.
A imagem representa a organização e preservação do histórico de documentos.

Prompt utilizado:

```text
Use case: photorealistic-natural.
Asset type: exclusive panoramic photographic banner for the batch import history screen of ContabiliNico, a Brazilian accounting desktop application.
Primary request: a refined editorial still life about organized document history, visually distinct from office team portraits.
Scene: contemporary accounting office, a dark navy desk with a beautifully organized row of slim pale-blue and warm-gray archival folders, a small stack of tidy documents, and a closed navy notebook. On the far right, the cropped hand and forearm of an accountant in a light-blue shirt gently files one document into a folder; no faces, no people sitting at laptops. Soft shelving and an understated plant in the background.
Composition: extremely wide panoramic 3:1 frame. Objects and hand occupy the RIGHT HALF. LEFT HALF is dark navy softly out of focus low-detail negative space for white UI text, empty and elegant. Keep important objects in the middle horizontal band so a shallow banner crop works.
Lighting and mood: natural side window light, calm meticulous work, premium authentic editorial photography, realistic materials and anatomy, subtle photographic grain.
Palette: deep navy #111c2e, cool blue #455fdb, pale gray, warm oak details.
Constraints: no text, letters, numbers, logos, watermarks, charts, interface elements, currency symbols or readable documents. This is a photograph only, no headline or UI.
```
