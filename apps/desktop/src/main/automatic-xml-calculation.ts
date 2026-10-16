import { isCalculationEligibleCfop, type NormalizedNfe, type NormalizedNfeItem } from '@motor/domain'
import { addDecimals, calculateParanaPurchaseIcmsSt, compareDecimals, compareDeclared,
  divideDecimals, multiplyDecimals, pendingCalculation, roundMoney, subtractDecimals, paranaFcpStCoverage, specificStSector,
  type CalculationMemory, type CalculationComponentMemory } from '@motor/tax-engine'
import { buildPurchaseStContext, purchaseStScope } from './purchase-st-context'

export const AUTOMATIC_XML_VERSION = 'XML_ARITHMETIC_1'
export const AUTOMATIC_CATALOG_VERSION = 'XML_CATALOG_1'
export const automaticXmlNotice = 'Calculado automaticamente com os parâmetros declarados no XML. As diferenças aparecem na conferência. A incidência e o enquadramento fiscal podem ser revisados separadamente.'
export function isAutomaticXmlCalculation(memory: { inputs: readonly { name: string; value?: string }[] }): boolean {
  return memory.inputs.some(input => input.name === 'automaticXmlCalculation' && input.value === AUTOMATIC_XML_VERSION)
}
export function isAutomaticCalculation(memory: { inputs: readonly { name: string; value?: string }[] }): boolean {
  return isAutomaticXmlCalculation(memory) || memory.inputs.some(input => input.name === 'automaticCatalogCalculation' && input.value === AUTOMATIC_CATALOG_VERSION)
}
export function automaticCalculationDescription(memory: { inputs: readonly { name: string; value?: string }[] }): string {
  return isAutomaticXmlCalculation(memory) ? automaticXmlNotice
    : 'Calculado automaticamente com os dados da nota e a MVA do catálogo correspondente ao NCM, CEST e data. A memória identifica a origem de cada valor e as divergências com o XML.'
}

