import type { FiscalProfileSummary, RegistrationAuditEvent, SupplierProductSummary } from '@motor/contracts'
import type { Company, FiscalProfileEvidence, Organization, RegistrationEntityCode, RegistrationOperationCode } from '@motor/domain'

/** Portas de persistência: os casos de uso não conhecem a conexão SQLite. */
export interface RegistrationRepositories {
  transaction<T>(operation: () => T): T
  audit: {
    append(event: Omit<RegistrationAuditEvent, 'id'>): RegistrationAuditEvent
    list(filter?: { entity?: RegistrationEntityCode; entityId?: string; operation?: RegistrationOperationCode; from?: string; until?: string; limit?: number }): readonly RegistrationAuditEvent[]
  }
  organizations: {
    findSingle(): Organization | undefined
    findById(id: string): Organization | undefined
    createSingle(organization: Organization): void
    rename(id: string, name: string, updatedAt: string, expectedRevision?: number): void
  }
  companies: {
    findById(id: string): Company | undefined
    listByOrganization(organizationId: string): readonly Company[]
    create(company: Company): void
    updateRegistration(id: string, expectedRevision: number, values: {
      legalName: string; tradeName?: string; state: Company['state']; updatedAt: string
    }): boolean
    setRegistrationActive(id: string, expectedRevision: number, active: boolean, updatedAt: string): boolean
  }
  catalog: {
    listProfiles(companyId: string): readonly FiscalProfileSummary[]
    getProfileById(id: string): FiscalProfileSummary | undefined
    updateProfile(id: string, expectedRevision: number, values: {
      name: string; validFrom: string; validUntil?: string; updatedAt: string
    }): boolean
    setProfileActive(id: string, expectedRevision: number, active: boolean, updatedAt: string): boolean
    listProfileSuggestionEvidence(companyId: string): readonly FiscalProfileEvidence[]
    createProfile(input: {
      organizationId: string; companyId: string; name: string;
      validFrom: string; validUntil?: string
    }): FiscalProfileSummary
    listSupplierProducts(companyId: string): readonly SupplierProductSummary[]
    getSupplierProductById(id: string): SupplierProductSummary | undefined
    updateSupplierProduct(id: string, expectedRevision: number, profileId: string, updatedAt: string): boolean
    setSupplierProductActive(id: string, expectedRevision: number, active: boolean, updatedAt: string): boolean
    upsertSupplierProduct(input: {
      companyId: string; supplierCnpj: string; productCode: string; profileId: string
    }): SupplierProductSummary
  }
}
