# Manual do usuário e do contador

## 1. Acesso e atividades

No MVP não existe distinção de permissões: todos os usuários da instalação podem executar todas as operações.

### Atividades operacionais

- envia arquivos XML ou ZIP;
- acompanha o processamento;
- consulta resultados e pendências;
- baixa o XLSX.

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

### 2.1 Cadastrar a empresa

Informe CNPJ, UF, inscrição estadual, regime tributário, vigência, regimes especiais e benefícios próprios.

### 2.2 Criar perfis fiscais

Agrupe produtos que compartilham tratamento. Informe NCM, CEST quando aplicável, origem, categoria e finalidade padrão. Evite copiar alíquotas para cada produto.

### 2.3 Vincular produtos de fornecedores

Quando necessário, associe `CNPJ do fornecedor + código do produto` ao perfil fiscal validado. O sistema também pode sugerir vínculos a partir dos XMLs; sugestões precisam seguir a política de aprovação.

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

1. Acesse **Novo lote**.
2. Envie uma pasta, XMLs individuais ou um ZIP.
3. O sistema tenta localizar a empresa pelo CNPJ do XML.
4. Se o CNPJ não estiver cadastrado, selecione uma empresa existente ou crie uma nova.
5. Confirme o envio.
6. Acompanhe os estados `Recebido`, `Validando` e `Processando`.
7. Ao concluir, veja a quantidade de notas aderentes, divergentes, provisórias, excluídas e inválidas.
8. Baixe o XLSX ou abra os detalhes.

O usuário não informa alíquota, finalidade ou tratamento durante o envio. O sistema usa os cadastros previamente aprovados.

## 4. Interpretar o resultado

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

Após resolver, publique a alteração quando necessário e use **Reprocessar**. O novo resultado ficará vinculado ao anterior para auditoria.

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
