import { describe, expect, it } from 'vitest'
import type { FiscalProfileRecord, SupplierProductRecord } from '@motor/database'
import { classifyFiscalItem } from '../src/main/fiscal-item-classification'

const profile: FiscalProfileRecord = {
  id: 'profile-1', organizationId: 'org-1', companyId: 'company-1',
  name: 'Revenda', validFrom: '2026-01-01', validUntil: '2026-12-31',
  createdAt: '2026-01-01T00:00:00.000Z',
}
const product: SupplierProductRecord = {
  id: 'product-1', companyId: 'company-1', supplierCnpj: '11222333000181',
  productCode: 'ABC-1', profileId: profile.id,
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('classificação cadastral de item', () => {
  it('classifica somente fornecedor, empresa, código e data correspondentes', () => {
    expect(classifyFiscalItem(
      'company-1', '11222333000181', 'ABC-1', '2026-09-01T10:00:00-03:00',
      [profile], [product],
    )).toEqual({ classification: 'CLASSIFICADO', fiscalProfileName: 'Revenda' })
    expect(classifyFiscalItem(
      'company-2', '11222333000181', 'ABC-1', '2026-09-01',
      [profile], [product],
    ).classification).toBe('PENDENTE')
    expect(classifyFiscalItem(
      'company-1', '11222333000181', 'OUTRO', '2026-09-01',
      [profile], [product],
    ).classification).toBe('PENDENTE')
  })

  it('avisa quando a data da nota está fora da vigência ou ausente', () => {
    expect(classifyFiscalItem(
      'company-1', '11222333000181', 'ABC-1', '2027-01-01',
      [profile], [product],
    )).toEqual({ classification: 'FORA_DA_VIGENCIA', fiscalProfileName: 'Revenda' })
    expect(classifyFiscalItem(
      'company-1', '11222333000181', 'ABC-1', undefined,
      [profile], [product],
    ).classification).toBe('FORA_DA_VIGENCIA')
  })
})
