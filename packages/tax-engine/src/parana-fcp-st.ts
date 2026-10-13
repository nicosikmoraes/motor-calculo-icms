import { pendingCalculation, type CalculationComponentMemory } from './calculation-memory'
import { compareDeclared } from './declared-comparison'
import { compareDecimals, decimalText, divideDecimals, multiplyDecimals, roundMoney } from './decimal'

export const PARANA_FCP_ST_RULE = {
  id: 'PARANA_FCP_ST_2', version: 2, rate: '2', validFrom: '2019-07-04', verifiedThrough: '2026-10-12',
  legalBasis: 'Lei PR 11.580/1996, art. 14A; RICMS/PR, Anexo XII, arts. 1º, 2º, II, a, e 4º; Anexo IX, art. 1º, §§ 9º e 10; Lei PR 20.554/2021, arts. 2º e 5º',
  sourceUrl: 'https://www.legislacao.pr.gov.br/legislacao/pesquisarAto.do?action=exibir&codAto=278020&codTipoAto=1&tipoVisualizacao=compilado',
} as const

export type ParanaFcpStCoverage = { status: 'COVERED'; category: string }
  | { status: 'EXCLUDED' | 'UNLISTED' | 'MISSING_DATA' | 'OUTSIDE_COVERAGE' | 'SPECIAL_RULE'; reason: string }

/** Recorte das mercadorias; a descrição e incidência concretas são confirmadas no contexto. */
export function paranaFcpStCoverage(date?: string, ncm?: string, context?: { vehicleStConditionsConfirmed?: boolean; fuelStConditionsConfirmed?: boolean }): ParanaFcpStCoverage {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))
    || new Date(date).toISOString().slice(0, 10) !== date || !ncm || !/^\d{8}$/.test(ncm)) {
    return { status: 'MISSING_DATA', reason: 'Confirme data válida e NCM de oito dígitos para conferir o FCP-ST.' }
  }
  if (date < PARANA_FCP_ST_RULE.validFrom || date > PARANA_FCP_ST_RULE.verifiedThrough) return {
    status: 'OUTSIDE_COVERAGE', reason: 'A versão do FCP-ST foi conferida para operações de 04/07/2019 a 12/10/2026. Outra data exige atualização da regra.' }
  if (context?.vehicleStConditionsConfirmed && ['8702','8703','8704','8711'].some(prefix => ncm.startsWith(prefix))) {
    return date >= '2021-08-04' ? { status: 'COVERED', category: 'Veículos automotores novos sob ST, art. 14A, IX' }
      : { status: 'UNLISTED', reason: 'Operação anterior aos efeitos do adicional para veículos da Lei 20.554/2021 (04/08/2021).' }
  }
  if (context?.fuelStConditionsConfirmed && ['2710','2711'].some(prefix => ncm.startsWith(prefix)) && ncm !== '27101259') return {
    status: 'UNLISTED', reason: 'Combustível/lubrificante na hipótese confirmada do art. 50, sem categoria de FECOP coberta nesta operação.' }
  if (['8701', '8702', '8703', '8704', '8705', '8706', '8711', '2710'].some(prefix => ncm.startsWith(prefix))) return {
    status: 'SPECIAL_RULE', reason: 'Veículos e combustíveis exigem conferência própria da incidência, vigência e base do FECOP. Não estão cobertos por este módulo.' }
  if (ncm === '33051000' || ncm.startsWith('330720')) return { status: 'EXCLUDED',
    reason: 'Xampus NCM 3305.10.00 e desodorantes NCM 3307.20 estão nas exceções do art. 14A, VI.' }
  const categories: [readonly string[], string][] = [
    [['3303', '3304', '3305', '3307'], 'Perfumes e cosméticos'],
    [['2201'], 'Água mineral'], [['2202'], 'Bebidas do art. 14A, VII'],
    [['7113', '7114'], 'Artefatos de joalheria e ourivesaria'],
    [['2203', '2204', '2205', '2206', '2208'], 'Cervejas, chopes e bebidas alcoólicas'],
    [['24'], 'Fumo e produtos de tabacaria'],
  ]
  const category = categories.find(([prefixes]) => prefixes.some(prefix => ncm.startsWith(prefix)))
  return category ? { status: 'COVERED', category: category[1] }
    : { status: 'UNLISTED', reason: 'Produto fora das categorias cobertas por esta versão do FCP-ST. Veículos e outros tratamentos exigem módulo próprio.' }
}

