import type { ItemFiscalAnswers, ItemFiscalContext, ItemFiscalQuestion } from '@motor/contracts'
import type { NormalizedNfe, NormalizedNfeItem } from '@motor/domain'
import { addDecimals, subtractDecimals, calculateParanaEntryRateDifference, compareDecimals, PARANA_ENTRY_RATE_REFERENCE, pendingCalculation } from '@motor/tax-engine'

export function entryRateDifferenceAvailable(nfe: NormalizedNfe, companyCnpj?: string): boolean {
  return nfe.operationDirection === '1' && nfe.model === '55' && nfe.purposeCode === '1'
    && nfe.recipient?.state === 'PR' && Boolean(companyCnpj && nfe.recipient.taxId === companyCnpj && nfe.issuer.taxId !== companyCnpj)
    && nfe.issuer.state !== undefined && nfe.issuer.state !== 'PR'
}

export function entryRateQuestions(item: NormalizedNfeItem): ItemFiscalQuestion[] {
  return [
    { field: 'destination', label: 'Destinação adotada para esta compra — revenda é a premissa padrão enquanto não houver informação específica.', options: [
      { value: 'RESALE', label: 'Revenda' }, { value: 'INDUSTRIALIZATION', label: 'Industrialização' },
      { value: 'FIXED_ASSET', label: 'Ativo imobilizado' }, { value: 'OWN_USE', label: 'Uso ou consumo' },
    ] },
    { field: 'destinationReviewReason', label: 'Quando a destinação adotada divergir do indicador de consumidor final do XML, registre a justificativa e a evidência da revisão.', inputType: 'text' },
    { field: 'entryInterstateRate', label: 'Alíquota interestadual do DIFAL (%) — 4%, 7% ou 12%, conferida conforme origem e mercadoria', inputType: 'decimal', ...(item.declaredIcms?.rate !== undefined ? { suggestedValue: item.declaredIcms.rate } : {}) },
    { field: 'entryMethod', label: 'Qual obrigação de entrada será conferida para este produto?', options: [
      { value: 'RATE_DIFFERENCE', label: 'Antecipação por diferença de alíquotas, sem ST' },
      { value: 'ICMS_ST', label: 'ICMS-ST da entrada por operações subsequentes' },
      { value: 'CONSUMER_DIFAL', label: 'DIFAL para uso/consumo ou ativo imobilizado (contribuinte)' },
      { value: 'NO_DEBIT', label: 'Sem novo débito de entrada, com justificativa' },
    ] },
    { field: 'entryApplicationConfirmed', label: 'Confirma comprador contribuinte, destinação para comercialização ou industrialização e antecipação desta mercadoria importada a 4%, sem ST ou benefício que afaste o recolhimento, com a carga efetiva aplicável?', options: [
      { value: 'true', label: 'Sim, confirmei o enquadramento' }, { value: 'false', label: 'Não, manter pendente' },
    ] },
    { field: 'entryBaseAmount', label: 'Base legal revisada da antecipação (R$) — conferir IPI e demais encargos aplicáveis', inputType: 'decimal',
      ...(item.declaredIcms?.baseAmount !== undefined ? { suggestedValue: item.declaredIcms.baseAmount } : {}) },
    { field: 'entryBaseConfirmed', label: 'Confirma a base legal informada acima, com os encargos e tributos aplicáveis?', options: [
      { value: 'true', label: 'Sim, base conferida' }, { value: 'false', label: 'Não, exige revisão' },
    ] },
    { field: 'entryInternalRate', label: 'Carga interna efetiva da antecipação (%) — 12% somente quando aplicável o diferimento parcial do art. 28',
      inputType: 'decimal', suggestedValue: PARANA_ENTRY_RATE_REFERENCE.suggestedInternalRate },
    { field: 'entryNoDebitConfirmed', label: 'Confirma que este produto não gera novo débito de antecipação ou ST para o adquirente nesta entrada?', options: [
      { value: 'true', label: 'Sim, hipótese conferida' }, { value: 'false', label: 'Não, manter pendente' },
    ] },
    { field: 'entryNoDebitReason', label: 'Justificativa e fundamento do não recolhimento (por exemplo, retenção já realizada ou hipótese legal de não incidência)', inputType: 'text' },
  ]
}

