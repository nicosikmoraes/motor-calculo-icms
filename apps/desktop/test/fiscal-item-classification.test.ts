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
    )).toEqual({
      classification: 'CLASSIFICADO', classificationReason: 'PROFILE_ACTIVE',
      fiscalProfileName: 'Revenda', profileValidFrom: '2026-01-01', profileValidUntil: '2026-12-31',
    })
    expect(classifyFiscalItem(
      'company-2', '11222333000181', 'ABC-1', '2026-09-01',
      [profile], [product],
    ).classificationReason).toBe('PRODUCT_NOT_LINKED')
    expect(classifyFiscalItem(
      'company-1', '11222333000181', 'OUTRO', '2026-09-01',
      [profile], [product],
    ).classificationReason).toBe('PRODUCT_NOT_LINKED')
  })

  it('distingue dados ausentes e perfil ainda não vigente', () => {
    expect(classifyFiscalItem(
      undefined, product.supplierCnpj, product.productCode, '2026-09-01',
      [profile], [product],
    ).classificationReason).toBe('COMPANY_MISSING')
    expect(classifyFiscalItem(
      product.companyId, undefined, product.productCode, '2026-09-01',
      [profile], [product],
    ).classificationReason).toBe('ISSUER_CNPJ_MISSING')
    expect(classifyFiscalItem(
      product.companyId, product.supplierCnpj, undefined, '2026-09-01',
      [profile], [product],
    ).classificationReason).toBe('PRODUCT_CODE_MISSING')
    expect(classifyFiscalItem(
      product.companyId, product.supplierCnpj, product.productCode, '2025-12-31',
      [profile], [product],
    ).classificationReason).toBe('PROFILE_NOT_YET_VALID')
    expect(classifyFiscalItem(
      product.companyId, product.supplierCnpj, product.productCode, '2026-09-01',
      [], [product],
    ).classificationReason).toBe('PROFILE_NOT_FOUND')
  })

  it('avisa quando a data da nota está fora da vigência ou ausente', () => {
    expect(classifyFiscalItem(
      'company-1', '11222333000181', 'ABC-1', '2027-01-01',
      [profile], [product],
    )).toEqual({
      classification: 'FORA_DA_VIGENCIA', classificationReason: 'PROFILE_EXPIRED',
      fiscalProfileName: 'Revenda', profileValidFrom: '2026-01-01', profileValidUntil: '2026-12-31',
    })
    expect(classifyFiscalItem(
      'company-1', '11222333000181', 'ABC-1', undefined,
      [profile], [product],
    ).classificationReason).toBe('ISSUE_DATE_MISSING')
  })
})
