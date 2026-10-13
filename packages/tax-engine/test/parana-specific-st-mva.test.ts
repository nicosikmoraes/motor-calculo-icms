import { describe, expect, it } from 'vitest'
import { calculateParanaPurchaseIcmsSt, calculateParanaFcpSt, paranaFcpStCoverage, selectParanaSpecificStMva, type SpecificStMvaInput } from '../src'
const fuel: SpecificStMvaInput = { operationDate: '2026-10-05', ncm: '27101999', cest: '0600700', issuerState: 'SP', recipientState: 'PR',
  supplierRegime: '3', cst: '10', ruleConditionsConfirmed: true, fuelCategory: 'PETROLEUM_NONINCIDENCE', fuelArt50OperationBaseConfirmed: true,
  fuelMonophaseConfirmed: false, effectiveInternalRate: '18', ownOperationRate: '0', ownIcmsAmount: '0' }
const vehicle: SpecificStMvaInput = { operationDate: '2026-10-05', ncm: '87032390', cest: '2500700', issuerState: 'SP', recipientState: 'PR',
  supplierRegime: '3', cst: '10', merchandiseOrigin: '1', ruleConditionsConfirmed: true, vehicleNewForResaleConfirmed: true,
  vehicleMvaFallbackConfirmed: true, vehicleImportedConfirmed: true, vehicleImportPriceFloorConfirmed: true, effectiveInternalRate: '12', ownOperationRate: '4' }

describe('regras específicas de MVA da Resolução 571', () => {
  it('arredonda a MVA do combustível de não incidência antes de formar a base e o imposto', () => {
    const decision = selectParanaSpecificStMva(fuel)!
    expect(decision).toMatchObject({ status: 'CALCULATED', appliedMvaPercent: '58.54', engineMvaMode: 'APPLIED_MANUAL' })
    const memory = calculateParanaPurchaseIcmsSt({ operationDate: fuel.operationDate!, issuerState: 'SP', recipientState: 'PR',
      supplierRegime: '3', applicationConfirmed: true, productAmount: '1000', internalRate: '18', ownOperationRate: '0', ownIcmsAmount: '0',
      mvaMode: decision.engineMvaMode!, appliedMvaPercent: decision.appliedMvaPercent! })
    expect(memory.result).toMatchObject({ base: '1585.40', amount: '285.37' })
    expect(decision.steps.at(-1)?.rounding).toEqual({ scale: 2, mode: 'HALF_UP' })
  })
  it('seleciona 30% interno e 14,79% de xisto, e ajusta xisto interestadual a 12%', () => {
    expect(selectParanaSpecificStMva({ ...fuel, ncm: '27101931' })?.status).toBe('CALCULATED')
    expect(selectParanaSpecificStMva({ ...fuel, issuerState: 'PR' })).toMatchObject({ appliedMvaPercent: '30' })
    expect(selectParanaSpecificStMva({ ...fuel, issuerState: 'PR', fuelCategory: 'SHALE_OIL' })).toMatchObject({ appliedMvaPercent: '14.79' })
    const adjusted = selectParanaSpecificStMva({ ...fuel, fuelCategory: 'SHALE_OIL', ownOperationRate: '12', ownIcmsAmount: '120' })!
    expect(adjusted).toMatchObject({ status: 'CALCULATED', originalMvaPercent: '14.79', appliedMvaPercent: '23.18926829268292682927' })
  })
  it('seleciona veículos 30% e duas rodas 34% apenas com as condições e classificação corretas', () => {
    expect(selectParanaSpecificStMva(vehicle)).toMatchObject({ status: 'CALCULATED', originalMvaPercent: '30', appliedMvaPercent: '41.81818181818181818182' })
    expect(selectParanaSpecificStMva({ ...vehicle, issuerState: 'PR', ncm: '87112020', cest: '2600100' })).toMatchObject({ status: 'CALCULATED', appliedMvaPercent: '34' })
    for (const changes of [{ vehicleMvaFallbackConfirmed: false }, { vehicleNewForResaleConfirmed: false },
      { vehicleImportPriceFloorConfirmed: false }, { vehicleImportedConfirmed: false }, { cest: '2501000' }, { vehicleOperationType: '3' }]) {
      expect(selectParanaSpecificStMva({ ...vehicle, ...changes })?.status).not.toBe('CALCULATED')
    }
  })
  it('mantém MVA original quando a carga interna é menor que a interestadual, sem arredondar a razão quando há ajuste', () => {
    const decision = selectParanaSpecificStMva({ ...vehicle, merchandiseOrigin: '0', vehicleImportedConfirmed: false, effectiveInternalRate: '10', ownOperationRate: '12' })!
    expect(decision.appliedMvaPercent).toBe('30')
    const result = calculateParanaPurchaseIcmsSt({ operationDate: vehicle.operationDate!, issuerState: 'SP', recipientState: 'PR',
      supplierRegime: '3', applicationConfirmed: true, productAmount: '1000', internalRate: '10', ownOperationRate: '12', ownIcmsAmount: '120',
      mvaMode: decision.engineMvaMode!, originalMvaPercent: '30', mvaAdjustmentInternalRate: '10' })
    expect(result.result).toMatchObject({ base: '1300.00', amount: '10.00' })
    expect(result.rule?.legalBasis).toContain('§§ 5º e 6º')
    expect(result.rule?.legalBasis).not.toContain('importados sujeitos a 4%')
  })
  it('não aplica o PDF a monofasia, pauta/preço prioritário, classificação incorreta ou dados não confirmados', () => {
    for (const changes of [{ cst: '61' }, { monophaseFieldsPresent: true }, { fuelMonophaseConfirmed: true }, { fuelArt50OperationBaseConfirmed: false },
      { ruleConditionsConfirmed: false }, { cest: '2000700' }, { effectiveInternalRate: '100' }, { supplierRegime: '1' }, { ownOperationRate: '12' },
      { ncm: '27101259' }, { operationDate: '2027-01-01' }]) expect(selectParanaSpecificStMva({ ...fuel, ...changes })?.status).not.toBe('CALCULATED')
    const { fuelMonophaseConfirmed: _confirmed, ...unknownRegime } = fuel
    expect(selectParanaSpecificStMva(unknownRegime)?.status).toBe('PENDING_DATA')
  })
  it('separa FECOP de veículos a partir de 04/08/2021 e exige condições específicas', () => {
    expect(paranaFcpStCoverage('2021-08-03','87032390',{ vehicleStConditionsConfirmed: true }).status).toBe('UNLISTED')
    expect(paranaFcpStCoverage('2021-08-04','87032390',{ vehicleStConditionsConfirmed: true }).status).toBe('COVERED')
    expect(paranaFcpStCoverage('2026-10-05','87032390').status).toBe('SPECIAL_RULE')
    expect(calculateParanaFcpSt({ operationDate: '2026-10-05', ncm: '87032390', recipientState: 'PR', vehicleStConditionsConfirmed: true,
      applicationConfirmed: true, baseConfirmed: true, baseAmount: '1418.18' }).result).toMatchObject({ component: 'FCP_ST', amount: '28.36' })
  })
})
