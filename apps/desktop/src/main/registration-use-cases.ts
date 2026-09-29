import type {
  CompanySummary, CreateCompanyInput, CreateFiscalProfileInput, CreateOrganizationInput,
  CreateSuggestedFiscalProfileInput, CreateSuggestedFiscalProfileResult, FiscalProfileSuggestion,
  FiscalProfileSummary, OrganizationSummary, RenameOrganizationInput,
  SaveSupplierProductInput, SupplierProductSummary, WorkspaceState,
} from '@motor/contracts'
import {
  AppError, AppErrorCode, RegistrationEntityCode, RegistrationOperationCode,
  assertRegistrationRevision, normalizeBrazilianState, normalizeCnpj,
  type Company, type Organization, type FiscalProfileEvidence,
} from '@motor/domain'
import { buildFiscalProfileSuggestions } from './profile-suggestions'
import { hostname, userInfo } from 'node:os'
import type { RegistrationAuditEvent, RegistrationChange } from '@motor/database'

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
  }
  catalog: {
    listProfiles(companyId: string): readonly FiscalProfileSummary[]
    listProfileSuggestionEvidence(companyId: string): readonly FiscalProfileEvidence[]
    createProfile(input: {
      organizationId: string; companyId: string; name: string;
      validFrom: string; validUntil?: string
    }): FiscalProfileSummary
    listSupplierProducts(companyId: string): readonly SupplierProductSummary[]
    upsertSupplierProduct(input: {
      companyId: string; supplierCnpj: string; productCode: string; profileId: string
    }): SupplierProductSummary
  }
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new AppError(AppErrorCode.REQUIRED_FIELD, { field })
  return value.trim()
}

function optionalText(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') throw new AppError(AppErrorCode.INVALID_TEXT_FIELD)
  return value.trim() || undefined
}

function organizationSummary(organization: Organization): OrganizationSummary {
  return { id: organization.id, name: organization.name, revision: organization.revision ?? 1 }
}

function companySummary(company: Company): CompanySummary {
  return {
    id: company.id, revision: company.revision ?? 1, legalName: company.legalName,
    ...(company.tradeName ? { tradeName: company.tradeName } : {}),
    cnpj: company.cnpj, state: company.state, active: company.active,
  }
}

/** Coordena validação e repositórios sem expor persistência aos contratos IPC. */
export class RegistrationUseCases {
  constructor(
    private readonly repositories: RegistrationRepositories,
    private readonly generateId: () => string,
    private readonly now: () => string,
  ) {}

  /** Registra apenas os campos alterados, sem XML nem outros dados de ingestão. */
  private record(entity: RegistrationEntityCode, entityId: string, operation: RegistrationOperationCode,
    revision: number, before: Record<string, string | number | boolean | null>,
    after: Record<string, string | number | boolean | null>): void {
    const changes: Record<string, RegistrationChange> = {}
    for (const key of Object.keys(after)) {
      if (before[key] !== after[key]) changes[key] = { before: before[key] ?? null, after: after[key] ?? null }
    }
    this.repositories.audit.append({
      entity, entityId, operation, revision, changes,
      computer: hostname(), systemUser: userInfo().username, createdAt: this.now(),
    })
  }

  listAudit(filter: Parameters<RegistrationRepositories['audit']['list']>[0] = {}): readonly RegistrationAuditEvent[] {
    return this.repositories.audit.list(filter)
  }

  getWorkspace(): WorkspaceState {
    const organization = this.repositories.organizations.findSingle()
    return {
      ...(organization ? { organization: organizationSummary(organization) } : {}),
      companies: organization
        ? this.repositories.companies.listByOrganization(organization.id).map(companySummary)
        : [],
    }
  }

  createOrganization(input: CreateOrganizationInput): OrganizationSummary {
    const timestamp = this.now()
    const organization: Organization = {
      id: this.generateId(), name: requiredText(input.name, 'Nome do escritório'),
      active: true, createdAt: timestamp, updatedAt: timestamp, revision: 1,
    }
    return this.repositories.transaction(() => {
      this.repositories.organizations.createSingle(organization)
      this.record(RegistrationEntityCode.ORGANIZATION, organization.id, RegistrationOperationCode.CREATE,
        1, {}, { name: organization.name, active: true })
      return organizationSummary(organization)
    })
  }

