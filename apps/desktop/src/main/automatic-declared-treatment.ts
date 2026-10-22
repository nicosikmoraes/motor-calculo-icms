import { documentaryTaxReview } from '@motor/contracts'
import type { NormalizedNfe, NormalizedNfeItem } from '@motor/domain'
import { compareDecimals, compareDeclared, divideDecimals, multiplyDecimals, pendingCalculation,
  roundMoney, subtractDecimals, type CalculationMemory, type CalculationInput } from '@motor/tax-engine'

/** Conferência documental: nunca transforma retenção anterior em débito atual. */
export function calculateDeclaredTreatment(nfe: NormalizedNfe, item: NormalizedNfeItem,
  marker: CalculationInput, rule: NonNullable<CalculationMemory['rule']>): CalculationMemory | undefined {
  const tax = item.declaredIcms
  if (!tax || nfe.issuer.state !== 'PR' || nfe.recipient?.state !== 'PR' || nfe.operationDirection !== '1') return undefined
  const inputs: CalculationInput[] = [marker, ...Object.entries(tax).filter(([key]) => !['group', 'originCode'].includes(key))
    .map(([name, value]) => ({ name, value, source: 'XML/ICMS', treatment: 'INCLUDED' as const }))]
  const pending = (reason: string): CalculationMemory => ({ ...pendingCalculation('PENDING_DATA', reason, inputs), rule })
  const validNonnegative = (value: string | undefined) => value === undefined || compareDecimals(value, '0') >= 0
  const percentage = (value: string) => compareDecimals(value, '0') >= 0 && compareDecimals(value, '100') <= 0
  const currentAmounts = [tax.amount, tax.stAmount, tax.fcpAmount, tax.fcpStAmount, tax.destinationAmount, tax.originAmount,
    tax.stDestinationAmount, tax.effectiveIcmsAmount, tax.stBaseAmount, tax.stRate, tax.fcpRate, tax.fcpBaseAmount, tax.fcpStRate, tax.fcpStBaseAmount, tax.destinationFcpRate, tax.destinationFcpAmount]
  if ([tax.monophaseAmount, tax.monophaseRetainedAmount, tax.monophasePreviouslyRetainedAmount].some(v => v !== undefined)) return undefined
  if (['102', '103', '300', '400'].includes(tax.csosn ?? '') && tax.group === 'ICMSSN102' && nfe.issuer.taxRegimeCode !== '1')
    return pending('O XML informa código do Simples sem destaque, mas o regime do emitente não é CRT 1. Confira a inconsistência de regime e código tributário.')
  const previousSt = tax.cst === '60' && ['ICMS60', 'ICMSST'].includes(tax.group ?? '') || tax.csosn === '500' && tax.group === 'ICMSSN500'
  const simple = ['102', '103', '300', '400'].includes(tax.csosn ?? '') && tax.group === 'ICMSSN102' && nfe.issuer.taxRegimeCode === '1'
  const exempt = tax.cst === '40' && tax.group === 'ICMS40'
  if (previousSt || simple || exempt) {
    if (!currentAmounts.every(validNonnegative) || ![tax.retainedStBaseAmount, tax.retainedStAmount, tax.substituteIcmsAmount,
      tax.retainedFcpStBaseAmount, tax.retainedFcpStAmount, tax.exemptAmount].every(validNonnegative)
      || [tax.retainedStRate, tax.retainedFcpStRate].some(v => v !== undefined && !percentage(v))) return pending('O XML contém valores inválidos de retenção ou destaque. Confira o documento.')
    if (currentAmounts.some(v => v !== undefined && compareDecimals(v, '0') !== 0)) return undefined
    const treatment = previousSt ? 'PREVIOUS_ST' : simple ? 'SIMPLE_WITHOUT_HIGHLIGHT' : 'EXEMPT_DECLARED'
    const component = previousSt ? 'ICMS_ST' as const : 'ICMS' as const
    const documentedInputs: CalculationInput[] = [...inputs.filter(input => input.name !== marker.name).map(input => ({ ...input, treatment: 'EXCLUDED' as const,
      reason: 'Valor declarado na etapa anterior ou tratamento documental; não totalizado como débito atual.' })), marker,
      { name: 'xmlTreatment', value: treatment, source: 'DERIVED/XML_TAX_GROUP', treatment: 'UNDECIDED' }]
    return { schemaVersion: 1, status: 'PENDING_RULE', component, rule,
      reason: documentaryTaxReview({ inputs: documentedInputs })!.reason,
      inputs: documentedInputs, steps: [] }
  }
  if (tax.cst === '51' && tax.group === 'ICMS51') {
    if (tax.baseAmount === undefined || tax.rate === undefined || tax.deferralPercent === undefined)
      return pending('O diferimento precisa de vBC, pICMS e pDif do XML. Reimporte o arquivo se este lote foi criado antes da leitura desses campos.')
    if (!validNonnegative(tax.baseAmount) || !percentage(tax.rate) || !percentage(tax.deferralPercent)) return pending('A base ou os percentuais de diferimento do XML são inválidos.')
    if ([tax.stAmount, tax.fcpAmount, tax.fcpStAmount, tax.destinationAmount, tax.originAmount].some(v => v !== undefined && compareDecimals(v, '0') !== 0)) return undefined
    const operation = roundMoney(divideDecimals(multiplyDecimals(tax.baseAmount, tax.rate), '100'))
    const deferred = roundMoney(divideDecimals(multiplyDecimals(operation, tax.deferralPercent), '100'))
    const amount = roundMoney(subtractDecimals(operation, deferred))
    return { schemaVersion: 1, status: 'CALCULATED', component: 'ICMS', rule, deferredAmount: deferred,
      inputs: [...inputs, { name: 'xmlTreatment', value: 'DEFERRED_ICMS', source: 'DERIVED/XML_TAX_GROUP', treatment: 'INCLUDED' }],
      steps: [{ name: 'ICMS da operação', operation: 'vBC × pICMS ÷ 100', inputs: { base: tax.baseAmount, rate: tax.rate }, result: operation, rounding: { scale: 2, mode: 'HALF_UP' } },
        { name: 'ICMS diferido', operation: 'ICMS da operação × pDif ÷ 100', inputs: { operation, deferralPercent: tax.deferralPercent }, result: deferred, rounding: { scale: 2, mode: 'HALF_UP' } },
        { name: 'ICMS após diferimento', operation: 'ICMS da operação − ICMS diferido', inputs: { operation, deferred }, result: amount }],
      result: { component: 'ICMS', base: tax.baseAmount, rate: tax.rate, amount },
      declared: { base: tax.baseAmount, rate: tax.rate, ...(tax.amount !== undefined ? { amount: tax.amount } : {}) },
      comparisons: [compareDeclared('ICMS', amount, tax.amount)] }
  }
  // Sem fórmula de composição coberta, confere a base ST declarada; não inventa MVA.
  const declaredBaseNeeded = tax.stBaseMode !== '4' || [item.discountAmount, tax.baseReductionPercent, tax.stBaseReductionPercent]
    .some(v => v !== undefined && compareDecimals(v, '0') > 0)
  if (tax.cst !== '10' || !declaredBaseNeeded || tax.stBaseMode === undefined) return undefined
  if (!/^[0-6]$/.test(tax.stBaseMode)) return pending('A modalidade de base ST informada no XML é inválida.')
  if (tax.stBaseAmount === undefined || tax.stRate === undefined || tax.amount === undefined) return undefined
  if (!validNonnegative(tax.stBaseAmount) || !validNonnegative(tax.amount) || !percentage(tax.stRate) || compareDecimals(tax.stRate, '0') === 0)
    return pending('A base ST, a alíquota ST ou o ICMS próprio do XML precisa ser corrigido antes da conferência.')
  const amount = roundMoney(subtractDecimals(divideDecimals(multiplyDecimals(tax.stBaseAmount, tax.stRate), '100'), tax.amount))
  if (compareDecimals(amount, '0') < 0) return pending('A dedução do ICMS próprio supera o ICMS da base ST declarada. Confira o XML.')
  const memory: CalculationMemory = { schemaVersion: 1, status: 'CALCULATED', component: 'ICMS_ST', rule,
    reason: 'Conferência pela base ST declarada no XML. A composição dessa base e o enquadramento legal podem ser conferidos na memória.',
    inputs: [...inputs, { name: 'xmlTreatment', value: 'DECLARED_ST_BASE', source: 'DERIVED/XML_BASE_MODE', treatment: 'INCLUDED' }],
    steps: [{ name: 'ICMS-ST pela base declarada', operation: 'vBCST × pICMSST ÷ 100 − vICMS', inputs: { base: tax.stBaseAmount, rate: tax.stRate, ownIcms: tax.amount }, result: amount, rounding: { scale: 2, mode: 'HALF_UP' } }],
    result: { component: 'ICMS_ST', base: tax.stBaseAmount, rate: tax.stRate, amount },
    declared: { base: tax.stBaseAmount, rate: tax.stRate, ...(tax.stAmount !== undefined ? { amount: tax.stAmount } : {}) },
    comparisons: [compareDeclared('ICMS_ST', amount, tax.stAmount)] }
  const fcpPresent = [tax.fcpStAmount, tax.fcpStRate, tax.fcpStBaseAmount].some(v => v !== undefined && compareDecimals(v, '0') !== 0)
  if (fcpPresent) {
    if (tax.fcpStRate === undefined || tax.fcpStBaseAmount === undefined || !percentage(tax.fcpStRate) || !validNonnegative(tax.fcpStBaseAmount))
      memory.additionalComponents = [{ ...pendingCalculation('PENDING_DATA', 'Complete a base e a alíquota do FCP-ST ausentes ou inválidas no XML.', [marker]), component: 'FCP_ST' }]
    else {
      const fcpAmount = roundMoney(divideDecimals(multiplyDecimals(tax.fcpStBaseAmount, tax.fcpStRate), '100'))
      memory.additionalComponents = [{ schemaVersion: 1, status: 'CALCULATED', component: 'FCP_ST', rule, inputs: [marker],
        steps: [{ name: 'FCP-ST pela base declarada', operation: 'vBCFCPST × pFCPST ÷ 100', inputs: { base: tax.fcpStBaseAmount, rate: tax.fcpStRate }, result: fcpAmount }],
        result: { component: 'FCP_ST', base: tax.fcpStBaseAmount, rate: tax.fcpStRate, amount: fcpAmount },
        declared: { base: tax.fcpStBaseAmount, rate: tax.fcpStRate, ...(tax.fcpStAmount !== undefined ? { amount: tax.fcpStAmount } : {}) }, comparisons: [compareDeclared('FCP_ST', fcpAmount, tax.fcpStAmount)] }]
    }
  }
  return memory
}
