import type { FiscalRule } from './rule-selector'

/**
 * Propostas embarcadas para revisão fiscal. A vigência abaixo delimita a cobertura
 * inicial do pacote; não representa a data de início de vigência das leis citadas.
 * Nenhuma proposta pode ser usada para cálculo enquanto estiver em DRAFT.
 */
export const BUILTIN_ICMS_OWN_PACK = {
  id: 'icms-proprio-pr-inicial',
  version: 1,
  rules: [
    {
      id: 'pr-interna-cfop-5102-cst-00',
      version: 1,
      name: 'PR interna · revenda comum · proposta',
      status: 'DRAFT',
      reviewStage: 'CONDITIONS_AND_RATE_APPROVED',
      reviewedOn: '2026-09-25',
      level: 'DEFAULT_OPERATION',
      priority: 0,
      validFrom: '2026-01-01',
      legalBasis: 'Lei PR 11.580/1996, art. 14, VIII (hipótese dos demais bens e mercadorias)',
      sourceUrl: 'https://www.legislacao.pr.gov.br/legislacao/listarAtosAno.do?action=exibir&codAto=278020&codItemAto=2215421',
      proposedRate: '19.50',
      reviewNote: 'Recorte e alíquota aprovados pelo usuário; faltam exceções, composição da base, arredondamento e exemplos homologados para ativar o cálculo.',
      conditions: {
        originState: 'PR', destinationState: 'PR', cfop: '5102',
        issuerRegime: '3', cst: '00', merchandiseOrigin: '0',
        operationType: '1', purpose: '1',
      },
    },
    {
      id: 'pr-sp-cfop-6102-cst-00',
      version: 1,
      name: 'PR → SP · revenda comum · proposta',
      status: 'DRAFT',
      reviewStage: 'CONDITIONS_AND_RATE_APPROVED',
      reviewedOn: '2026-09-25',
      level: 'DEFAULT_OPERATION',
      priority: 0,
      validFrom: '2026-01-01',
      legalBasis: 'Resolução do Senado 22/1989, art. 1º (regra geral interestadual)',
      sourceUrl: 'https://legis.senado.leg.br/norma/586152/publicacao/15646891',
      proposedRate: '12.00',
      reviewNote: 'Recorte e alíquota aprovados pelo usuário; faltam exceções, composição da base, arredondamento e exemplos homologados para ativar o cálculo.',
      conditions: {
        originState: 'PR', destinationState: 'SP', cfop: '6102',
        issuerRegime: '3', cst: '00', merchandiseOrigin: '0',
        operationType: '1', purpose: '1',
      },
    },
    {
      id: 'pr-ba-cfop-6102-cst-00',
      version: 1,
      name: 'PR → BA · revenda comum · proposta',
      status: 'DRAFT',
      reviewStage: 'CONDITIONS_AND_RATE_APPROVED',
      reviewedOn: '2026-09-25',
      level: 'DEFAULT_OPERATION',
      priority: 0,
      validFrom: '2026-01-01',
      legalBasis: 'Resolução do Senado 22/1989, art. 1º, parágrafo único, II',
      sourceUrl: 'https://legis.senado.leg.br/norma/586152/publicacao/15646891',
      proposedRate: '7.00',
      reviewNote: 'Recorte e alíquota aprovados pelo usuário; faltam exceções, composição da base, arredondamento e exemplos homologados para ativar o cálculo.',
      conditions: {
        originState: 'PR', destinationState: 'BA', cfop: '6102',
        issuerRegime: '3', cst: '00', merchandiseOrigin: '0',
        operationType: '1', purpose: '1',
      },
    },
  ] satisfies readonly BuiltinIcmsOwnRule[],
} as const

export interface BuiltinIcmsOwnRule extends FiscalRule {
  sourceUrl: string
  proposedRate: string
  reviewNote: string
  reviewStage: 'CONDITIONS_AND_RATE_APPROVED'
  reviewedOn: string
}
