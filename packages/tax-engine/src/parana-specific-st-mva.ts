import type { CalculationInput, CalculationStep } from './calculation-memory'
import { addDecimals, compareDecimals, decimalText, divideDecimals, multiplyDecimals, subtractDecimals } from './decimal'

export const PARANA_SPECIFIC_ST_MVA_RULE = {
  id: 'PR_ST_MVA_FUEL_VEHICLE_571', version: 1, validFrom: '2019-07-04', verifiedThrough: '2026-10-12',
  sourceUrl: 'https://www.fazenda.pr.gov.br/sites/default/arquivos_restritos/files/documento/2020-03/101201900571.pdf',
  legalBasis: 'Resolução SEFA/PR 571/2019, arts. 11 e 29; RICMS/PR, Anexo IX, arts. 1º, §§ 5º/6º/9º, 50 e 136',
} as const
export type SpecificStSector = 'FUEL' | 'VEHICLE'
export type FuelMvaCategory = 'PETROLEUM_NONINCIDENCE' | 'SHALE_OIL' | 'OTHER'
export interface SpecificStMvaInput {
  operationDate?: string; ncm?: string; cest?: string; issuerState?: string; recipientState?: string
  stBaseMode?: string; vehicleOperationType?: string; monophaseFieldsPresent?: boolean; ownIcmsAmount?: string
  supplierRegime?: string; merchandiseOrigin?: string; cst?: string; fuelAnpCode?: string
  /** Incidência, descrição, vigência e destinação para comercialização conferidas. */
  ruleConditionsConfirmed?: boolean
  fuelCategory?: FuelMvaCategory; fuelArt50OperationBaseConfirmed?: boolean; fuelMonophaseConfirmed?: boolean
  vehicleNewForResaleConfirmed?: boolean; vehicleMvaFallbackConfirmed?: boolean
  vehicleImportedConfirmed?: boolean; vehicleImportPriceFloorConfirmed?: boolean
  /** Carga efetiva interna em %, com FECOP quando incidente. */
  effectiveInternalRate?: string; ownOperationRate?: string
}
export interface SpecificStMvaDecision {
  status: 'CALCULATED' | 'PENDING_DATA' | 'PENDING_RULE' | 'UNSUPPORTED'
  sector: SpecificStSector; reason?: string; originalMvaPercent?: string; appliedMvaPercent?: string
  engineMvaMode?: 'APPLIED_MANUAL' | 'ORIGINAL' | 'ADJUSTED_INTERSTATE'
  rule: typeof PARANA_SPECIFIC_ST_MVA_RULE; article: 11 | 29
  inputs: readonly CalculationInput[]; steps: readonly CalculationStep[]
}
/** Reconhece candidatos; não confirma incidência a partir de um código isolado. */
export function specificStSector(ncm?: string, cest?: string, fuelAnpCode?: string): SpecificStSector | undefined {
  if (fuelAnpCode !== undefined || cest?.startsWith('06') || ['2710', '2711'].some(prefix => ncm?.startsWith(prefix))) return 'FUEL'
  if (cest?.startsWith('25') || cest?.startsWith('26') || ['8702', '8703', '8704', '8711'].some(prefix => ncm?.startsWith(prefix))) return 'VEHICLE'
  return undefined
}
// Correspondência da tabela do art. 134 do Anexo IX; descrição e vigência continuam explícitas.
const vehicleNcmByCest: Readonly<Record<string, string>> = {
  '2500100':'87021000', '2500200':'87024090', '2500300':'87032100', '2500400':'87032210', '2500500':'87032290',
  '2500600':'87032310', '2500700':'87032390', '2500800':'87032410', '2500900':'87032490', '2501000':'87033210',
  '2501100':'87033290', '2501200':'87033310', '2501300':'87033390', '2501400':'87042110', '2501500':'87042120',
  '2501600':'87042130', '2501700':'87042190', '2501800':'87043110', '2501900':'87043120', '2502000':'87043130',
  '2502100':'87043190', '2502200':'87022000', '2502300':'87023000', '2502400':'87029000', '2502500':'87034000',
  '2502600':'87035000', '2502700':'87036000', '2502800':'87037000', '2502900':'87038000',
}
const states = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']
/** A seleção da MVA é independente do cálculo/validação dos componentes de imposto. */
export function selectParanaSpecificStMva(input: SpecificStMvaInput): SpecificStMvaDecision | undefined {
  const sector = specificStSector(input.ncm, input.cest, input.fuelAnpCode)
  if (!sector) return undefined
  const article = sector === 'FUEL' ? 11 : 29
  const inputs = Object.entries(input).filter(([, value]) => value !== undefined).map(([name, value]) => ({
    name, value: String(value), source: ['operationDate','ncm','cest','issuerState','recipientState','supplierRegime','merchandiseOrigin','cst','fuelAnpCode','vehicleOperationType','stBaseMode'].includes(name)
      ? 'XML/context' : 'USER/current_item', treatment: 'UNDECIDED' as const,
  }))
  const common = { sector, article, rule: PARANA_SPECIFIC_ST_MVA_RULE, inputs, steps: [] } as const
  const pending = (reason: string, status: SpecificStMvaDecision['status'] = 'PENDING_DATA'): SpecificStMvaDecision => ({ ...common, status, reason })
  const date = input.operationDate
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) return pending('Data ausente ou inválida para a regra específica de MVA.')
  if (date < common.rule.validFrom || date > common.rule.verifiedThrough) return pending('Data fora da cobertura da versão da regra específica. Confira a legislação dessa operação.', 'PENDING_RULE')
  if (input.recipientState !== 'PR' || !states.includes(input.issuerState ?? '')) return pending('Esta regra atende operação interna ou interestadual destinada ao Paraná, sem importação direta.', 'UNSUPPORTED')
  if (input.supplierRegime !== '3') return pending('A regra específica exige fornecedor do regime normal (CRT 3).', input.supplierRegime === undefined ? 'PENDING_DATA' : 'UNSUPPORTED')
  const interstate = input.issuerState !== input.recipientState
  if (!input.ncm || !/^\d{8}$/.test(input.ncm) || !input.cest || !/^\d{7}$/.test(input.cest)) return pending('Informe NCM de oito dígitos e CEST de sete dígitos para a regra específica.')
  if (sector === 'FUEL' && (!input.cest.startsWith('06') || !['2710','2711','2207','3403','3811','3824','3826'].some(prefix => input.ncm!.startsWith(prefix)))) return pending('NCM/CEST não correspondem ao segmento de combustíveis/lubrificantes desta regra.', 'PENDING_RULE')
  const motorcycle = input.ncm.startsWith('8711') && input.cest === '2600100'
  const otherVehicle = vehicleNcmByCest[input.cest] === input.ncm
  if (sector === 'VEHICLE' && !motorcycle && !otherVehicle) return pending('NCM/CEST não correspondem aos veículos abrangidos por esta seleção. Confira a tabela e a descrição do art. 134.', 'PENDING_RULE')
  // A MVA do PDF não se aplica a grupos de ICMS monofásico, mesmo com respostas conflitantes.
  if (sector === 'FUEL' && (input.monophaseFieldsPresent || ['02','15','53','61'].includes(input.cst ?? '') || input.fuelMonophaseConfirmed === true
    || (date >= '2023-06-01' && input.ncm === '27101259')
    || (date >= '2023-05-01' && ['27101921','27111910','38260000'].includes(input.ncm)))) {
    return pending('Combustível no regime monofásico: o cálculo usa quantidade e alíquota ad rem. A MVA do art. 11 não é aplicada.', 'UNSUPPORTED')
  }
  if (input.stBaseMode !== undefined && input.stBaseMode !== '4') return pending('A modalidade de base ST do XML não é MVA; confira o preço prioritário ou a regra específica.', 'UNSUPPORTED')
  if (input.ruleConditionsConfirmed !== true) return pending('Confirme incidência, descrição legal, vigência e destinação para comercialização da regra específica.')
  if (sector === 'FUEL') {
    if (input.fuelMonophaseConfirmed !== false) return pending('Confirme que o combustível não está no regime monofásico nesta data.')
    if (input.fuelArt50OperationBaseConfirmed !== true) return pending('Confirme a hipótese do art. 50: sem PMPF/COTEPE, preço final ou preço de autoridade para o substituto; base pelo valor da operação. Havendo esses preços, confira o tratamento próprio.', 'PENDING_RULE')
    if (!['PETROLEUM_NONINCIDENCE','SHALE_OIL','OTHER'].includes(input.fuelCategory ?? '')) return pending('Informe a categoria do combustível/lubrificante prevista no art. 11.')
    if ((input.fuelCategory === 'PETROLEUM_NONINCIDENCE' || input.fuelCategory === 'SHALE_OIL') && !(input.fuelCategory === 'SHALE_OIL' ? ['2710'] : ['2710','2711']).some(prefix => input.ncm!.startsWith(prefix))) return pending('A categoria de derivado de petróleo com não incidência não corresponde ao NCM informado.', 'PENDING_RULE')
  } else {
    if (input.vehicleOperationType === '3') return pending('O XML indica venda direta ao consumidor. Exige regra própria de veículos.', 'UNSUPPORTED')
    if (input.vehicleNewForResaleConfirmed !== true) return pending('Confirme veículo novo para revenda, sem industrialização, remessa com retorno ou faturamento direto ao consumidor.')
    if (input.vehicleMvaFallbackConfirmed !== true) return pending(motorcycle
      ? 'Os 34% exigem ausência dos preços previstos no § 3º do art. 136 e confirmação de veículo de duas rodas na hipótese do § 4º.'
      : 'Os 30% exigem a hipótese do art. 136, II: operação fora do inciso I e ausência do preço máximo/único legal.', 'PENDING_RULE')
    if (input.vehicleImportedConfirmed === undefined) return pending('Confirme se o veículo acabado é importado; origem de componentes não basta para decidir.')
    if (['1','2','8'].includes(input.merchandiseOrigin ?? '') && !input.vehicleImportedConfirmed) return pending('A resposta de veículo nacional conflita com a origem importada no XML.', 'PENDING_RULE')
    if (input.vehicleImportedConfirmed && input.vehicleImportPriceFloorConfirmed !== true) return pending('Confirme que o valor da operação do veículo importado atende ao piso de II/IPI exigido no art. 136, § 1º.', 'PENDING_RULE')
  }
  try {
    const original = sector === 'VEHICLE' ? motorcycle ? '34' : '30' : input.fuelCategory === 'SHALE_OIL' ? '14.79' : '30'
    let applied = original
    let engineMvaMode: NonNullable<SpecificStMvaDecision['engineMvaMode']> = 'ORIGINAL'
    const steps: CalculationStep[] = [{ name: `MVA original do art. ${article}`, operation: sector === 'VEHICLE'
      ? motorcycle ? 'hipótese de duas rodas sem preços do art. 136, § 3º: MVA original de 34%' : 'hipótese do art. 136, II, sem preço máximo/único: MVA original de 30%'
      : input.fuelCategory === 'SHALE_OIL' ? 'óleo combustível derivado de xisto: MVA original de 14,79%' : 'categoria confirmada do art. 11: MVA original de 30%', inputs: { category: input.fuelCategory ?? (motorcycle ? 'TWO_WHEELS' : 'OTHER_VEHICLES') }, result: original }]
    if (interstate) {
      if (input.effectiveInternalRate === undefined) return pending('Informe a carga interna efetiva, em %, com FECOP quando incidente, para calcular a MVA interestadual.')
      const rate = decimalText(input.effectiveInternalRate)
      if (compareDecimals(rate,'0') < 0 || compareDecimals(rate,'100') >= 0) return pending('A carga efetiva interna deve ser não negativa e inferior a 100%.')
      if (sector === 'FUEL' && input.fuelCategory === 'PETROLEUM_NONINCIDENCE') {
        if ([input.ownOperationRate, input.ownIcmsAmount].some(value => value !== undefined && compareDecimals(value,'0') !== 0)) return pending('A categoria de não incidência interestadual conflita com ICMS próprio diferente de zero no XML ou nas respostas.')
        applied = divideDecimals(subtractDecimals('13000', multiplyDecimals('100', subtractDecimals('100',rate))), subtractDecimals('100',rate), 2)
        engineMvaMode = 'APPLIED_MANUAL'
        steps.push({ name: 'MVA de combustível com não incidência interestadual', operation: '130 ÷ (1 − carga efetiva/100) − 100; MVA arredondada a duas casas antes da base ST', inputs: { effectiveInternalRate: rate }, result: applied, rounding: { scale: 2, mode: 'HALF_UP' } })
      } else {
        if (input.ownOperationRate === undefined) return pending('Informe a alíquota própria interestadual para ajustar a MVA.')
        const ownRate = decimalText(input.ownOperationRate)
        if (!['4','7','12'].includes(ownRate)) return pending('Esta regra atende alíquotas interestaduais de 4%, 7% ou 12%; outra carga própria exige tratamento específico.', 'PENDING_RULE')
        if (ownRate === '4' && !['1','2','3','8'].includes(input.merchandiseOrigin ?? '')) return pending('O ajuste a 4% exige comprovação da origem importada no XML.')
        engineMvaMode = 'ADJUSTED_INTERSTATE'
        if (compareDecimals(rate,ownRate) >= 0) applied = divideDecimals(multiplyDecimals(subtractDecimals(multiplyDecimals(addDecimals('100',original),subtractDecimals('100',ownRate)),multiplyDecimals('100',subtractDecimals('100',rate))),'100'),multiplyDecimals('100',subtractDecimals('100',rate)),20)
        steps.push({ name: 'MVA interestadual específica', operation: compareDecimals(rate,ownRate) < 0
          ? 'carga interna inferior à interestadual: usar MVA original, art. 1º, § 6º'
          : '[(1 + MVA original/100) × (1 − alíquota interestadual/100) ÷ (1 − carga interna efetiva/100) − 1] × 100; exibição com 20 casas',
          inputs: { originalMvaPercent: original, effectiveInternalRate: rate, interstateRate: ownRate }, result: applied, rounding: { scale: 20, mode: 'HALF_UP_DISPLAY_ONLY' } })
      }
    }
    if (compareDecimals(applied,'1000') > 0) return pending('A MVA calculada excede o limite do motor; revise a carga interna.')
    return { ...common, status: 'CALCULATED', originalMvaPercent: original, appliedMvaPercent: applied, engineMvaMode,
      inputs: inputs.map(entry => ({ ...entry, treatment: 'INCLUDED' })), steps }
  } catch { return pending('Percentual decimal inválido ou acima do limite de precisão na MVA específica.') }
}
