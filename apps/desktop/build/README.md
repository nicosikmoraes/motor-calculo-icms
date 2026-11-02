# Ícone do ContabiliNico

O ícone reaproveita o documento com visto de `AppIcon.vue` e o fundo azul
`#5675f0` do cabeçalho. A fonte editável é `icon.svg`; não é uma imagem gerada
por IA nem uma mudança da identidade visual existente.

- `icon.png`: 1024 × 1024, usado pela janela Electron no desenvolvimento e na aplicação empacotada.
- `icon.ico`: tamanhos 16, 24, 32, 48, 64, 128 e 256, usado pelo executável Windows, instalador e desinstalador.
- `icon.svg`: usado também como favicon da interface.

O import `?asset` copia o PNG para a saída de compilação do processo principal,
incluída pelo empacotamento. Não depende do diretório de trabalho do usuário.

Para atualizar os derivados, na raiz de `apps/desktop`, com ImageMagick:

```bash
convert -background none build/icon.svg -resize 1024x1024 -depth 8 build/icon.png
convert build/icon.png -define icon:auto-resize=256,128,64,48,32,24,16 build/icon.ico
```