export interface ParanaFcpStInput {
  operationDate?: string; ncm?: string; recipientState?: string
  applicationConfirmed?: boolean; baseConfirmed?: boolean; baseAmount?: string
  vehicleStConditionsConfirmed?: boolean; fuelStConditionsConfirmed?: boolean
  ownFcpAmount?: string
  declared?: CalculationComponentMemory['declared']
}

/** FCP-ST PR = base ST calculada × 2%, sem deduzir o ICMS próprio. */
export function calculateParanaFcpSt(input: ParanaFcpStInput): CalculationComponentMemory {
  const inputs = Object.entries(input).filter(([name, value]) => name !== 'declared' && value !== undefined)
    .map(([name, value]) => ({ name, value: String(value), source: name === 'vehicleStConditionsConfirmed' || name === 'fuelStConditionsConfirmed' ? 'DERIVED/ST_SPECIFIC_RULE' : name === 'baseAmount' || name === 'baseConfirmed'
      ? 'DERIVED/ICMS_ST_RESULT' : name === 'applicationConfirmed' ? 'USER/current_item' : name === 'ncm' || name === 'ownFcpAmount'
        ? 'XML/item' : 'XML/document', treatment: 'UNDECIDED' as const }))
  const pending = (reason: string, status: 'PENDING_DATA' | 'PENDING_RULE' | 'UNSUPPORTED' = 'PENDING_DATA'): CalculationComponentMemory =>
    ({ ...pendingCalculation(status, reason, inputs, input.declared), component: 'FCP_ST' })
  if (input.recipientState !== 'PR') return pending('Este FCP-ST atende compras destinadas ao Paraná.', 'UNSUPPORTED')
  if (input.applicationConfirmed !== true) return pending('Confirme a incidência de FCP-ST na descrição e vigência da operação.')
  const coverage = paranaFcpStCoverage(input.operationDate, input.ncm, input)
  if (coverage.status !== 'COVERED') return pending(coverage.reason, coverage.status === 'MISSING_DATA' ? 'PENDING_DATA' : 'PENDING_RULE')
  if (input.baseConfirmed !== true || input.baseAmount === undefined) return pending('O FCP-ST precisa da base de ICMS-ST calculada; a base declarada não será usada como resultado.')
  try {
    if (input.ownFcpAmount !== undefined && compareDecimals(input.ownFcpAmount, '0') !== 0) {
      return pending('A nota informa FCP na operação própria. Confira o tratamento específico; esta versão não compensa nem deduz esse valor.', 'PENDING_RULE')
    }
    const base = decimalText(input.baseAmount)
    if (compareDecimals(base, '0') < 0 || (base.split('.')[1]?.length ?? 0) > 2) return pending('A base confirmada do FCP-ST deve ser não negativa e estar em centavos.')
    const rawAmount = divideDecimals(multiplyDecimals(base, PARANA_FCP_ST_RULE.rate), '100')
    const result = { component: 'FCP_ST' as const, base: roundMoney(base), rate: PARANA_FCP_ST_RULE.rate, amount: roundMoney(rawAmount) }
    return { schemaVersion: 1, component: 'FCP_ST', status: 'CALCULATED',
      rule: { id: PARANA_FCP_ST_RULE.id, version: PARANA_FCP_ST_RULE.version, legalBasis: PARANA_FCP_ST_RULE.legalBasis },
      inputs: [...inputs.map(entry => ({ ...entry, treatment: 'INCLUDED' as const })),
        { name: 'fcpStRule', value: JSON.stringify({ ...PARANA_FCP_ST_RULE, category: coverage.category }),
          source: 'RULE/PARANA_FCP_ST_2/v2', treatment: 'INCLUDED' }],
      steps: [{ name: 'FCP-ST', operation: 'base ST calculada × 2/100; sem dedução de ICMS próprio ou compensação de créditos',
        inputs: { base, rate: PARANA_FCP_ST_RULE.rate }, result: result.amount, rounding: { scale: 2, mode: 'HALF_UP' } }],
      result, ...(input.declared ? { declared: { ...input.declared } } : {}),
      comparisons: [compareDeclared('BASE', result.base, input.declared?.base),
        compareDeclared('RATE', result.rate, input.declared?.rate, '0'), compareDeclared('FCP_ST', result.amount, input.declared?.amount)],
    }
  } catch { return pending('Valor decimal inválido ou acima do limite de precisão no FCP-ST.') }
}
