import type { ItemFiscalAnswers, ItemFiscalContext } from '@motor/contracts'
import { paranaInterstateEntryExclusionReason, type NormalizedNfe, type NormalizedNfeItem } from '@motor/domain'
import { compareDecimals, subtractDecimals, multiplyDecimals, divideDecimals, roundMoney, pendingCalculation, paranaFcpStCoverage, specificStSector } from '@motor/tax-engine'
import { entryRateQuestions } from './entry-rate-context'

/** Recorte expresso: contribuinte PR, uso/ativo, bases normais, sem ST/FCP ou benefício. */
export function buildConsumerDifalContext(nfe: NormalizedNfe, item: NormalizedNfeItem, answers: ItemFiscalAnswers, companyCnpj?: string, externalBlock?: string): ItemFiscalContext {
  const buyer = nfe.operationDirection === '0' ? nfe.issuer : nfe.recipient
  const supplier = nfe.operationDirection === '0' ? nfe.recipient : nfe.issuer
  const tax = item.declaredIcms
  const rule = { id: 'PR_CONSUMER_DIFAL_REVIEWED', version: 1, legalBasis: 'Lei PR 11.580/1996, arts. 2º, VI, 5º, XIV, 6º, IX, § 1º, I, e § 3º, I. Bases distintas de origem e destino; enquadramento e composição confirmados por operação.' }
  const inputs = Object.entries(answers).filter(([key]) => key.startsWith('entry') || key.startsWith('destination')).map(([name,value]) => ({ name, value:String(value), source:'USER/current_item', treatment:'INCLUDED' as const }))
  const positive = (v?: string) => v !== undefined && compareDecimals(v,'0') > 0
  let reason = externalBlock ?? paranaInterstateEntryExclusionReason(nfe,item.cfop,companyCnpj)
  let calculated: ItemFiscalContext['calculation'] | undefined
  try {
    reason ??= nfe.model !== '55' || nfe.purposeCode !== '1' || item.includedInDocumentTotal === false ? 'DIFAL disponível para compra normal, com item incluído na NF-e.' : undefined
    reason ??= !['OWN_USE','FIXED_ASSET'].includes(answers.destination ?? '') || answers.destinationBasis !== 'CONFIRMED' ? 'Confirme uso/consumo ou ativo imobilizado para calcular o DIFAL.' : undefined
    reason ??= nfe.finalConsumerIndicator === '0' && !answers.destinationReviewReason?.trim() ? 'O XML informa operação sem consumidor final. Registre o fundamento da destinação revisada para uso/ativo.' : undefined
    reason ??= buyer?.stateRegistrationIndicator !== '1' ? 'Este cálculo exige destinatário contribuinte identificado no XML.' : undefined
    reason ??= !['1','3'].includes(supplier?.taxRegimeCode ?? '') ? 'O regime do fornecedor exige outra regra de DIFAL.' : undefined
    reason ??= !['6101','6102','6106','2101','2102','2106'].includes(item.cfop ?? '') ? 'O CFOP exige análise própria antes do DIFAL.' : undefined
    reason ??= ['10','30','60','70'].includes(tax?.cst ?? '') || ['201','202','203','500'].includes(tax?.csosn ?? '') || [tax?.stAmount,tax?.stBaseAmount,tax?.retainedStAmount].some(positive) ? 'Há ST informada: confira a retenção e a responsabilidade antes de gerar DIFAL adicional.' : undefined
    reason ??= tax?.cst !== '00' && !['101','102'].includes(tax?.csosn ?? '') || [tax?.baseReductionPercent,tax?.stBaseReductionPercent,tax?.exemptAmount].some(positive) || specificStSector(item.ncm,item.cest,item.fuelAnpCode) ? 'Redução, isenção ou regra setorial exige cálculo específico de DIFAL.' : undefined
    const date = nfe.issuedAt?.slice(0,10)
    reason ??= !date || date < '2024-03-18' || date > '2026-10-12' ? 'Data fora da cobertura conferida deste cálculo de DIFAL.' : undefined
    const coverage = paranaFcpStCoverage(date,item.ncm)
    reason ??= !['UNLISTED','EXCLUDED'].includes(coverage.status) || [tax?.fcpAmount,tax?.fcpStAmount].some(positive) ? 'Este produto exige análise do FECOP; o DIFAL sem adicional não cobre esse caso.' : undefined
    reason ??= answers.entryApplicationConfirmed !== true ? 'Confirme a incidência do DIFAL, ausência de benefício e ausência de retenção ou pagamento que duplique o débito.' : undefined
    reason ??= answers.entryBaseConfirmed !== true ? 'Confirme o valor da operação na origem, incluindo IPI, frete e demais encargos aplicáveis.' : undefined
    reason ??= answers.entryBaseAmount === undefined || answers.entryInternalRate === undefined || answers.entryInterstateRate === undefined ? 'Informe o valor da operação e as alíquotas interna e interestadual para o DIFAL.' : undefined
    if (!reason) {
      const operation = answers.entryBaseAmount!, internal = answers.entryInternalRate!, interstate = answers.entryInterstateRate!
      if (compareDecimals(operation,'0') < 0 || compareDecimals(internal,'0') <= 0 || compareDecimals(internal,'100') >= 0 || compareDecimals(internal,interstate) < 0 || !['4','7','12'].some(v=>compareDecimals(interstate,v)===0)) reason='Confira o valor da operação e as alíquotas; a interna deve ser menor que 100% e não inferior à interestadual de 4%, 7% ou 12%.'
      else {
        const originIcms = divideDecimals(multiplyDecimals(operation,interstate),'100')
        const net = subtractDecimals(operation,originIcms)
        const denominator = subtractDecimals('100',internal)
        const baseNumerator = multiplyDecimals(net,'100')
        const destinationBase = divideDecimals(baseNumerator,denominator,20)
        const difalNumerator = subtractDecimals(multiplyDecimals(net,internal),multiplyDecimals(originIcms,denominator))
        const amount = roundMoney(divideDecimals(difalNumerator,denominator,2))
        calculated={ status:'CALCULATED',component:'ICMS_ENTRY',rule,inputs,
          steps:[{ name:'ICMS da base de origem', operation:'valor da operação confirmado × alíquota interestadual ÷ 100', inputs:{operation,interstateRate:interstate},result:originIcms },
            {name:'Base do DIFAL no Paraná',operation:'(valor da operação − ICMS de origem) ÷ (1 − alíquota interna ÷ 100)',inputs:{operation,originIcms,internalRate:internal,baseNumerator,denominator},result:destinationBase,rounding:{scale:20,mode:'HALF_UP_DISPLAY_ONLY'}},
            {name:'DIFAL de uso/ativo',operation:'base no destino × alíquota interna ÷ 100 − ICMS de origem',inputs:{destinationBase,internalRate:internal,originIcms,difalNumerator,denominator},result:amount,rounding:{scale:2,mode:'HALF_UP'}}],
          result:{component:'ICMS_ENTRY',base:roundMoney(divideDecimals(baseNumerator,denominator,2)),rate:internal,amount} }
      }
    }
  } catch { reason='Há um valor decimal inválido no cálculo de DIFAL.' }
  return { answers,entryRateDifferenceAvailable:true,questions:entryRateQuestions(item),xmlFacts:['DIFAL de uso/ativo para contribuinte. Não aplica MVA nem diferimento parcial de revenda.','A base no destino é recomposta por dentro, sem arredondamento intermediário.'],calculation:calculated ?? {...pendingCalculation('PENDING_DATA',reason ?? 'Complete os dados do DIFAL.',inputs),component:'ICMS_ENTRY',rule} }
}