export function buildEntryNoDebitContext(item: NormalizedNfeItem, answers: ItemFiscalAnswers, block?: string): ItemFiscalContext {
  const reason = answers.entryNoDebitReason?.trim()
  const pending = block ?? (answers.entryNoDebitConfirmed !== true || !reason ? 'Confirme a ausência de novo débito e registre o fundamento desta decisão.' : undefined)
  const rule = { id: 'PR_ENTRY_NO_NEW_DEBIT', version: 1, legalBasis: reason ?? 'Decisão fiscal ainda sem fundamento.' }
  return { entryRateDifferenceAvailable: !block, answers, questions: entryRateQuestions(item), xmlFacts: ['Decisão expressa do responsável pela conferência; não decorre de campos zerados no XML.'],
    ...(block ? { blockedReason: block } : {}), calculation: pending ? { ...pendingCalculation('PENDING_DATA', pending), component: 'ICMS_ENTRY', rule }
      : { status: 'CALCULATED', component: 'ICMS_ENTRY', rule, inputs: [],
        steps: [{ name: 'Entrada sem novo débito', operation: 'ausência de nova obrigação confirmada com fundamento registrado', inputs: { reason: reason! }, result: '0.00' }],
        result: { component: 'ICMS_ENTRY', base: '0.00', rate: '0', amount: '0.00' } } }
}

export function buildEntryRateContext(nfe: NormalizedNfe, item: NormalizedNfeItem, answers: ItemFiscalAnswers, block?: string): ItemFiscalContext {
  const tax = item.declaredIcms
  const positive = (v?: string) => v !== undefined && compareDecimals(v, '0') > 0
  const reason = block ?? (item.includedInDocumentTotal === false ? 'Item não incluído no total da nota.' : undefined)
    ?? (['OWN_USE','FIXED_ASSET'].includes(answers.destination ?? '') ? 'A destinação informada é uso/consumo ou ativo. A antecipação para comercialização/industrialização exige outra destinação.' : undefined)
    ?? (!['6101', '6102'].includes(item.cfop ?? '') ? 'A antecipação para comercialização/industrialização deste módulo exige venda CFOP 6101/6102. Amostra grátis, bonificação e outras remessas exigem confirmar a destinação e regra própria.' : undefined)
    ?? (nfe.finalConsumerIndicator === '1' || nfe.recipient?.stateRegistrationIndicator === '9' ? 'Consumidor final exige outra regra; este módulo atende antecipação para comercialização ou industrialização.' : undefined)
    ?? (tax?.cst !== '00' || positive(tax?.stAmount) || positive(tax?.stBaseAmount) || positive(tax?.baseReductionPercent)
      ? 'A nota indica ST, redução ou tratamento diferente de CST 00. Confira outra regra antes da antecipação.' : undefined)
  return { entryRateDifferenceAvailable: true, answers, questions: entryRateQuestions(item), xmlFacts: [
    `Emitente ${nfe.issuer.state ?? 'não informado'}; destinatário PR.`,
    `Base de ICMS próprio no XML: R$ ${tax?.baseAmount ?? 'não informada'}. Base adotada para antecipação: R$ ${answers.entryBaseAmount ?? tax?.baseAmount ?? 'não informada'}.`, 'Antecipação do adquirente; não é o ICMS próprio destacado pelo fornecedor.',
  ], ...(reason ? { blockedReason: reason } : {}), calculation: reason ? { ...pendingCalculation('UNSUPPORTED', reason), component: 'ICMS_ENTRY' }
    : calculateParanaEntryRateDifference({ operationDate: nfe.issuedAt?.slice(0, 10), issuerState: nfe.issuer.state, recipientState: nfe.recipient?.state,
      supplierRegime: nfe.issuer.taxRegimeCode, merchandiseOrigin: tax?.originCode, baseAmount: answers.entryBaseAmount ?? tax?.baseAmount, interstateRate: tax?.rate,
      internalRate: answers.entryInternalRate, applicationConfirmed: answers.entryApplicationConfirmed, baseConfirmed: answers.entryBaseConfirmed }) }
}