  renameOrganization(input: RenameOrganizationInput): OrganizationSummary {
    return this.repositories.transaction(() => {
      const organization = this.repositories.organizations.findSingle()
      if (!organization) throw new AppError(AppErrorCode.ORGANIZATION_NOT_CONFIGURED)
      const expected = assertRegistrationRevision(input.expectedRevision)
      const name = requiredText(input.name, 'Nome do escritório')
      if (organization.revision !== expected) throw new AppError(AppErrorCode.REGISTRATION_REVISION_CONFLICT)
      if (organization.name === name) return organizationSummary(organization)
      this.repositories.organizations.rename(organization.id, name, this.now(), expected)
      const saved = this.repositories.organizations.findById(organization.id)
      if (!saved) throw new AppError(AppErrorCode.REGISTRATION_NOT_FOUND)
      this.record(RegistrationEntityCode.ORGANIZATION, organization.id, RegistrationOperationCode.UPDATE,
        saved.revision ?? expected + 1, { name: organization.name }, { name })
      return organizationSummary(saved)
    })
  }

  createCompany(input: CreateCompanyInput): CompanySummary {
    return this.repositories.transaction(() => {
      const organization = this.repositories.organizations.findSingle()
      if (!organization) throw new AppError(AppErrorCode.ORGANIZATION_REQUIRED, { action: 'cadastrar empresas' })
      const timestamp = this.now()
      const tradeName = optionalText(input.tradeName)
      const company: Company = {
        id: this.generateId(), organizationId: organization.id,
        legalName: requiredText(input.legalName, 'Razão social'),
        ...(tradeName ? { tradeName } : {}),
        cnpj: normalizeCnpj(requiredText(input.cnpj, 'CNPJ')),
        state: normalizeBrazilianState(requiredText(input.state, 'UF')),
        active: true, createdAt: timestamp, updatedAt: timestamp, revision: 1,
      }
      this.repositories.companies.create(company)
      this.record(RegistrationEntityCode.COMPANY, company.id, RegistrationOperationCode.CREATE, 1, {},
        { legalName: company.legalName, tradeName: company.tradeName ?? null,
          cnpj: company.cnpj, state: company.state, active: true })
      return companySummary(company)
    })
  }

  private activeCompany(companyId: unknown): { organization: Organization; company: Company } {
    const organization = this.repositories.organizations.findSingle()
    const company = this.repositories.companies.findById(requiredText(companyId, 'Empresa'))
    if (!organization || !company || company.organizationId !== organization.id || !company.active) {
      throw new AppError(AppErrorCode.ACTIVE_COMPANY_NOT_FOUND)
    }
    return { organization, company }
  }

  listFiscalProfiles(companyId: unknown): readonly FiscalProfileSummary[] {
    const { company } = this.activeCompany(companyId)
    return this.repositories.catalog.listProfiles(company.id).map((profile) => ({
      id: profile.id, revision: profile.revision, companyId: profile.companyId, name: profile.name,
      validFrom: profile.validFrom,
      ...(profile.validUntil ? { validUntil: profile.validUntil } : {}),
    }))
  }

  listFiscalProfileSuggestions(companyId: unknown): readonly FiscalProfileSuggestion[] {
    const { company } = this.activeCompany(companyId)
    return buildFiscalProfileSuggestions(this.repositories.catalog.listProfileSuggestionEvidence(company.id))
  }

