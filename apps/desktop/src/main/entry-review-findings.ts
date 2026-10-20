import type { NormalizedNfe, NormalizedNfeItem } from '@motor/domain'
import type { ItemFiscalAnswers } from '@motor/contracts'
import { compareDecimals, paranaStMvaCandidates, selectParanaStMva } from '@motor/tax-engine'
import { purchaseDestinationAnswers, RESALE_DEFAULT_NOTICE } from './purchase-destination-policy'
import { entryClassificationFindings } from './entry-classification-findings'

/** Triagem documental, sem confirmar destinação, incidência ou imposto a recolher. */
export function entryReviewFindings(nfe: NormalizedNfe, item: NormalizedNfeItem, answers: ItemFiscalAnswers = {}) {
  const selection = selectParanaStMva({ operationDate: nfe.issuedAt?.slice(0,10), ncm: item.ncm, cest: item.cest })
  const candidates = paranaStMvaCandidates(nfe.issuedAt?.slice(0,10),item.ncm)
  const findings: { code: string; reason: string }[] = []
  const add = (code: string, reason: string) => findings.push({ code, reason })
  findings.push(...entryClassificationFindings(item))
  const destination = purchaseDestinationAnswers(nfe,answers,nfe.recipient?.taxId)
  if (destination.destinationBasis === 'ASSUMED_RESALE') add('ASSUMED_RESALE', RESALE_DEFAULT_NOTICE)
  if (nfe.finalConsumerIndicator === '1' && ['RESALE','INDUSTRIALIZATION'].includes(destination.destination ?? ''))
    add('DOCUMENT_DESTINATION_CONFLICT', 'Destinação adotada: revenda/industrialização. O XML indica consumidor final; a divergência documental continua em revisão.')
  if (item.cfop === '6911') add('FREE_SAMPLE', 'CFOP 6911 indica amostra grátis. Revenda é a premissa quando faltar informação específica; o conflito com a remessa documental exige revisão da regra aplicável.')
  if (item.cfop === '6910') add('BONUS', 'CFOP 6910: bonificação/doação/brinde. A premissa de revenda não confirma a relação com a compra nem o enquadramento da remessa.')
  if ([item.declaredIcms?.stAmount,item.declaredIcms?.fcpStAmount].some(value => value !== undefined && compareDecimals(value,'0') > 0))
    add('RETENTION_RECONCILIATION', 'Há ST/FCP-ST destacado: reconciliar retenção válida para o PR e recolhimentos antes de gerar novo débito.')
  if (selection.status === 'FOUND') add('LEGAL_DESCRIPTION', `Conferir a descrição legal do CEST ${selection.row.cest}: ${selection.row.description.split(' (')[0]}.`)
  else if (candidates.length) add('CLASSIFICATION_REVIEW', `CEST ${item.cest ?? 'ausente'} sem correspondência neste catálogo. Candidatas por NCM exigem revisão da descrição e fundamento registrado.`)
  else add('OUTSIDE_CATALOG', 'Sem correspondência no catálogo de higiene/cosméticos e construção. Isso não comprova ausência de ST; conferir segmento e descrição legal.')
  if (candidates.some(row => row.article === 12)) add('MVA_PRECEDENCE', 'Art. 97 do Anexo IX: confirmar inexistência de preço máximo/sugerido prevalente, interdependência e marketing direto antes de usar MVA comum.')
  if (nfe.issuer.taxRegimeCode === '1') add('SIMPLE_SUPPLIER', 'Remetente CRT 1: MVA original e dedução pela alíquota interestadual na base própria conferida; não usar o crédito do Simples.')
  if (item.ncm === '40151900') add('GLOVE_SCOPE', 'A MVA de 28,6% localizada na Resolução 571/2019, art. 20, III, pertence à venda porta a porta. Confirmar modalidade de venda e características da luva; não aplicar pela classificação isolada.')
  return { selection, candidates, findings }
}