/** Aplica a tabela a um cenário de ST explicitamente declarado, sem perguntas repetidas. */
export function calculateAutomaticItem(nfe: NormalizedNfe, item: NormalizedNfeItem, companyCnpj?: string): CalculationMemory | undefined {
  if (!isCalculationEligibleCfop(item.cfop)) return undefined
  const xml = () => calculateAutomaticXmlItem(nfe, item)
  try {
    const tax = item.declaredIcms
    const scope = companyCnpj ? purchaseStScope(nfe, item, {}, companyCnpj) : undefined
    if (!scope || scope.catalog.status !== 'FOUND' || specificStSector(item.ncm, item.cest, item.fuelAnpCode)
      || tax?.cst !== '10' || tax.stBaseMode !== '4' || tax.amount === undefined || tax.stRate === undefined || tax.rate === undefined
      || nfe.finalConsumerIndicator !== '0' || scope.buyer.stateRegistrationIndicator !== '1' || scope.supplier.taxRegimeCode !== '3') return xml()
    const coverage = paranaFcpStCoverage(nfe.issuedAt?.slice(0, 10), item.ncm)
    const declaredFcp = [tax.fcpStAmount, tax.fcpStRate].some(value => value !== undefined && compareDecimals(value, '0') > 0)
    if (coverage.status === 'COVERED' ? !declaredFcp || tax.fcpStRate === undefined || compareDecimals(tax.fcpStRate, '2') !== 0
      : !['UNLISTED', 'EXCLUDED'].includes(coverage.status) || declaredFcp) return xml()
    const context = buildPurchaseStContext(nfe, item, {
      stApplicableConfirmed: true, stMvaMode: scope.supplier.state !== 'PR' && compareDecimals(tax.rate, '4') === 0 ? 'CATALOG_IMPORT_4' : 'CATALOG_ORIGINAL',
      stInternalRate: tax.stRate, stOwnOperationRate: tax.rate, fcpStApplicableConfirmed: declaredFcp, stInternalRateIncludesFcp: false,
    }, scope)
    if (context.blockedReason || context.calculation.status !== 'CALCULATED'
      || context.calculation.additionalComponents?.some(component => component.status !== 'CALCULATED')) return xml()
    const marker = { name: 'automaticCatalogCalculation', value: AUTOMATIC_CATALOG_VERSION, source: 'DERIVED/XML_AND_CATALOG', treatment: 'INCLUDED' as const }
    const provenance = (memory: CalculationComponentMemory): CalculationComponentMemory => ({ ...memory,
      inputs: [marker, ...memory.inputs.map(input => ({ ...input,
        source: input.name === 'internalRate' ? 'XML/pICMSST' : input.name === 'ownOperationRate' ? 'XML/pICMS'
          : input.source.startsWith('USER/') || input.source === 'CONFIRMED_CONTEXT'
          ? input.name === 'mvaMode' ? 'DERIVED/CATALOG_SELECTION'
            : input.name === 'applicationConfirmed' || input.name === 'fcpStApplicableConfirmed' ? 'XML/ICMS10_DECLARED_TREATMENT'
              : input.name === 'stInternalRateIncludesFcp' ? 'DERIVED/XML_SEPARATE_FCP_FIELDS' : 'XML/item'
          : input.source === 'ITEM_VALUES' ? 'XML/item' : input.source,
      }))],
    })
    const result = provenance({ schemaVersion: 1, ...context.calculation }) as CalculationMemory
    if (context.calculation.additionalComponents) result.additionalComponents = context.calculation.additionalComponents.map(component => provenance({ schemaVersion: 1, ...component }))
    if (result.result) {
      const appliedMva = result.steps.find(step => step.name === 'Base de cálculo do ICMS-ST')?.inputs.appliedMvaPercent
      result.comparisons = [compareDeclared('BASE', result.result.base, tax.stBaseAmount), compareDeclared('RATE', result.result.rate, tax.stRate, '0'),
        compareDeclared('ICMS_ST', result.result.amount, tax.stAmount), ...(appliedMva !== undefined ? [compareDeclared('MVA', appliedMva, tax.stMarginPercent, '0.0001')] : [])]
    }
    return result
  } catch { return xml() }
}