  createSuggestedFiscalProfile(input: CreateSuggestedFiscalProfileInput): CreateSuggestedFiscalProfileResult {
    const { organization, company } = this.activeCompany(input.companyId)
    return this.repositories.transaction(() => {
      // Recalcula dentro da transação: proposta antiga ou já vinculada não é aplicada.
      const suggestion = buildFiscalProfileSuggestions(
        this.repositories.catalog.listProfileSuggestionEvidence(company.id),
      ).find((candidate) => candidate.key === input.suggestionKey)
      if (!suggestion) throw new AppError(AppErrorCode.PROFILE_SUGGESTION_STALE)
      const profile = this.repositories.catalog.createProfile({
        organizationId: organization.id, companyId: company.id,
        name: suggestion.name, validFrom: suggestion.validFrom,
      })
      this.record(RegistrationEntityCode.FISCAL_PROFILE, profile.id, RegistrationOperationCode.CREATE,
        profile.revision, {}, { name: profile.name, validFrom: profile.validFrom, validUntil: profile.validUntil ?? null })
      for (const product of suggestion.products) {
        const savedProduct = this.repositories.catalog.upsertSupplierProduct({
          companyId: company.id, supplierCnpj: product.supplierCnpj,
          productCode: product.productCode, profileId: profile.id,
        })
        this.record(RegistrationEntityCode.SUPPLIER_PRODUCT, savedProduct.id, RegistrationOperationCode.CREATE,
          savedProduct.revision, {}, { supplierCnpj: savedProduct.supplierCnpj,
            productCode: savedProduct.productCode, profileId: savedProduct.profileId })
      }
      return {
        profile: { id: profile.id, revision: profile.revision, companyId: profile.companyId, name: profile.name,
          validFrom: profile.validFrom },
        linkedProducts: suggestion.products.length,
      }
    })
  }

  createFiscalProfile(input: CreateFiscalProfileInput): FiscalProfileSummary {
    return this.repositories.transaction(() => {
      const { organization, company } = this.activeCompany(input.companyId)
      const validUntil = optionalText(input.validUntil)
      const profile = this.repositories.catalog.createProfile({
        organizationId: organization.id, companyId: company.id,
        name: requiredText(input.name, 'Nome do perfil'),
        validFrom: requiredText(input.validFrom, 'Início da vigência'),
        ...(validUntil ? { validUntil } : {}),
      })
      this.record(RegistrationEntityCode.FISCAL_PROFILE, profile.id, RegistrationOperationCode.CREATE,
        profile.revision, {}, { name: profile.name, validFrom: profile.validFrom,
          validUntil: profile.validUntil ?? null })
      return { id: profile.id, revision: profile.revision, companyId: profile.companyId,
        name: profile.name, validFrom: profile.validFrom,
        ...(profile.validUntil ? { validUntil: profile.validUntil } : {}) }
    })
  }

  listSupplierProducts(companyId: unknown): readonly SupplierProductSummary[] {
    const { company } = this.activeCompany(companyId)
    return this.repositories.catalog.listSupplierProducts(company.id).map((product) => ({
      id: product.id, revision: product.revision, companyId: product.companyId,
      supplierCnpj: product.supplierCnpj, productCode: product.productCode,
      profileId: product.profileId,
    }))
  }

  saveSupplierProduct(input: SaveSupplierProductInput): SupplierProductSummary {
    return this.repositories.transaction(() => {
      const { company } = this.activeCompany(input.companyId)
      const supplierCnpj = normalizeCnpj(requiredText(input.supplierCnpj, 'CNPJ do fornecedor'))
      const productCode = requiredText(input.productCode, 'Código do produto')
      const profileId = requiredText(input.profileId, 'Perfil fiscal')
      const before = this.repositories.catalog.listSupplierProducts(company.id).find((product) =>
        product.supplierCnpj === supplierCnpj && product.productCode === productCode)
      if (before && before.revision !== assertRegistrationRevision(input.expectedRevision)) {
        throw new AppError(AppErrorCode.REGISTRATION_REVISION_CONFLICT)
      }
      const saved = this.repositories.catalog.upsertSupplierProduct({
        companyId: company.id, supplierCnpj, productCode, profileId,
      })
      if (!before || before.profileId !== saved.profileId) {
        this.record(RegistrationEntityCode.SUPPLIER_PRODUCT, saved.id,
          before ? RegistrationOperationCode.UPDATE : RegistrationOperationCode.CREATE,
          saved.revision,
          before ? { profileId: before.profileId } : {},
          before ? { profileId: saved.profileId } : {
            supplierCnpj: saved.supplierCnpj, productCode: saved.productCode, profileId: saved.profileId,
          })
      }
      return { id: saved.id, revision: saved.revision, companyId: saved.companyId,
        supplierCnpj: saved.supplierCnpj, productCode: saved.productCode, profileId: saved.profileId }
    })
  }

}
