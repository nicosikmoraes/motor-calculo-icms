import { pendingCalculation, type CalculationMemory, type CalculationInput } from './calculation-memory'
import { addDecimals, compareDecimals, decimalText, multiplyDecimals, roundMoney, subtractDecimals } from './decimal'

/** Enquadramento confirmado por regra fiscal, nunca inferido apenas do CST do XML. */
export interface ParanaCommonIcmsInput {
  operationDate?: string
  issuerState?: string
  recipientState?: string
  issuerRegime?: 'NORMAL' | 'SIMPLES' | 'MEI'
  recipientIsIcmsTaxpayer?: boolean
  destination?: 'RESALE' | 'INDUSTRIALIZATION' | 'FIXED_ASSET' | 'OWN_USE'
  constructionCompany?: boolean
  petroleumOrFuel?: boolean
  /** Confirmação de cobertura pela alíquota geral, sem ST/FCP/benefício específico. */
  ordinaryTaxTreatmentConfirmed?: boolean
  productAmount?: string
  freightAmount?: string
  insuranceAmount?: string
  otherAmount?: string
  discountAmount?: string
  discountTreatment?: 'UNCONDITIONAL' | 'CONDITIONAL'
  ipiAmount?: string
  ipiTreatment?: 'INCLUDED' | 'EXCLUDED'
  declared?: CalculationMemory['declared']
}

const legalBasis = 'RICMS/PR, art. 17; Anexo VIII, arts. 28 e 29; Decreto 5.143/2024; LC 87/1996, art. 13'

/** Primeiro escopo: saída comum interna PR, regime normal, desde 18/03/2024.
 * Valores opcionais ausentes representam encargos não informados no item.
 * O chamador deve resolver eventuais totais sem distribuição antes de executar.
 */
export function calculateParanaCommonIcms(input: ParanaCommonIcmsInput): CalculationMemory {
  const inputs: CalculationInput[] = Object.entries(input)
    .filter(([name, value]) => name !== 'declared' && value !== undefined)
    .map(([name, value]) => ({ name, value: String(value),
      source: name.endsWith('Amount') ? 'ITEM_VALUES' : 'CONFIRMED_CONTEXT',
      treatment: 'UNDECIDED',
    }))
  const pending = (reason: string, status: 'PENDING_DATA' | 'UNSUPPORTED' = 'PENDING_DATA') =>
    pendingCalculation(status, reason, inputs, input.declared)

  if (!input.operationDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.operationDate)
    || !Number.isFinite(Date.parse(input.operationDate))
    || new Date(input.operationDate).toISOString().slice(0, 10) !== input.operationDate) {
    return pending('Informe uma data válida da operação.')
  }
  if (input.operationDate < '2024-03-18') return pending('Vigência anterior ao escopo inicial.', 'UNSUPPORTED')
  if (!input.issuerState || !input.recipientState || !input.issuerRegime) {
    return pending('Confirme as UFs e o regime do emitente na data da operação.')
  }
  if (input.issuerState !== 'PR' || input.recipientState !== 'PR' || input.issuerRegime !== 'NORMAL') {
    return pending('Operação fora do escopo comum interno PR do regime normal.', 'UNSUPPORTED')
  }
  if (input.ordinaryTaxTreatmentConfirmed === undefined) return pending('Confirme o enquadramento na tributação comum de 19,5%.')
  if (!input.ordinaryTaxTreatmentConfirmed) return pending('Tratamento específico exige outra regra fiscal.', 'UNSUPPORTED')
  if (input.recipientIsIcmsTaxpayer === undefined || !input.destination
    || input.constructionCompany === undefined || input.petroleumOrFuel === undefined) {
    return pending('Confirme a condição do destinatário, a destinação e as exclusões do diferimento parcial.')
  }
  if (input.petroleumOrFuel) return pending('Petróleo e combustíveis exigem tratamento específico.', 'UNSUPPORTED')

  const amounts = {
    product: input.productAmount,
    freight: input.freightAmount ?? '0', insurance: input.insuranceAmount ?? '0',
    other: input.otherAmount ?? '0', discount: input.discountAmount ?? '0', ipi: input.ipiAmount ?? '0',
  }
  if (amounts.product === undefined) return pending('Informe o valor do produto.')
  try {
    for (const value of Object.values(amounts)) {
      if (value === undefined || compareDecimals(decimalText(value), '0') < 0) return pending('Valor negativo requer revisão; não será convertido em positivo.')
    }
  } catch {
    return pending('Valor decimal inválido ou acima do limite de precisão.')
  }
  if (compareDecimals(amounts.discount, '0') > 0 && !input.discountTreatment) return pending('Defina se o desconto é condicional ou incondicional.')
  if (compareDecimals(amounts.ipi, '0') > 0 && !input.ipiTreatment) return pending('Confirme a inclusão ou exclusão legal do IPI na base.')

  try {
    const base = subtractDecimals(addDecimals(amounts.product, amounts.freight, amounts.insurance, amounts.other,
      input.ipiTreatment === 'INCLUDED' ? amounts.ipi : '0'),
    input.discountTreatment === 'UNCONDITIONAL' ? amounts.discount : '0')
    if (compareDecimals(base, '0') < 0) return pending('A composição resultou em base negativa; revise os valores.')
    const deferred = input.recipientIsIcmsTaxpayer && !input.constructionCompany
      && (input.destination === 'RESALE' || input.destination === 'INDUSTRIALIZATION')
    const original = roundMoney(multiplyDecimals(base, '0.195'))
    const due = roundMoney(multiplyDecimals(base, deferred ? '0.12' : '0.195'))
    const deferredAmount = roundMoney(subtractDecimals(original, due))
    return {
      schemaVersion: 1, status: 'CALCULATED',
      rule: { id: deferred ? 'PR_COMMON_195_PARTIAL_DEFERRAL_12' : 'PR_COMMON_195', version: 1, legalBasis },
      inputs: inputs.map(entry => ({ ...entry, treatment:
        (entry.name === 'ipiAmount' && input.ipiTreatment !== 'INCLUDED')
        || (entry.name === 'discountAmount' && input.discountTreatment !== 'UNCONDITIONAL')
          ? 'EXCLUDED' : 'INCLUDED' })),
      steps: [
        { name: 'Base do ICMS próprio', operation: 'produto + frete + seguro + despesas + IPI incluído - desconto incondicional', inputs: {
          ...amounts, product: amounts.product,
          ipiIncluded: input.ipiTreatment === 'INCLUDED' ? amounts.ipi : '0',
          discountDeducted: input.discountTreatment === 'UNCONDITIONAL' ? amounts.discount : '0',
        }, result: base },
        { name: 'ICMS da operação antes do diferimento', operation: 'base × 19,5%', inputs: { base, rate: '19.5' }, result: original, rounding: { scale: 2, mode: 'HALF_UP' } },
        { name: 'ICMS devido na operação', operation: deferred ? 'base × 12%' : 'base × 19,5%', inputs: { base, effectiveRate: deferred ? '12' : '19.5' }, result: due, rounding: { scale: 2, mode: 'HALF_UP' } },
        { name: 'ICMS diferido', operation: 'ICMS original - ICMS devido', inputs: { original, due }, result: deferredAmount, rounding: { scale: 2, mode: 'HALF_UP' } },
      ],
      result: { base, rate: '19.5', amount: due },
      ...(input.declared ? { declared: { ...input.declared } } : {}),
    }
  } catch {
    return pending('A composição excedeu o limite de precisão decimal.')
  }
}
