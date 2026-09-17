# Critérios de aceite iniciais

## Cadastro

- Contador cadastra empresa, perfil, produto de fornecedor e regra com vigência.
- Regra não pode ser aprovada sem fundamento, vigência e condições mínimas.
- Alteração de regra publicada cria versão.
- Sistema detecta sobreposição potencial de regras.

## Processamento

- Usuário envia múltiplos XML ou ZIP sem preencher dados tributários por nota.
- Arquivo inválido não interrompe os demais.
- NF-e/NFC-e no leiaute 4.00 segue para validação e processamento.
- Leiaute anterior identificável recebe `VERSAO_NAO_SUPORTADA`, não é calculado e não interrompe os demais arquivos.
- Documento processado informa `ASSINATURA_NAO_VERIFICADA`; ausência de validação de assinatura não bloqueia o cálculo.
- Incompatibilidade tolerável de schema gera aviso e preserva os dados extraídos.
- Informação indispensável ausente gera `INFORMACOES_FALTANTES`, sem inventar valor nem impedir o cálculo possível dos demais componentes.
- Duplicidade é identificada pela chave/hash segundo a política definida.
- Segunda ocorrência com mesma chave e hash no lote recebe `REPETIDA` e mantém cálculo próprio.
- Mesma chave com hashes diferentes mantém as ocorrências separadas e alerta o conflito.
- Repetições idênticas não duplicam os totais do lote.
- Ocorrências com mesma chave e conteúdos diferentes ficam fora dos totais até resolução justificada e auditada.
- Cada item recebe uma regra única ou uma pendência explícita.
- A mesma entrada e as mesmas versões produzem o mesmo resultado.
- Arquivos são relacionados por chave, independentemente da ordem na pasta.
- Produção e homologação não são misturadas no mesmo lote.
- Protocolo inconsistente gera erro explícito.
- Cancelamento e demais eventos são associados à nota quando ambos estiverem disponíveis.

## Cálculo e auditoria

- Cálculo é realizado por item com decimal exato.
- Base, alíquota, fórmula, arredondamento e regra ficam disponíveis na memória.
- Valor declarado não é usado para completar regra ausente.
- Nota com item pendente não recebe total definitivo.
- Reprocessamento preserva execução anterior.
- Documento excluído do total pode manter cálculo diagnóstico e memória completa.
- Complemento manual não altera o XML, identifica campo, valor e origem e gera nova execução auditável.
- Cancelada, rejeitada e denegada nunca compõem o total definitivo.
- Complementar adiciona somente os próprios valores e não substitui a original.
- Devolução registra separadamente valor calculado e efeito com sinal.
- CC-e não modifica automaticamente os campos do XML.
- Contingência sem autorização final aparece somente em subtotal provisório.

## Saída

- XLSX contém, no mínimo, as informações de resumo, itens, pendências, regras e erros; abas e nomes definitivos ainda serão aprovados.
- Moedas são células numéricas e datas são datas.
- Totais do resumo reconciliam com os itens concluídos.
- Componentes ICMS próprio, ST, DIFAL e FCP permanecem separados.
- Pendências e erros contêm orientação acionável.
- Nota com informação faltante permanece visível na página de pendências e no XLSX com o aviso `Informações faltando`.
- Cada nota informa se foi calculada e se foi incluída no total.
- Totais definitivos não contêm documentos cancelados ou sem autorização válida.
- Documentos excluídos continuam visíveis com motivo, status e valores diagnósticos disponíveis.
- O relatório distingue `DEFINITIVO`, `PROVISORIO` e `DIAGNOSTICO`.

## Segurança

- Dados ficam isolados na instalação local do escritório e sob as permissões do usuário do Windows.
- Operações de cadastro, aprovação e reprocessamento são auditadas.
- Upload é protegido contra XML externo, caminhos maliciosos e ZIP expansivo.
- ZIP corrompido, criptografado ou com link simbólico é rejeitado antes da
  extração; uma entrada não é escrita no disco durante a inspeção.
- Logs não armazenam XML integral sem necessidade.

## Casos mínimos de homologação fiscal

1. operação interna tributada integralmente;
2. operação interestadual entre contribuintes;
3. redução de base;
4. item isento/não tributado;
5. ICMS-ST por MVA;
6. DIFAL para consumidor final;
7. FCP;
8. múltiplos tratamentos na mesma nota;
9. regra inexistente;
10. regras ambíguas;
11. regra com mudança de vigência;
12. divergência entre perfil validado e XML.
