# Decisões da triagem — Tarefa 4, rodada 1

| # | Apontamento | Decisão | Justificativa |
|---|---|---|---|
| 1 | [P1] O teste da chegada antecipada não prova a reconciliação com os IDs persistidos e enviados como metadados. | Aceito | O teste precisa demonstrar que os mesmos IDs duráveis cruzam a criação do Checkout e a confirmação via webhook, sem depender de fixtures independentes. |
| 2 | [P2] Divergências verificáveis são ignoradas sem registro mínimo de identificadores e motivo. | Aceito | A CA6 exige registrar divergências verificáveis, preservando a privacidade e sem armazenar o corpo bruto. |
| 3 | [P2] O caso de uso depende diretamente do SDK Stripe e é instanciado manualmente pelo controller. | Aceito | A arquitetura determina casos de uso independentes do SDK, dependência por porta/adaptador e injeção pelo Nest. |
