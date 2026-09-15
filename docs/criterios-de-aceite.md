# Critérios de aceite iniciais

## Cadastro

- Contador cadastra empresa, perfil, produto de fornecedor e regra com vigência.
- Regra não pode ser aprovada sem fundamento, vigência e condições mínimas.
- Alteração de regra publicada cria versão.
- Sistema detecta sobreposição potencial de regras.

## Processamento

- Usuário envia múltiplos XML ou ZIP sem preencher dados tributários por nota.
- Arquivo inválido não interrompe os demais.
- Duplicidade é identificada pela chave/hash segundo a política definida.
- Cada item recebe uma regra única ou uma pendência explícita.
- A mesma entrada e as mesmas versões produzem o mesmo resultado.

## Cálculo e auditoria

- Cálculo é realizado por item com decimal exato.
- Base, alíquota, fórmula, arredondamento e regra ficam disponíveis na memória.
- Valor declarado não é usado para completar regra ausente.
- Nota com item pendente não recebe total definitivo.
- Reprocessamento preserva execução anterior.

## Saída

- XLSX contém as cinco abas especificadas.
- Moedas são células numéricas e datas são datas.
- Totais do resumo reconciliam com os itens concluídos.
- Componentes ICMS próprio, ST, DIFAL e FCP permanecem separados.
- Pendências e erros contêm orientação acionável.

## Segurança

- Acesso é isolado por organização.
- Operações de cadastro, aprovação e reprocessamento são auditadas.
- Upload é protegido contra XML externo, caminhos maliciosos e ZIP expansivo.
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

