import { describe, expect, it } from 'vitest'
import { calculateParanaPurchaseIcmsSt, type ParanaPurchaseIcmsStInput } from '../src'

const sample: ParanaPurchaseIcmsStInput = {
  operationDate: '2024-08-15', issuerState: 'SP', recipientState: 'PR',
  productAmount: '504.36', appliedMvaPercent: '28.6', ownOperationRate: '4',
  internalRate: '19.5', applicationConfirmed: true,
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
    const memory = calculateParanaPurchaseIcmsSt({ ...sample, ipiAmount: '10', freightAmount: '5' })
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

  it('não calcula desconto nem valor negativo sem regra definida', () => {
    expect(calculateParanaPurchaseIcmsSt({ ...sample, discountAmount: '1' }).status).toBe('PENDING_DATA')
    expect(calculateParanaPurchaseIcmsSt({ ...sample, productAmount: '-1' }).status).toBe('PENDING_DATA')
  })

  it('não aceita entrada destinada fora do Paraná', () => {
    expect(calculateParanaPurchaseIcmsSt({ ...sample, recipientState: 'SC' }).status).toBe('UNSUPPORTED')
  })
})
