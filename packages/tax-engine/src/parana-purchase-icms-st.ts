import { pendingCalculation, type CalculationInput, type CalculationMemory } from './calculation-memory'
import { addDecimals, compareDecimals, decimalText, divideDecimals, multiplyDecimals, roundMoney, subtractDecimals } from './decimal'

/** Entradas explícitas para a primeira planilha de ICMS-ST de compras no Paraná. */
export interface ParanaPurchaseIcmsStInput {
  discountTreatment?: 'UNCONDITIONAL' | 'CONDITIONAL' | undefined
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
  originalMvaPercent?: string
  mvaMode?: 'APPLIED_MANUAL' | 'ORIGINAL' | 'ADJUSTED_IMPORT_4' | 'ADJUSTED_INTERSTATE'
  merchandiseOrigin?: string
  supplierRegime?: string
  /** CRT 1: base própria conferida sem IPI; a dedução não usa pCredSN/vCredICMSSN. */
  simpleDeductionBase?: string
  simpleDeductionConfirmed?: boolean
  /** Alíquota interna do PR informada pela regra fiscal aplicável ao NCM/CEST. */
  internalRate?: string
  /** Carga interna usada no ajuste de MVA, incluindo FECOP quando aplicável. */
  mvaAdjustmentInternalRate?: string
  /** Alíquota própria da operação, como usada na planilha anexada. */
  ownOperationRate?: string
  /** ICMS da operação própria, quando a dedução usa o valor devido informado na NF-e. */
  ownIcmsAmount?: string
  applicationConfirmed?: boolean
  declared?: CalculationMemory['declared']
}

const legalBasis = 'Resolução SEFA/PR 571/2019 (MVA original e alterações vigentes na data); RICMS/PR, Anexo IX; LC 87/1996, art. 8º, II e § 5º; método informado na planilha de ICMS-ST do usuário'

/**
 * Confere ICMS-ST em compra destinada ao Paraná, seguindo o método explícito da
 * planilha: BC ST = (valor do produto + encargos + IPI) × (1 + MVA); ICMS-ST =
 * BC ST × alíquota interna - ICMS próprio da operação. MVA e alíquotas precisam
 * ser confirmadas na vigência e no enquadramento do produto; esta função não faz
 * lookup de NCM/CEST. O chamador pode fornecer a MVA original e selecionar o
 * ajuste para importados interestaduais a 4%, de remetente no regime normal.
 */
