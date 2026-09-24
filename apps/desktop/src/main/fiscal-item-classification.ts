import type { FiscalProfileRecord, SupplierProductRecord } from '@motor/database'

export interface ItemClassification {
  classification: 'CLASSIFICADO' | 'PENDENTE' | 'FORA_DA_VIGENCIA'
  fiscalProfileName?: string
}

export function classifyFiscalItem(
  companyId: string | undefined,
  supplierCnpj: string | undefined,
  productCode: string | undefined,
  issuedAt: string | undefined,
  profiles: readonly FiscalProfileRecord[],
  products: readonly SupplierProductRecord[],
): ItemClassification {
  if (!companyId || !supplierCnpj || !productCode) return { classification: 'PENDENTE' }
  const product = products.find((entry) =>
    entry.companyId === companyId
    && entry.supplierCnpj === supplierCnpj
    && entry.productCode === productCode,
  )
  if (!product) return { classification: 'PENDENTE' }
  const profile = profiles.find((entry) => entry.id === product.profileId && entry.companyId === companyId)
  if (!profile) return { classification: 'PENDENTE' }
  const issueDate = issuedAt?.slice(0, 10)
  if (!issueDate || !/^\d{4}-\d{2}-\d{2}$/.test(issueDate)
    || issueDate < profile.validFrom
    || (profile.validUntil !== undefined && issueDate > profile.validUntil)) {
    return { classification: 'FORA_DA_VIGENCIA', fiscalProfileName: profile.name }
  }
  return { classification: 'CLASSIFICADO', fiscalProfileName: profile.name }
}
