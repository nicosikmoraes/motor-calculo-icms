import { describe, expect, it } from 'vitest'
import { calculateParanaPurchaseIcmsSt, type ParanaPurchaseIcmsStInput } from '../src'

const sample: ParanaPurchaseIcmsStInput = {
  operationDate: '2024-08-15', issuerState: 'SP', recipientState: 'PR',
  productAmount: '504.36', appliedMvaPercent: '28.6', ownOperationRate: '4',
  internalRate: '19.5', applicationConfirmed: true,
  supplierRegime: '3',
}

describe('ICMS-ST de compras no Paraná pela planilha informada', () => {
  it('reproduz o valor calculado no Excel e arredonda o resultado final a centavos', () => {
    const memory = calculateParanaPurchaseIcmsSt(sample)
    expect(memory.status).toBe('CALCULATED')
    expect(memory.result).toEqual({ component: 'ICMS_ST', base: '648.61', rate: '19.5', amount: '106.30' })
    expect(memory.steps.map(step => step.result)).toEqual(['504.36', '648.60696', '126.4783572', '20.1744', '106.30'])
    expect(memory.rule?.id).toBe('PARANA_PURCHASE_ICMS_ST_MVA')
  })

  it('inclui IPI e encargos informados antes de aplicar a MVA', () => {
    const memory = calculateParanaPurchaseIcmsSt({ ...sample, ipiAmount: '10', freightAmount: '5', ownIcmsAmount: '20.17' })
    expect(memory.steps[0]?.result).toBe('519.36')
    expect(memory.result?.base).toBe('667.90')
  })

  it('mantém pendente sem confirmação de incidência, MVA, alíquota interna ou alíquota própria', () => {
    const { applicationConfirmed: _applicationConfirmed, ...withoutConfirmation } = sample
    const { appliedMvaPercent: _appliedMvaPercent, ...withoutMva } = sample
    const { internalRate: _internalRate, ...withoutInternalRate } = sample
    const { ownOperationRate: _ownOperationRate, ...withoutOwnRate } = sample
    expect(calculateParanaPurchaseIcmsSt(withoutConfirmation).status).toBe('PENDING_DATA')
    expect(calculateParanaPurchaseIcmsSt(withoutMva).status).toBe('PENDING_DATA')
    expect(calculateParanaPurchaseIcmsSt(withoutInternalRate).status).toBe('PENDING_DATA')
    expect(calculateParanaPurchaseIcmsSt(withoutOwnRate).status).toBe('PENDING_DATA')
  })

  it('distingue a dedução da planilha da dedução do ICMS informado e não presume a base própria com encargos', () => {
    expect(calculateParanaPurchaseIcmsSt(sample).result?.amount).toBe('106.30')
    expect(calculateParanaPurchaseIcmsSt({ ...sample, ownIcmsAmount: '20.17' }).result?.amount).toBe('106.31')
    expect(calculateParanaPurchaseIcmsSt({ ...sample, freightAmount: '5' }).status).toBe('PENDING_DATA')
  })

  it('não calcula desconto nem valor negativo sem regra definida', () => {
    expect(calculateParanaPurchaseIcmsSt({ ...sample, discountAmount: '1' }).status).toBe('PENDING_DATA')
    expect(calculateParanaPurchaseIcmsSt({ ...sample, productAmount: '-1' }).status).toBe('PENDING_DATA')
  })

  it('não aceita entrada destinada fora do Paraná', () => {
    expect(calculateParanaPurchaseIcmsSt({ ...sample, recipientState: 'SC' }).status).toBe('UNSUPPORTED')
  })

  it('ajusta a MVA original de importados a 4% sem arredondar a MVA antes do imposto', () => {
    const memory = calculateParanaPurchaseIcmsSt({ ...sample, mvaMode: 'ADJUSTED_IMPORT_4',
      originalMvaPercent: '28.6', merchandiseOrigin: '1', supplierRegime: '3' })
    expect(memory.status).toBe('CALCULATED')
    expect(memory.steps[0]?.result).toBe('53.3614906832298136646')
    expect(memory.result).toMatchObject({ base: '773.49', amount: '130.66' })
    expect(memory.steps.at(-1)?.inputs.stNumerator).toBeDefined()
  })

  it('mantém pendência para ajuste sem comprovação de origem, regime ou operação interestadual a 4%', () => {
    const adjusted = { ...sample, mvaMode: 'ADJUSTED_IMPORT_4' as const, originalMvaPercent: '28.6',
      merchandiseOrigin: '1', supplierRegime: '3' }
    for (const changes of [{ merchandiseOrigin: '0' }, { merchandiseOrigin: '6' }, { supplierRegime: '1' },
      { issuerState: 'PR' }, { ownOperationRate: '12' }, { internalRate: '100' }]) {
      expect(calculateParanaPurchaseIcmsSt({ ...adjusted, ...changes }).status).not.toBe('CALCULATED')
    }
    expect(calculateParanaPurchaseIcmsSt({ ...sample, mvaMode: 'ORIGINAL', originalMvaPercent: '28.6' }).status).toBe('PENDING_DATA')
  })

  it('aceita MVA original para operação nacional a 12% e preserva o modo manual da planilha', () => {
    expect(calculateParanaPurchaseIcmsSt({ ...sample, mvaMode: 'ORIGINAL', originalMvaPercent: '28.6',
      ownOperationRate: '12' }).result?.amount).toBe('65.96')
    expect(calculateParanaPurchaseIcmsSt(sample).result?.amount).toBe('106.30')
  })
})
