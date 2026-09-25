import type { ItemClassificationReason } from '@motor/contracts'
import type { FiscalProfileRecord, SupplierProductRecord } from '@motor/database'

export interface ItemClassification {
  classification: 'CLASSIFICADO' | 'PENDENTE' | 'FORA_DA_VIGENCIA'
  classificationReason: ItemClassificationReason
  fiscalProfileName?: string
  profileValidFrom?: string
  profileValidUntil?: string
}

export function classifyFiscalItem(
  companyId: string | undefined,
  supplierCnpj: string | undefined,
  productCode: string | undefined,
  issuedAt: string | undefined,
  profiles: readonly FiscalProfileRecord[],
  products: readonly SupplierProductRecord[],
): ItemClassification {
  if (!companyId) return { classification: 'PENDENTE', classificationReason: 'COMPANY_MISSING' }
  if (!supplierCnpj) return { classification: 'PENDENTE', classificationReason: 'ISSUER_CNPJ_MISSING' }
  if (!productCode) return { classification: 'PENDENTE', classificationReason: 'PRODUCT_CODE_MISSING' }

  const product = products.find((entry) =>
    entry.companyId === companyId
    && entry.supplierCnpj === supplierCnpj
    && entry.productCode === productCode,
  )
  if (!product) return { classification: 'PENDENTE', classificationReason: 'PRODUCT_NOT_LINKED' }

  const profile = profiles.find((entry) => entry.id === product.profileId && entry.companyId === companyId)
  if (!profile) return { classification: 'PENDENTE', classificationReason: 'PROFILE_NOT_FOUND' }

  const profileDetails = {
    fiscalProfileName: profile.name,
    profileValidFrom: profile.validFrom,
    ...(profile.validUntil ? { profileValidUntil: profile.validUntil } : {}),
  }
  const issueDate = issuedAt?.slice(0, 10)
  if (!issueDate || !/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) {
    return { classification: 'FORA_DA_VIGENCIA', classificationReason: 'ISSUE_DATE_MISSING', ...profileDetails }
  }
  if (issueDate < profile.validFrom) {
    return { classification: 'FORA_DA_VIGENCIA', classificationReason: 'PROFILE_NOT_YET_VALID', ...profileDetails }
  }
  if (profile.validUntil !== undefined && issueDate > profile.validUntil) {
    return { classification: 'FORA_DA_VIGENCIA', classificationReason: 'PROFILE_EXPIRED', ...profileDetails }
  }
  return { classification: 'CLASSIFICADO', classificationReason: 'PROFILE_ACTIVE', ...profileDetails }
}
