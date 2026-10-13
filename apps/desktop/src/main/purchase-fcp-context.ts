import type { ItemFiscalAnswers, ItemFiscalQuestion } from '@motor/contracts'
import type { NormalizedNfe, NormalizedNfeItem } from '@motor/domain'
import { addDecimals, subtractDecimals, compareDecimals, calculateParanaFcpSt, paranaFcpStCoverage,
  pendingCalculation, PARANA_FCP_ST_RULE, type CalculationComponentMemory, type SpecificStMvaDecision } from '@motor/tax-engine'

/** A escolha de incidência é explícita; ausência dos campos FCP não equivale a não incidência. */
export function preparePurchaseFcpContext(nfe: NormalizedNfe, item: NormalizedNfeItem, answers: ItemFiscalAnswers, specific?: SpecificStMvaDecision) {
  const tax = item.declaredIcms
  const specialConditions = { vehicleStConditionsConfirmed: specific?.sector === 'VEHICLE' && specific.status === 'CALCULATED',
    fuelStConditionsConfirmed: specific?.sector === 'FUEL' && specific.status === 'CALCULATED' }
  const coverage = paranaFcpStCoverage(nfe.issuedAt?.slice(0, 10), item.ncm, specialConditions)
  const declared = {
    ...(tax?.fcpStBaseAmount !== undefined ? { base: tax.fcpStBaseAmount } : {}),
    ...(tax?.fcpStRate !== undefined ? { rate: tax.fcpStRate } : {}),
    ...(tax?.fcpStAmount !== undefined ? { amount: tax.fcpStAmount } : {}),
  }
  const questions: ItemFiscalQuestion[] = [
    { field: 'fcpStApplicableConfirmed', label: 'Confirma que esta mercadoria e operação estão sujeitas ao adicional de 2% do FECOP por ST, conforme a vigência e as exceções do art. 14A?',
      options: [{ value: 'true', label: 'Sim — calcular FCP-ST de 2%' }, { value: 'false', label: 'Não — confirmar não incidência' }] },
    { field: 'stInternalRateIncludesFcp', label: 'A alíquota interna que você informou já inclui os 2 pontos do FECOP? Exemplo: 25% total = 23% ICMS + 2% FECOP.',
      options: [{ value: 'true', label: 'Sim — separar 2 pontos da alíquota informada' }, { value: 'false', label: 'Não — a alíquota informada é apenas do ICMS' }] },
  ]
  let reason: string | undefined
  let status: 'PENDING_DATA' | 'PENDING_RULE' = 'PENDING_DATA'
  let icmsRate = answers.stInternalRate
  let adjustmentRate: string | undefined
  try {
    const negativeDeclared = [tax?.fcpStBaseAmount, tax?.fcpStRate, tax?.fcpStAmount].some(value => value !== undefined && compareDecimals(value, '0') < 0)
    const hasDeclared = [tax?.fcpStBaseAmount, tax?.fcpStRate, tax?.fcpStAmount].some(value => value !== undefined && compareDecimals(value, '0') > 0)
    if (negativeDeclared) reason = 'Campo negativo de FCP-ST no XML exige revisão; o valor não será convertido em positivo.'
    else if (answers.fcpStApplicableConfirmed === undefined) reason = 'Confirme a incidência ou não incidência de FCP-ST antes de concluir esta conferência.'
    else if (answers.fcpStApplicableConfirmed === false && hasDeclared) reason = 'A resposta de não incidência conflita com os campos positivos de FCP-ST no XML. Revise o enquadramento ou a nota.'
    else if (coverage.status === 'SPECIAL_RULE' || coverage.status === 'OUTSIDE_COVERAGE' || coverage.status === 'MISSING_DATA') {
      reason = coverage.reason; status = coverage.status === 'MISSING_DATA' ? 'PENDING_DATA' : 'PENDING_RULE'
    } else if (answers.fcpStApplicableConfirmed === false && coverage.status === 'COVERED') {
      reason = `O NCM corresponde a ${coverage.category}, na lista do art. 14A. Confira a classificação e a incidência do FECOP.`; status = 'PENDING_RULE'
    } else if (answers.fcpStApplicableConfirmed && coverage.status !== 'COVERED') {
      reason = coverage.reason; status = 'PENDING_RULE'
    } else if (answers.fcpStApplicableConfirmed && answers.stInternalRateIncludesFcp === undefined) {
      reason = 'Informe se a alíquota interna já inclui os 2 pontos do FECOP para evitar somar o adicional duas vezes.'
    } else if (answers.fcpStApplicableConfirmed && icmsRate !== undefined) {
      if (answers.stInternalRateIncludesFcp) {
        if (compareDecimals(icmsRate, PARANA_FCP_ST_RULE.rate) <= 0) reason = 'A alíquota total informada precisa conter o ICMS e os 2 pontos do FECOP.'
        else icmsRate = subtractDecimals(icmsRate, PARANA_FCP_ST_RULE.rate)
      }
      adjustmentRate = addDecimals(icmsRate, PARANA_FCP_ST_RULE.rate)
    }
  } catch { reason = 'Valor decimal inválido nos campos do FCP-ST ou na alíquota interna.' }
  const notApplicable = answers.fcpStApplicableConfirmed === false && !reason
  function additional(primary: CalculationComponentMemory): CalculationComponentMemory | undefined {
    if (notApplicable) return undefined
    if (reason) return { ...pendingCalculation(status, reason, [
      ...(answers.fcpStApplicableConfirmed !== undefined ? [{ name: 'applicationConfirmed', value: String(answers.fcpStApplicableConfirmed), source: 'USER/current_item', treatment: 'UNDECIDED' as const }] : []),
    ], declared), component: 'FCP_ST' }
    return calculateParanaFcpSt({
      ...(nfe.issuedAt ? { operationDate: nfe.issuedAt.slice(0, 10) } : {}), ...(item.ncm ? { ncm: item.ncm } : {}),
      recipientState: 'PR', applicationConfirmed: true, ...specialConditions,
      baseConfirmed: primary.status === 'CALCULATED',
      ...(primary.status === 'CALCULATED' && primary.result ? { baseAmount: primary.result.base } : {}),
      ...(tax?.fcpAmount !== undefined ? { ownFcpAmount: tax.fcpAmount } : {}), declared,
    })
  }
  return { questions, coverage, reason, status, notApplicable, icmsRate, adjustmentRate, additional }
}
