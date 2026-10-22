import { paranaInterstateEntryExclusionReason, type NormalizedNfe, type NormalizedNfeItem } from '@motor/domain'
import { addDecimals, compareDecimals, multiplyDecimals, divideDecimals, roundMoney, subtractDecimals, pendingCalculation, paranaFcpStCoverage, specificStSector, type CalculationMemory, type CalculationComponentMemory } from '@motor/tax-engine'
import type { ItemFiscalAnswers } from '@motor/contracts'
import { purchaseStScope, buildPurchaseStContext } from './purchase-st-context'

/** Estimativa da entrada: não atesta ausência de pagamento anterior ou condições comerciais não contidas no XML. */
export function calculateAutomaticInterstateEntry(nfe: NormalizedNfe, item: NormalizedNfeItem, companyCnpj?: string): CalculationMemory | undefined {
  if (paranaInterstateEntryExclusionReason(nfe, item.cfop, companyCnpj)) return undefined
  const marker = { name: 'automaticCatalogCalculation', value: 'XML_CATALOG_3', source: 'DERIVED/INTERSTATE_XML_AND_PR_RULE', treatment: 'INCLUDED' as const }
  const purpose = { name: 'calculationPurpose', value: 'INTERSTATE_ENTRY_ST_ESTIMATE', source: 'USER_POLICY/INTERSTATE_PURCHASES_PR', treatment: 'INCLUDED' as const }
  const pending = (reason: string, status: 'PENDING_RULE' | 'PENDING_DATA' | 'UNSUPPORTED' = 'PENDING_DATA'): CalculationMemory => ({ ...pendingCalculation(status, reason, [marker, purpose]), component: 'ICMS_ST' })
  try {
    if (nfe.model !== '55' || nfe.purposeCode !== '1' || item.includedInDocumentTotal === false) return pending('Finalidade ou modelo fora da compra normal; devolução, complemento e item excluído exigem tratamento próprio.', 'UNSUPPORTED')
    const supplier = nfe.operationDirection === '0' ? nfe.recipient : nfe.issuer
    const buyer = nfe.operationDirection === '0' ? nfe.issuer : nfe.recipient
    if (!supplier || !buyer) return pending('Identifique fornecedor e comprador da entrada.')
    const tax = item.declaredIcms
    if (!tax) return pending('O XML não informa o grupo de ICMS do produto.')
    // Retenção e destaque existentes seguem para conferência antes de qualquer estimativa nova.
    if (['10','60'].includes(tax.cst ?? '') || ['201','202','203','500'].includes(tax.csosn ?? '') || [tax.stAmount, tax.stBaseAmount, tax.retainedStAmount].some(v=>v !== undefined && compareDecimals(v,'0')>0)) return undefined
    if (nfe.finalConsumerIndicator !== '0') return pending('O XML indica consumidor final. Confirme a destinação: revenda com divergência documental justificada, ou uso/ativo para avaliar DIFAL.')
    if (buyer.stateRegistrationIndicator !== '1') return pending('Confirme a condição de contribuinte do comprador antes da ST de operações subsequentes.')
    if (!['6101','6102','6106','2101','2102','2106'].includes(item.cfop ?? '')) return pending('O CFOP desta operação exige enquadramento específico; a estimativa de ST atende compras para revenda sem retenção anterior.', 'PENDING_RULE')
    const simple = supplier.taxRegimeCode === '1'
    if (!(simple ? ['101','102'].includes(tax.csosn ?? '') : supplier.taxRegimeCode === '3' && tax.cst === '00')) return pending('Regime ou CST/CSOSN exige regra própria; não se presume tributação normal ou ausência de imposto.', 'PENDING_RULE')
    if (specificStSector(item.ncm,item.cest,item.fuelAnpCode) || [tax.baseReductionPercent,tax.stBaseReductionPercent].some(v=>v !== undefined && compareDecimals(v,'0')>0) || [tax.monophaseAmount,tax.monophaseRetainedAmount,tax.monophasePreviouslyRetainedAmount].some(v=>v !== undefined)) return pending('Mercadoria com regra setorial, monofásica ou redução de base exige enquadramento específico.', 'PENDING_RULE')
    const scope = purchaseStScope(nfe,item,{},companyCnpj)
    if (!scope) return pending('A operação não corresponde à compra interestadual da empresa no Paraná.', 'UNSUPPORTED')
    if (scope.catalog.status !== 'FOUND') return pending(scope.catalog.reason, 'PENDING_RULE')
    if (item.productAmount === undefined) return pending('Informe o valor do produto.')
    const coverage = paranaFcpStCoverage(nfe.issuedAt?.slice(0,10),item.ncm)
    if (!['COVERED','EXCLUDED','UNLISTED'].includes(coverage.status)) return pending('reason' in coverage ? coverage.reason : 'Cobertura do FCP precisa de conferência.','PENDING_RULE')
    const fcp = coverage.status === 'COVERED'
    const cosmetics = Boolean(item.ncm && ['3303','3304','3305','3307'].some(prefix=>item.ncm!.startsWith(prefix)) && item.ncm !== '33051000' && !item.ncm.startsWith('330720'))
    const date=nfe.issuedAt?.slice(0,10)
    if (!date || date<'2024-03-18' || date>'2026-10-12') return pending('A alíquota interna desta data precisa de regra vigente conferida.','PENDING_RULE')
    const ownRate = simple ? '12' : tax.rate
    if (!ownRate || !['4','7','12'].some(rate=>compareDecimals(ownRate,rate)===0)) return pending('A alíquota própria interestadual não está disponível ou exige outra regra.')
    if (!simple && tax.amount === undefined) return pending('O ICMS próprio do XML é necessário para a dedução; não será substituído por zero.')
    let discountTreatment: ItemFiscalAnswers['discountTreatment']
    if (item.discountAmount !== undefined && compareDecimals(item.discountAmount,'0')>0) {
      const net = subtractDecimals(addDecimals(item.productAmount,item.freightAmount??'0',item.insuranceAmount??'0',item.otherAmount??'0'),item.discountAmount)
      if (simple || tax.baseAmount === undefined || compareDecimals(net,tax.baseAmount)!==0 || tax.amount === undefined || compareDecimals(roundMoney(divideDecimals(multiplyDecimals(net,ownRate),'100')),tax.amount)!==0) return pending('O desconto do XML não reconcilia com a base e o ICMS próprio. Confirme se é incondicional antes da ST por MVA.')
      discountTreatment='UNCONDITIONAL'
    }
    const answers: ItemFiscalAnswers = { entryMethod:'ICMS_ST', destination:'RESALE', destinationBasis:'ASSUMED_RESALE', stApplicableConfirmed:true,
      stBuyerLiabilityConfirmed:true, stMvaFallbackConfirmed:true, stSimpleDeductionConfirmed:true,
      stMvaMode:simple?'CATALOG_ORIGINAL':'CATALOG_INTERSTATE', stInternalRate:cosmetics?'23':'19.5', stOwnOperationRate:ownRate,
      fcpStApplicableConfirmed:fcp, stInternalRateIncludesFcp:false, ...(discountTreatment?{discountTreatment}:{}) }
    const context=buildPurchaseStContext(nfe,item,answers,scope)
    const provenance=(memory: CalculationComponentMemory): CalculationComponentMemory=>({...memory,inputs:[marker,purpose,...memory.inputs.map(input=>({...input,
      source:input.source.startsWith('USER/') || input.source==='CONFIRMED_CONTEXT' ? ['internalRate','mvaAdjustmentInternalRate'].includes(input.name)?'RULE/PR_11580_ART14':input.name==='ownOperationRate'&&!simple?'XML/pICMS':'USER_POLICY/AUTOMATIC_ENTRY_ESTIMATE':input.source==='ITEM_VALUES'?'XML/item':input.source })),
      { name:'entryCalculationAssumptions', value:JSON.stringify({destination:'RESALE',baseMethod:'MVA',legalDescription:'XML_NCM_CEST_MATCH',priorPayments:'NOT_VERIFIED',liability:'NOT_VERIFIED',discount:discountTreatment??'NONE'}),source:'USER_POLICY/AUTOMATIC_ENTRY_ESTIMATE',treatment:'UNDECIDED'}]})
    const result={...provenance({schemaVersion:1,...context.calculation}),...(context.calculation.additionalComponents?{additionalComponents:context.calculation.additionalComponents.map(c=>provenance({schemaVersion:1,...c}))}:{})} as CalculationMemory
    return result
  } catch { return pending('Há valores inválidos no XML para o cálculo de ST da entrada.') }
}
