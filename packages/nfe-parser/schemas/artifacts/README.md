# Catálogo offline de protocolos e eventos

Origem: [catálogo oficial NF-e](https://www.nfe.fazenda.gov.br/portal/listaConteudo.aspx?tipoConteudo=BMPFMBoln3w%3D), seção versões oficiais em uso. Downloads conferidos em 01/10/2026.

- Envelope de eventos: pacote 010d_v1.01, NT 2026.004, publicado em 08/06/2026; arquivos de `PL_Evento.zip` interno. [Download oficial](https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=FOEnx2KAsCk=). SHA-256 do ZIP externo: `cc50170b276c23bdab88650e1c68a46fdc707c8e810664452bba974cf744e7db`.
- Detalhes de carta de correção 110110: `e110110_v1.00.xsd`, pacote Evento_CCe_PL_v1.01. [Download oficial](https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=%2B0MSTVshMl8=). SHA-256: `c300695ae3344dcb0c000ec806559e7392c54f7be99599274965050112771f77`.
- Detalhes de cancelamento 110111: `e110111_v1.00.xsd`, pacote Evento_Canc_PL_v1.01 atualizado em 21/12/2018. [Download oficial](https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=0Yynu2Ck%2BbM=). SHA-256: `71ccd5fcc48f9604a2a8965146df45e3b73e96e87942ab3391be0d55cc0df718`.
- Protocolo: tipo oficial `TProtNFe` do catálogo PL_010f_v1.04 já embarcado; procedência no README pai.

Os arquivos `*-adapter.xsd` são adaptadores locais que apenas declaram raízes `evento` e `protNFe` com os tipos oficiais TEvento/TProtNFe; não são arquivos publicados pela SEFAZ. Os demais XSDs são preservados byte a byte. `sha256.json` registra todos os arquivos consumidos pelo validador.

O schema genérico usa `processContents="skip"` em detEvento. Por isso o código valida separadamente os detalhes 110110 e 110111 e gera `EVENTO_XSD_ESPECIFICO_NAO_DISPONIVEL` para os demais tipos. Nenhum tipo fora dessa cobertura recebe certificação específica silenciosa. A assinatura é validada apenas estruturalmente; não há verificação criptográfica.

Schemas entram como texto no bundle do processo principal, sem downloads durante a importação nem caminhos dependentes da instalação. Inspeção e criação do lote usam o mesmo validador, de forma sequencial e limitada a um XML por vez. Documentos reconhecidos com falhas XSD são preservados com ocorrência pendente e diagnósticos vinculados à ocorrência; efeitos fiscais e associação seguem as regras anteriores. A subárvore de protocolo embutido herda os namespaces do envelope somente para a validação, sem modificar o XML de origem.