/** Reconstitui a aritmética declarada, sem inventar respostas de enquadramento legal. */
export function calculateAutomaticXmlItem(nfe: NormalizedNfe, item: NormalizedNfeItem): CalculationMemory | undefined {
  const tax = item.declaredIcms
  if (!isCalculationEligibleCfop(item.cfop) || !tax || nfe.model !== '55' || nfe.purposeCode !== '1' || item.includedInDocumentTotal === false) return undefined
  const marker = { name: 'automaticXmlCalculation', value: AUTOMATIC_XML_VERSION, source: 'DERIVED/XML', treatment: 'INCLUDED' as const }
  const rule = { id: 'XML_DECLARED_ARITHMETIC', version: 1, legalBasis: 'Reconstituição aritmética dos valores, percentuais e modalidade declarados no XML da NF-e.' }
  const pending = (reason: string, component: 'ICMS' | 'ICMS_ST' = 'ICMS'): CalculationMemory => ({
    ...pendingCalculation('PENDING_DATA', reason, [marker]), component, rule,
  })
  try {
    const st = tax.stAmount !== undefined || tax.stBaseMode !== undefined
    if (st) {
      if (tax.cst !== '10' || tax.stBaseMode !== '4') return undefined
      if ([tax.baseReductionPercent, tax.stBaseReductionPercent].some(value => value !== undefined && compareDecimals(value, '0') !== 0)
        || [tax.monophaseAmount, tax.monophaseRetainedAmount, tax.monophasePreviouslyRetainedAmount].some(value => value !== undefined)) return undefined
      const buyer = nfe.operationDirection === '0' ? nfe.issuer : nfe.recipient
      const supplier = nfe.operationDirection === '0' ? nfe.recipient : nfe.issuer
      if (buyer?.state !== 'PR' || !supplier || !['0', '1'].includes(nfe.operationDirection ?? '')) return undefined
      const missing = [tax.amount === undefined ? 'ICMS próprio (vICMS)' : '', tax.stMarginPercent === undefined ? 'MVA (pMVAST)' : '', tax.stRate === undefined ? 'alíquota ST (pICMSST)' : '',
        tax.rate === undefined ? 'alíquota própria (pICMS)' : '', item.productAmount === undefined ? 'valor do produto (vProd)' : ''].filter(Boolean)
      if (missing.length) return pending(`O XML não informa ${missing.join(', ')}. Complete somente os dados ausentes para calcular.`, 'ICMS_ST')
      const memory = calculateParanaPurchaseIcmsSt({ ...(nfe.issuedAt ? { operationDate: nfe.issuedAt.slice(0, 10) } : {}),
        ...(supplier.state ? { issuerState: supplier.state } : {}), recipientState: buyer.state,
        ...(supplier.taxRegimeCode ? { supplierRegime: supplier.taxRegimeCode } : {}),
        ...(tax.originCode ? { merchandiseOrigin: tax.originCode } : {}), productAmount: item.productAmount!,
        ...(item.ipiAmount !== undefined ? { ipiAmount: item.ipiAmount } : {}),
        ...(item.freightAmount !== undefined ? { freightAmount: item.freightAmount } : {}),
        ...(item.insuranceAmount !== undefined ? { insuranceAmount: item.insuranceAmount } : {}),
        ...(item.otherAmount !== undefined ? { otherAmount: item.otherAmount } : {}),
        ...(item.discountAmount !== undefined ? { discountAmount: item.discountAmount } : {}),
        mvaMode: 'APPLIED_MANUAL', appliedMvaPercent: tax.stMarginPercent!,
        internalRate: tax.stRate!, ownOperationRate: tax.rate!, ownIcmsAmount: tax.amount!,
        // O cenário está declarado em ICMS10/modBCST=4. Este sinal habilita
        // a aritmética; não representa confirmação do contador.
        applicationConfirmed: true,
        declared: { ...(tax.stBaseAmount !== undefined ? { base: tax.stBaseAmount } : {}),
          ...(tax.stRate !== undefined ? { rate: tax.stRate } : {}), ...(tax.stAmount !== undefined ? { amount: tax.stAmount } : {}) },
      })
      const result: CalculationMemory = { ...memory, rule,
        inputs: [marker, ...memory.inputs.filter(input => input.name !== 'applicationConfirmed').map(input => ({ ...input,
          source: input.name.endsWith('Amount') && item[input.name as keyof NormalizedNfeItem] === undefined
            && !['ownIcmsAmount', 'productAmount'].includes(input.name) ? 'LAYOUT_ABSENT' : 'XML/item',
        }))],
      }
      if (memory.result) result.comparisons = [compareDeclared('BASE', memory.result.base, tax.stBaseAmount),
        compareDeclared('RATE', memory.result.rate, tax.stRate, '0'), compareDeclared('ICMS_ST', memory.result.amount, tax.stAmount)]
      const fcpDeclared = [tax.fcpStBaseAmount, tax.fcpStRate, tax.fcpStAmount].some(value => value !== undefined && compareDecimals(value, '0') !== 0)
      if (fcpDeclared) {
        let fcp: CalculationComponentMemory
        if (!memory.result || memory.status !== 'CALCULATED') fcp = { ...pendingCalculation('PENDING_DATA', 'A base de ST precisa ser calculada antes do FCP-ST.', [marker]), component: 'FCP_ST' }
        else if (tax.fcpStRate === undefined || tax.fcpStAmount === undefined) fcp = { ...pendingCalculation('PENDING_DATA', 'Complete a alíquota e o valor de FCP-ST ausentes no XML.', [marker]), component: 'FCP_ST' }
        else {
          if (compareDecimals(tax.fcpStRate, '0') < 0 || compareDecimals(tax.fcpStRate, '100') > 0
            || [tax.fcpStBaseAmount, tax.fcpStAmount].some(value => value !== undefined && compareDecimals(value, '0') < 0)) return pending('Os campos de FCP-ST contêm valores inválidos.', 'ICMS_ST')
          const amount = roundMoney(divideDecimals(multiplyDecimals(memory.result.base, tax.fcpStRate), '100'))
          fcp = { schemaVersion: 1, status: 'CALCULATED', component: 'FCP_ST', rule,
            inputs: [marker, { name: 'fcpStRate', value: tax.fcpStRate, source: 'XML/item', treatment: 'INCLUDED' }],
            steps: [{ name: 'FCP-ST declarado', operation: 'base ST recalculada × pFCPST ÷ 100', inputs: { base: memory.result.base, rate: tax.fcpStRate }, result: amount, rounding: { scale: 2, mode: 'HALF_UP' } }],
            result: { component: 'FCP_ST', base: memory.result.base, rate: tax.fcpStRate, amount },
            declared: { ...(tax.fcpStBaseAmount !== undefined ? { base: tax.fcpStBaseAmount } : {}), rate: tax.fcpStRate, amount: tax.fcpStAmount },
            comparisons: [compareDeclared('BASE', memory.result.base, tax.fcpStBaseAmount), compareDeclared('FCP_ST', amount, tax.fcpStAmount)] }
        }
        result.additionalComponents = [fcp]
      }
      return result
    }
    if (tax.cst !== '00' || tax.baseMode !== '3' || tax.baseReductionPercent !== undefined && compareDecimals(tax.baseReductionPercent, '0') !== 0
      || [tax.fcpAmount, item.ipiAmount].some(value => value !== undefined && compareDecimals(value, '0') > 0)) return undefined
    if (item.productAmount === undefined || tax.rate === undefined) return pending('O XML precisa informar valor do produto e alíquota de ICMS para calcular automaticamente.')
    const amounts = { productAmount: item.productAmount, freightAmount: item.freightAmount ?? '0', insuranceAmount: item.insuranceAmount ?? '0',
      otherAmount: item.otherAmount ?? '0', discountAmount: item.discountAmount ?? '0' }
    if (Object.values(amounts).some(value => compareDecimals(value, '0') < 0) || compareDecimals(tax.rate, '0') < 0 || compareDecimals(tax.rate, '100') > 0) return pending('O XML contém valores ou alíquota inválidos para o cálculo automático.')
    const base = subtractDecimals(addDecimals(amounts.productAmount, amounts.freightAmount, amounts.insuranceAmount, amounts.otherAmount), amounts.discountAmount)
    if (compareDecimals(base, '0') < 0) return pending('O desconto informado supera a base da operação.')
    const amount = roundMoney(divideDecimals(multiplyDecimals(base, tax.rate), '100'))
    return { schemaVersion: 1, status: 'CALCULATED', component: 'ICMS', rule,
      inputs: [marker, ...Object.entries(amounts).map(([name, value]) => ({ name, value, source: item[name as keyof NormalizedNfeItem] === undefined ? 'LAYOUT_ABSENT' : 'XML/item', treatment: 'INCLUDED' as const })),
        { name: 'rate', value: tax.rate, source: 'XML/item', treatment: 'INCLUDED' }],
      steps: [{ name: 'Base do ICMS conforme XML', operation: 'produto + frete + seguro + despesas − desconto', inputs: amounts, result: base },
        { name: 'ICMS conforme XML', operation: 'base recalculada × pICMS ÷ 100', inputs: { base, rate: tax.rate }, result: amount, rounding: { scale: 2, mode: 'HALF_UP' } }],
      result: { component: 'ICMS', base, rate: tax.rate, amount }, declared: { ...(tax.baseAmount !== undefined ? { base: tax.baseAmount } : {}), rate: tax.rate, ...(tax.amount !== undefined ? { amount: tax.amount } : {}) },
      comparisons: [compareDeclared('BASE', base, tax.baseAmount), compareDeclared('ICMS', amount, tax.amount)] }
  } catch { return pending('O XML contém um valor decimal inválido. Revise os campos destacados antes de calcular.') }
}