export function calculateParanaPurchaseIcmsSt(input: ParanaPurchaseIcmsStInput): CalculationMemory {
  const inputs: CalculationInput[] = Object.entries(input)
    .filter(([name, value]) => name !== 'declared' && value !== undefined)
    .map(([name, value]) => ({ name, value: String(value),
      source: name.endsWith('Amount') ? 'ITEM_VALUES' : 'CONFIRMED_CONTEXT', treatment: 'UNDECIDED' }))
  const pending = (reason: string, status: 'PENDING_DATA' | 'UNSUPPORTED' = 'PENDING_DATA') =>
    ({ ...pendingCalculation(status, reason, inputs, input.declared), component: 'ICMS_ST' as const })

  if (!input.operationDate || !/^\d{4}-\d{2}-\d{2}$/.test(input.operationDate)
    || !Number.isFinite(Date.parse(input.operationDate))
    || new Date(input.operationDate).toISOString().slice(0, 10) !== input.operationDate) {
    return pending('Informe uma data válida da operação.')
  }
  if (input.operationDate < '2019-07-04') return pending('Vigência anterior à Resolução SEFA/PR 571/2019.', 'UNSUPPORTED')
  if (input.recipientState !== 'PR') return pending('Este cálculo atende somente mercadorias destinadas ao Paraná.', 'UNSUPPORTED')
  if (!input.issuerState || !input.recipientState) return pending('Confirme as UFs do emitente e do destinatário.')
  if (!['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'].includes(input.issuerState)) {
    return pending('Importação direta ou UF de origem não identificada exige outra regra fiscal.', 'UNSUPPORTED')
  }
  if (input.supplierRegime === undefined) return pending('Confirme que o fornecedor está no regime normal (CRT 3).')
  const simple = input.supplierRegime === '1'
  if (!simple && input.supplierRegime !== '3') return pending('Regime do fornecedor fora da cobertura CRT 1/3.', 'UNSUPPORTED')
  if (simple && (input.issuerState === 'PR' || !['0','4','5'].includes(input.merchandiseOrigin ?? '')))
    return pending('O recorte do Simples atende remetente interestadual e mercadoria nacional (origem 0, 4 ou 5). Outros casos exigem regra própria.', 'UNSUPPORTED')
  if (simple && (input.simpleDeductionConfirmed !== true || input.simpleDeductionBase === undefined))
    return pending('Confirme a base da operação própria do remetente do Simples, sem usar o crédito permitido como dedução da ST.')
  if (input.applicationConfirmed !== true) return pending('Confirme a incidência de ICMS-ST e a MVA aplicável ao NCM/CEST nesta data.')
  const mvaMode = input.mvaMode ?? 'APPLIED_MANUAL'
  if (simple && mvaMode !== 'ORIGINAL') return pending('Remetente do Simples exige MVA original, sem ajuste interestadual (Anexo IX, arts. 1º, § 4º, e 11, § 4º).')
  const mvaValue = mvaMode === 'APPLIED_MANUAL' ? input.appliedMvaPercent : input.originalMvaPercent
  if (input.productAmount === undefined || mvaValue === undefined
    || input.internalRate === undefined || input.ownOperationRate === undefined) {
    const missing = [input.productAmount === undefined ? 'valor do produto' : '', mvaValue === undefined ? 'MVA aplicada' : '',
      input.internalRate === undefined ? 'alíquota interna de ICMS' : '', input.ownOperationRate === undefined ? 'alíquota da operação própria' : ''].filter(Boolean)
    return pending(`Preencha ${missing.join(', ')} para concluir o cálculo de ICMS-ST.`)
  }

  try {
    const amounts = {
      product: decimalText(input.productAmount), ipi: decimalText(input.ipiAmount ?? '0'),
      freight: decimalText(input.freightAmount ?? '0'), insurance: decimalText(input.insuranceAmount ?? '0'),
      other: decimalText(input.otherAmount ?? '0'), discount: decimalText(input.discountAmount ?? '0'),
    }
    const declaredOwnIcms = input.ownIcmsAmount !== undefined ? decimalText(input.ownIcmsAmount) : undefined
    const mva = decimalText(mvaValue)
    const internalRate = decimalText(input.internalRate)
    const adjustmentRate = decimalText(input.mvaAdjustmentInternalRate ?? input.internalRate)
    const ownRate = decimalText(input.ownOperationRate)
    const simpleBase = simple ? decimalText(input.simpleDeductionBase!) : undefined
    if (simple && (ownRate !== '12' || input.ownIcmsAmount !== undefined))
      return pending('Neste recorte do Simples, a dedução usa a base própria confirmada × alíquota interestadual de 12%, sem ICMS declarado ou crédito do Simples.')
    for (const value of [...Object.values(amounts), mva, internalRate, adjustmentRate, ownRate, ...(declaredOwnIcms !== undefined ? [declaredOwnIcms] : []), ...(simpleBase !== undefined ? [simpleBase] : [])]) {
      if (compareDecimals(value, '0') < 0) return pending('Valor negativo requer revisão; não será convertido em positivo.')
    }
    if (compareDecimals(internalRate, '100') > 0 || compareDecimals(adjustmentRate, '100') > 0 || compareDecimals(ownRate, '100') > 0) {
      return pending('As alíquotas informadas excedem 100%.')
    }
    if (compareDecimals(mva, '1000') > 0) return pending('A MVA informada excede o limite de 1000%.')
    const importedFour = input.issuerState !== input.recipientState && compareDecimals(ownRate, '4') === 0
    if (importedFour && input.merchandiseOrigin !== undefined && !['1', '2', '3', '8'].includes(input.merchandiseOrigin)) {
      return pending('A origem da mercadoria informada não comprova o enquadramento na operação interestadual a 4%. Revise a classificação e a alíquota.')
    }
    if (mvaMode === 'ORIGINAL' && importedFour) {
      return pending('A operação interestadual a 4% exige conferir o ajuste de MVA. Use o ajuste para importados ou informe a MVA final com a regra específica.')
    }
    if (mvaMode === 'ADJUSTED_IMPORT_4' && (!importedFour || !['1', '2', '3', '8'].includes(input.merchandiseOrigin ?? '')
      || input.supplierRegime !== '3')) {
      return pending('O ajuste automático cobre operação interestadual a 4%, mercadoria importada (origem 1, 2, 3 ou 8) e remetente do regime normal. Confira esses dados.')
    }
    const adjustedMode = mvaMode === 'ADJUSTED_IMPORT_4' || mvaMode === 'ADJUSTED_INTERSTATE'
    if (mvaMode === 'ADJUSTED_INTERSTATE' && (input.issuerState === input.recipientState || !['4','7','12'].includes(ownRate)
      || (ownRate === '4' && !['1','2','3','8'].includes(input.merchandiseOrigin ?? '')))) return pending('O ajuste interestadual específico exige operação interestadual normal a 4%, 7% ou 12% e origem compatível.')
    if (adjustedMode && compareDecimals(adjustmentRate, '100') >= 0) {
      return pending('A alíquota interna deve ser inferior a 100% para ajustar a MVA.')
    }
    if (compareDecimals(amounts.discount, '0') > 0 && input.discountTreatment === undefined) {
      return pending('A planilha não define o tratamento do desconto na base de ICMS-ST; confirme a regra específica antes de calcular.')
    }
    if (!simple && declaredOwnIcms === undefined && [amounts.freight, amounts.insurance, amounts.other].some(amount => compareDecimals(amount, '0') > 0)) {
      return pending('Com encargos, confirme o ICMS devido na operação própria para a dedução. O valor do produto isolado não determina essa dedução.')
    }

    // A planilha aplica a MVA ao valor do produto com IPI. Encargos informados
    // também entram na base da ST; o desconto fica pendente até haver regra.
    const grossOperationBase = addDecimals(amounts.product, amounts.ipi, amounts.freight, amounts.insurance, amounts.other)
    const operationBase = input.discountTreatment === 'UNCONDITIONAL' ? subtractDecimals(grossOperationBase, amounts.discount) : grossOperationBase
    if (compareDecimals(operationBase, '0') < 0) return pending('O desconto supera o valor da operação.')
    // Manter a razão sem arredondar a MVA intermediária. A divisão de exibição
    // tem 20 casas; base/ICMS finais são calculados diretamente da razão exata.
    const adjustMva = adjustedMode && compareDecimals(adjustmentRate, ownRate) >= 0
    const multiplierNumerator = adjustMva
      ? multiplyDecimals(addDecimals('100', mva), subtractDecimals('100', ownRate)) : addDecimals('100', mva)
    const multiplierDenominator = adjustMva
      ? multiplyDecimals('100', subtractDecimals('100', adjustmentRate)) : '100'
    const appliedMva = adjustMva
      ? divideDecimals(multiplyDecimals(subtractDecimals(multiplierNumerator, multiplierDenominator), '100'), multiplierDenominator, 20) : mva
    const stBaseNumerator = multiplyDecimals(operationBase, multiplierNumerator)
    const stBase = divideDecimals(stBaseNumerator, multiplierDenominator, 20)
    const internalNumerator = multiplyDecimals(stBaseNumerator, internalRate)
    const internalDenominator = multiplyDecimals(multiplierDenominator, '100')
    const internalIcms = divideDecimals(internalNumerator, internalDenominator, 20)
    const ownIcms = simpleBase !== undefined ? divideDecimals(multiplyDecimals(simpleBase, ownRate), '100')
      : declaredOwnIcms ?? divideDecimals(multiplyDecimals(amounts.product, ownRate), '100')
    const stNumerator = subtractDecimals(internalNumerator, multiplyDecimals(ownIcms, internalDenominator))
    if (compareDecimals(stNumerator, '0') < 0) return pending(`O ICMS interno projetado (R$ ${roundMoney(internalIcms).replace('.', ',')}) é menor que o ICMS próprio a deduzir (R$ ${roundMoney(ownIcms).replace('.', ',')}). Confira a alíquota interna informada (${internalRate.replace('.', ',')}%) e a MVA aplicada (${appliedMva.replace('.', ',')}%).`)
    const stAmount = roundMoney(divideDecimals(stNumerator, internalDenominator, 2))

    return {
      schemaVersion: 1, status: 'CALCULATED', component: 'ICMS_ST',
      rule: { id: 'PARANA_PURCHASE_ICMS_ST_MVA', version: 5,
        legalBasis: legalBasis + (mvaMode === 'ADJUSTED_IMPORT_4' ? '; SEFA/PR, Cálculo da MVA ajustada para importados sujeitos a 4%'
          : mvaMode === 'ADJUSTED_INTERSTATE' ? '; RICMS/PR, Anexo IX, art. 1º, §§ 5º e 6º (ajuste geral interestadual)' : '')
          + (simple ? '; RICMS/PR, Anexo IX, arts. 1º, § 4º, II/III, e 11, § 4º; Convênio ICMS 35/2011; Resolução do Senado 22/1989' : '') },
      inputs: inputs.map(entry => ({ ...entry, treatment: entry.name === 'discountAmount' && compareDecimals(amounts.discount, '0') === 0
        ? 'EXCLUDED' : 'INCLUDED' })),
      steps: [
        ...(adjustedMode ? [{ name: mvaMode === 'ADJUSTED_IMPORT_4' ? 'MVA ajustada para importados a 4%' : 'MVA ajustada interestadual',
          operation: adjustMva ? '[(1 + MVA original/100) × (1 − alíquota interestadual/100) ÷ (1 − carga interna/100) − 1] × 100; exibição com 20 casas, razão exata usada no imposto' : 'Carga interna inferior à interestadual: usar MVA original, art. 1º, § 6º',
          inputs: { originalMvaPercent: mva, interstateRate: ownRate, internalRate: adjustmentRate, icmsInternalRate: internalRate, multiplierNumerator, multiplierDenominator }, result: appliedMva,
          rounding: { scale: 20, mode: 'HALF_UP_DISPLAY_ONLY' } }] : []),
        { name: 'Base antes da MVA', operation: input.discountTreatment === 'UNCONDITIONAL' ? 'produto + IPI + frete + seguro + despesas − desconto incondicional (Consulta SEFA/PR 038/2018)' : 'valor do produto + IPI + frete + seguro + outras despesas informadas',
          inputs: amounts, result: operationBase },
        { name: 'Base de cálculo do ICMS-ST', operation: 'base antes da MVA × (1 + MVA aplicada ÷ 100)',
          inputs: { operationBase, appliedMvaPercent: appliedMva, multiplierNumerator, multiplierDenominator }, result: stBase },
        { name: 'ICMS interno projetado', operation: 'base de cálculo ST × alíquota interna ÷ 100',
          inputs: { stBase: decimalText(stBase), internalRate }, result: decimalText(internalIcms) },
        { name: 'ICMS próprio da operação', operation: simple ? 'base própria confirmada × alíquota interestadual do Senado; sem dedução do crédito do Simples' : declaredOwnIcms !== undefined
          ? 'ICMS da operação própria informado na NF-e, usado na dedução da ST'
          : 'valor do produto × alíquota própria ÷ 100, conforme a planilha sem encargos',
          inputs: { productAmount: amounts.product, ownOperationRate: ownRate,
            ...(simpleBase !== undefined ? { simpleDeductionBase: simpleBase } : {}),
            ...(declaredOwnIcms !== undefined ? { ownIcmsAmount: declaredOwnIcms } : {}) }, result: decimalText(ownIcms) },
        { name: 'ICMS-ST calculado', operation: 'ICMS interno projetado - ICMS próprio da operação; arredondado para centavos',
          inputs: { internalIcms: decimalText(internalIcms), ownIcms: decimalText(ownIcms), stNumerator, internalDenominator }, result: stAmount,
          rounding: { scale: 2, mode: 'HALF_UP' } },
      ],
      result: { component: 'ICMS_ST', base: roundMoney(divideDecimals(stBaseNumerator, multiplierDenominator, 2)), rate: internalRate, amount: stAmount },
      ...(input.declared ? { declared: { ...input.declared } } : {}),
    }
  } catch {
    return pending('Valor decimal inválido ou acima do limite de precisão.')
  }
}
