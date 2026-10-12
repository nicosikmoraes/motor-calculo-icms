import { pendingCalculation, type CalculationInput, type CalculationMemory } from './calculation-memory'
import { addDecimals, compareDecimals, decimalText, divideDecimals, multiplyDecimals, roundMoney, subtractDecimals } from './decimal'

/** Entradas explícitas para a primeira planilha de ICMS-ST de compras no Paraná. */
export interface ParanaPurchaseIcmsStInput {
  operationDate?: string
  issuerState?: string
  recipientState?: string
  productAmount?: string
  ipiAmount?: string
  freightAmount?: string
  insuranceAmount?: string
  otherAmount?: string
  discountAmount?: string
  /** Percentual final que será aplicado, confirmado pelo contador na vigência da operação. */
  appliedMvaPercent?: string
  /** Alíquota interna do PR informada pela regra fiscal aplicável ao NCM/CEST. */
  internalRate?: string
  /** Alíquota própria da operação, como usada na planilha anexada. */
  ownOperationRate?: string
  applicationConfirmed?: boolean
  declared?: CalculationMemory['declared']
}

const legalBasis = 'Resolução SEFA/PR 571/2019 (MVA original e alterações vigentes na data); RICMS/PR, Anexo IX; LC 87/1996, arts. 11 e 13; método informado na planilha de ICMS-ST do usuário'

/**
 * Confere ICMS-ST em compra destinada ao Paraná, seguindo o método explícito da
 * planilha: BC ST = (valor do produto + encargos + IPI) × (1 + MVA); ICMS-ST =
 * BC ST × alíquota interna - ICMS próprio da operação. MVA e alíquotas precisam
 * ser confirmadas na vigência e no enquadramento do produto; esta função não faz
 * lookup de NCM/CEST nem decide se a MVA interestadual precisa de ajuste.
 */
export function calculateParanaPurchaseIcmsSt(input: ParanaPurchaseIcmsStInput): CalculationMemory {
  const inputs: CalculationInput[] = Object.entries(input)
    .filter(([name, value]) => name !== 'declared' && value !== undefined)
    .map(([name, value]) => ({ name, value: String(value),
      source: name.endsWith('Amount') ? 'ITEM_VALUES' : 'CONFIRMED_CONTEXT', treatment: 'UNDECIDED' }))
  const pending = (reason: string, status: 'PENDING_DATA' | 'UNSUPPORTED' = 'PENDING_DATA') =>
    pendingCalculation(status, reason, inputs, input.declared)

  if (!input.operationDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.operationDate)
    || !Number.isFinite(Date.parse(input.operationDate))
    || new Date(input.operationDate).toISOString().slice(0, 10) !== input.operationDate) {
    return pending('Informe uma data válida da operação.')
  }
  if (input.operationDate < '2019-07-04') return pending('Vigência anterior à Resolução SEFA/PR 571/2019.', 'UNSUPPORTED')
  if (input.recipientState !== 'PR') return pending('Este cálculo atende somente mercadorias destinadas ao Paraná.', 'UNSUPPORTED')
  if (!input.issuerState || !input.recipientState) return pending('Confirme as UFs do emitente e do destinatário.')
  if (input.applicationConfirmed !== true) return pending('Confirme a incidência de ICMS-ST e a MVA aplicável ao NCM/CEST nesta data.')
  if (input.productAmount === undefined || input.appliedMvaPercent === undefined
    || input.internalRate === undefined || input.ownOperationRate === undefined) {
    return pending('Informe o valor do produto, a MVA aplicada, a alíquota interna e a alíquota da operação própria.')
  }

  try {
    const amounts = {
      product: decimalText(input.productAmount), ipi: decimalText(input.ipiAmount ?? '0'),
      freight: decimalText(input.freightAmount ?? '0'), insurance: decimalText(input.insuranceAmount ?? '0'),
      other: decimalText(input.otherAmount ?? '0'), discount: decimalText(input.discountAmount ?? '0'),
    }
    const mva = decimalText(input.appliedMvaPercent)
    const internalRate = decimalText(input.internalRate)
    const ownRate = decimalText(input.ownOperationRate)
    for (const value of [...Object.values(amounts), mva, internalRate, ownRate]) {
      if (compareDecimals(value, '0') < 0) return pending('Valor negativo requer revisão; não será convertido em positivo.')
    }
    if (compareDecimals(internalRate, '100') > 0 || compareDecimals(ownRate, '100') > 0) {
      return pending('As alíquotas informadas excedem 100%.')
    }
    if (compareDecimals(amounts.discount, '0') > 0) {
      return pending('A planilha não define o tratamento do desconto na base de ICMS-ST; confirme a regra específica antes de calcular.')
    }

    // A planilha aplica a MVA ao valor do produto com IPI. Encargos informados
    // também entram na base da ST; o desconto fica pendente até haver regra.
    const operationBase = addDecimals(amounts.product, amounts.ipi, amounts.freight, amounts.insurance, amounts.other)
    const mvaAmount = divideDecimals(multiplyDecimals(operationBase, mva), '100')
    const stBase = addDecimals(operationBase, mvaAmount)
    const internalIcms = divideDecimals(multiplyDecimals(stBase, internalRate), '100')
    const ownIcms = divideDecimals(multiplyDecimals(amounts.product, ownRate), '100')
    const stAmount = subtractDecimals(internalIcms, ownIcms)
    if (compareDecimals(stAmount, '0') < 0) return pending('O ICMS próprio supera o ICMS interno projetado. Revise as alíquotas e a regra aplicável.')

    return {
      schemaVersion: 1, status: 'CALCULATED',
      rule: { id: 'PARANA_PURCHASE_ICMS_ST_MVA', version: 1, legalBasis },
      inputs: inputs.map(entry => ({ ...entry, treatment: entry.name === 'discountAmount' && compareDecimals(amounts.discount, '0') === 0
        ? 'EXCLUDED' : 'INCLUDED' })),
      steps: [
        { name: 'Base antes da MVA', operation: 'valor do produto + IPI + frete + seguro + outras despesas informadas',
          inputs: amounts, result: operationBase },
        { name: 'Base de cálculo do ICMS-ST', operation: 'base antes da MVA × (1 + MVA aplicada ÷ 100)',
          inputs: { operationBase, appliedMvaPercent: mva, mvaAmount }, result: decimalText(stBase) },
        { name: 'ICMS interno projetado', operation: 'base de cálculo ST × alíquota interna ÷ 100',
          inputs: { stBase: decimalText(stBase), internalRate }, result: decimalText(internalIcms) },
        { name: 'ICMS próprio da operação', operation: 'valor do produto × alíquota própria ÷ 100',
          inputs: { productAmount: amounts.product, ownOperationRate: ownRate }, result: decimalText(ownIcms) },
        { name: 'ICMS-ST calculado', operation: 'ICMS interno projetado - ICMS próprio da operação; arredondado para centavos',
          inputs: { internalIcms: decimalText(internalIcms), ownIcms: decimalText(ownIcms) }, result: roundMoney(stAmount),
          rounding: { scale: 2, mode: 'HALF_UP' } },
      ],
      result: { component: 'ICMS_ST', base: roundMoney(stBase), rate: internalRate, amount: roundMoney(stAmount) },
      ...(input.declared ? { declared: { ...input.declared } } : {}),
    }
  } catch {
    return pending('Valor decimal inválido ou acima do limite de precisão.')
  }
}
