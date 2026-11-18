import type { EntryAutomationReview } from '@motor/contracts'
import { paranaInterstateEntryExclusionReason, type NormalizedNfe, type NormalizedNfeItem } from '@motor/domain'
import { selectParanaStMva } from '@motor/tax-engine'
import { classificationCandidates } from './product-classification-review'

export const REVOKED_DOMESTIC_ST_SOURCE = 'https://www.legislacao.pr.gov.br/legislacao/exibirAto.do?action=iniciarProcesso&codAto=327771&codItemAto=2074937'
export const CLASSIFICATION_SOURCE = 'https://www.confaz.fazenda.gov.br/legislacao/convenios/2018/CV142_18'

/** Diagnóstico de entrada. Uma sugestão nunca substitui a classificação original ou confirma incidência. */
export function entryAutomationReview(nfe: NormalizedNfe, item: NormalizedNfeItem, companyCnpj?: string): EntryAutomationReview | undefined {
  if (!companyCnpj || paranaInterstateEntryExclusionReason(nfe, item.cfop, companyCnpj)
    || nfe.model !== '55' || nfe.purposeCode !== '1' || item.includedInDocumentTotal === false) return undefined
  const tax = item.declaredIcms
  if (tax?.cst === '60' || tax?.csosn === '500') return {
    category: 'PREVIOUS_ST', title: 'ST anterior identificada',
    reason: 'O CST/CSOSN informa ST cobrada anteriormente. Isso não comprova recolhimento válido para esta entrada no Paraná.',
    nextAction: 'Conferir a retenção e eventuais pagamentos antes de calcular novo débito. A destinação também deve ser confirmada se o XML indicar consumidor final.',
  }
  if (nfe.finalConsumerIndicator !== '0') return {
    category: 'DESTINATION', title: 'Confirmar destinação',
    reason: 'O XML indica consumidor final ou não informa esse indicador. O nome do produto não determina se a compra é para uso, ativo ou revenda.',
    nextAction: 'Escolher a destinação. Para uso/ativo, conferir a base e as alíquotas do DIFAL; para revenda divergente do XML, registrar justificativa.',
  }
  const date = nfe.issuedAt?.slice(0, 10)
  if (date && date >= '2024-08-01' && date <= '2026-10-12' && item.cest === '1400500' && item.ncm?.startsWith('3924')) return {
    category: 'REVOKED_ST', title: 'Regra antiga de ST revogada',
    reason: 'A seção de ST de artefatos domésticos foi revogada a partir de 01/08/2024. Não aplicar a MVA antiga nem a de chupetas/mamadeiras apenas por coincidência de NCM.',
    nextAction: 'Conferir descrição, destinação e eventual antecipação. A revogação desta ST não confirma ausência de outros tributos.',
    sourceUrl: REVOKED_DOMESTIC_ST_SOURCE,
  }
  const selection = selectParanaStMva({ operationDate: date, ncm: item.ncm, cest: item.cest })
  if (selection.status === 'FOUND') return undefined
  const suggested = classificationCandidates(date, item).filter(row => row.suggested)
  if (suggested.length === 1) return {
    category: 'CLASSIFICATION_SUGGESTION', title: 'Classificação sugerida pela descrição',
    reason: `NCM ${item.ncm} e descrição sugerem CEST ${suggested[0]!.cest}, diferente do CEST ${item.cest ?? 'ausente'} do XML. Segmento e condições da operação ainda precisam de conferência.`,
    nextAction: 'Conferir a simulação, confirmar a descrição e registrar o fundamento. A mesma revisão pode calcular automaticamente os produtos equivalentes do lote.',
    sourceUrl: CLASSIFICATION_SOURCE, proposedCatalogRowId: suggested[0]!.id, proposedCest: suggested[0]!.cest,
  }
  return item.cest ? {
    category: 'OUTSIDE_CATALOG', title: 'Enquadramento fora do catálogo', reason: selection.reason,
    nextAction: 'Conferir segmento, descrição legal e regra vigente. Uma candidata pelo NCM não confirma a classificação do produto.',
  } : {
    category: 'MISSING_CEST', title: 'CEST ausente no XML', reason: 'O XML não informa CEST e não há sugestão segura pela descrição neste catálogo.',
    nextAction: 'Conferir se o produto e a operação estão sujeitos à ST e registrar o enquadramento. Não presumir imposto zero nem escolher uma MVA apenas pelo NCM.',
  }
}
