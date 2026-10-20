import { pendingCalculation, type CalculationMemory } from './calculation-memory'
import { compareDecimals, decimalText, divideDecimals, multiplyDecimals, roundMoney, subtractDecimals } from './decimal'

export const PARANA_ENTRY_RATE_REFERENCE = {
  id: 'PR_ENTRY_RATE_DIFFERENCE', version: 1, suggestedInternalRate: '12',
  legalBasis: 'RICMS/PR, art. 16, § 1º, III, e Anexo VIII, art. 28. Antecipação na entrada; incidência, base e carga efetiva confirmadas por operação.',
  sourceUrl: 'https://www.sefanet.pr.gov.br/dados/SEFADOCUMENTOS/116202402024.pdf',
} as const

export interface ParanaEntryRateDifferenceInput {
  operationDate?: string | undefined; issuerState?: string | undefined; recipientState?: string | undefined
  supplierRegime?: string | undefined; merchandiseOrigin?: string | undefined
  baseAmount?: string | undefined; interstateRate?: string | undefined; internalRate?: string | undefined
  applicationConfirmed?: boolean | undefined; baseConfirmed?: boolean | undefined
}

/** Obrigação do adquirente, distinta do ICMS próprio e do DIFAL de consumidor final. */
export function calculateParanaEntryRateDifference(input: ParanaEntryRateDifferenceInput): CalculationMemory {
  const inputs = Object.entries(input).filter(([, value]) => value !== undefined).map(([name, value]) => ({
    name, value: String(value), source: name === 'baseAmount' || name === 'interstateRate' || name === 'merchandiseOrigin' ? 'XML/item' : 'CONFIRMED_CONTEXT', treatment: 'INCLUDED' as const,
  }))
  const pending = (reason: string, status: 'PENDING_DATA' | 'UNSUPPORTED' = 'PENDING_DATA'): CalculationMemory => ({
    ...pendingCalculation(status, reason, inputs), component: 'ICMS_ENTRY', rule: PARANA_ENTRY_RATE_REFERENCE,
  })
  const date = input.operationDate
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) return pending('Informe uma data válida da operação.')
  if (date < '2024-03-18' || date > '2026-10-18') return pending('Data fora da vigência conferida desta versão da antecipação de entrada.', 'UNSUPPORTED')
  const states = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']
  if (input.recipientState !== 'PR' || !states.includes(input.issuerState ?? '')) return pending('Esta antecipação atende aquisição interestadual destinada ao Paraná.', 'UNSUPPORTED')
  if (input.supplierRegime !== '3') return pending('Fornecedor fora do regime normal exige regra própria para a antecipação.', 'UNSUPPORTED')
  if (input.applicationConfirmed !== true) return pending('Confirme a antecipação na entrada, sem ST ou benefício que afaste o recolhimento, e a carga efetiva aplicável.')
  if (input.baseConfirmed !== true) return pending('Confirme a base legal adotada para esta antecipação, incluindo os encargos e tributos aplicáveis.')
  if (input.baseAmount === undefined || input.interstateRate === undefined || input.internalRate === undefined) return pending('Informe base, alíquota interestadual e carga interna efetiva da entrada.')
  try {
    const base = decimalText(input.baseAmount), interstate = decimalText(input.interstateRate), internal = decimalText(input.internalRate)
    if ([base, interstate, internal].some(v => compareDecimals(v, '0') < 0) || compareDecimals(internal, '100') > 0) return pending('Base e alíquotas devem ser não negativas e as alíquotas não podem exceder 100%.')
    if (compareDecimals(interstate, '4') !== 0 || !['1','2','3','8'].includes(input.merchandiseOrigin ?? '')) return pending('Este recorte atende mercadoria importada na operação interestadual a 4%. Outros enquadramentos exigem regra própria.', 'UNSUPPORTED')
    if (compareDecimals(internal, interstate) < 0) return pending('A carga interna é inferior à interestadual. Revise a hipótese antes de calcular.')
    const own = divideDecimals(multiplyDecimals(base, interstate), '100')
    const internalAmount = divideDecimals(multiplyDecimals(base, internal), '100')
    const exact = subtractDecimals(internalAmount, own)
    return { schemaVersion: 1, component: 'ICMS_ENTRY', status: 'CALCULATED', rule: PARANA_ENTRY_RATE_REFERENCE, inputs,
      steps: [
        { name: 'ICMS interestadual da entrada', operation: 'base confirmada × alíquota interestadual ÷ 100, sem arredondamento intermediário', inputs: { base, interstateRate: interstate }, result: own },
        { name: 'ICMS interno da entrada', operation: 'base confirmada × carga interna efetiva ÷ 100, sem arredondamento intermediário', inputs: { base, internalRate: internal }, result: internalAmount },
        { name: 'Diferencial de entrada', operation: 'ICMS interno − ICMS interestadual; arredondamento final por item', inputs: { internalAmount, interstateAmount: own, exactAmount: exact }, result: roundMoney(exact), rounding: { scale: 2, mode: 'HALF_UP' } },
      ], result: { component: 'ICMS_ENTRY', base: roundMoney(base), rate: internal, amount: roundMoney(exact) } }
  } catch { return pending('Valor decimal inválido ou acima do limite de precisão na antecipação.') }
}
