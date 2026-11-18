# Instruções do repositório

Antes de alterar código, leia [`docs/arquitetura-do-codigo.md`](docs/arquitetura-do-codigo.md) e siga as regras de organização e dependência descritas ali.

- Preserve os limites entre renderer, preload, processo principal, pacotes compartilhados e API.
- Coloque código novo na funcionalidade e na camada responsáveis por ele; não crie arquivos soltos nem pastas genéricas sem propósito claro.
- Quando uma alteração mudar a arquitetura, atualize o guia e os testes de arquitetura correspondentes.
- Estilos de tela e componente ficam no respectivo `.vue`; tokens e estilos compartilhados seguem a convenção documentada.
- Antes de adicionar dependência entre workspaces ou camadas, confira o sentido permitido no guia.
