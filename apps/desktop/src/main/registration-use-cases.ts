import type {
  CompanySummary, CreateCompanyInput, CreateFiscalProfileInput, CreateOrganizationInput,
  CreateSuggestedFiscalProfileInput, CreateSuggestedFiscalProfileResult, FiscalProfileSuggestion,
  FiscalProfileSummary, OrganizationSummary, RenameOrganizationInput,
  SaveSupplierProductInput, SupplierProductSummary, WorkspaceState,
  RegistrationMutationInput, UpdateCompanyRegistrationInput,
  UpdateFiscalProfileRegistrationInput, UpdateSupplierProductRegistrationInput,
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

  private companyForWorkspace(companyId: unknown): { organization: Organization; company: Company } {
    const organization = this.repositories.organizations.findSingle()
    const company = this.repositories.companies.findById(requiredText(companyId, 'Empresa'))
    if (!organization || !company || company.organizationId !== organization.id) {
      throw new AppError(AppErrorCode.REGISTRATION_NOT_FOUND)
    }
    return { organization, company }
  }

  private activeCompany(companyId: unknown): { organization: Organization; company: Company } {
    const result = this.companyForWorkspace(companyId)
    if (!result.company.active) throw new AppError(AppErrorCode.ACTIVE_COMPANY_NOT_FOUND)
    return result
  }

  private assertRevision(actual: number | undefined, expected: unknown): number {
    const revision = assertRegistrationRevision(expected)
    if (actual !== revision) throw new AppError(AppErrorCode.REGISTRATION_REVISION_CONFLICT)
    return revision
  }

  private assertSaved(saved: boolean): void {
    if (!saved) throw new AppError(AppErrorCode.REGISTRATION_REVISION_CONFLICT)
  }

  updateCompany(input: UpdateCompanyRegistrationInput): CompanySummary {
    return this.repositories.transaction(() => {
      const { company } = this.companyForWorkspace(input.id)
      const expected = this.assertRevision(company.revision, input.expectedRevision)
      const legalName = requiredText(input.legalName, 'Razão social')
      const tradeName = optionalText(input.tradeName)
      const state = normalizeBrazilianState(requiredText(input.state, 'UF'))
      if (company.legalName === legalName && company.tradeName === tradeName && company.state === state) {
        return companySummary(company)
      }
      this.assertSaved(this.repositories.companies.updateRegistration(company.id, expected, {
        legalName, ...(tradeName ? { tradeName } : {}), state, updatedAt: this.now(),
      }))
      const saved = this.repositories.companies.findById(company.id)!
      this.record(RegistrationEntityCode.COMPANY, company.id, RegistrationOperationCode.UPDATE,
        saved.revision!,
        { legalName: company.legalName, tradeName: company.tradeName ?? null, state: company.state },
        { legalName, tradeName: tradeName ?? null, state })
      return companySummary(saved)
    })
  }

  private setCompanyActive(input: RegistrationMutationInput, active: boolean): CompanySummary {
    return this.repositories.transaction(() => {
      const { company } = this.companyForWorkspace(input.id)
      const expected = this.assertRevision(company.revision, input.expectedRevision)
      if (company.active === active) return companySummary(company)
      this.assertSaved(this.repositories.companies.setRegistrationActive(company.id, expected, active, this.now()))
      const saved = this.repositories.companies.findById(company.id)!
      this.record(RegistrationEntityCode.COMPANY, company.id,
        active ? RegistrationOperationCode.REACTIVATE : RegistrationOperationCode.INACTIVATE,
        saved.revision!, { active: company.active }, { active })
      return companySummary(saved)
    })
  }

  inactivateCompany(input: RegistrationMutationInput): CompanySummary { return this.setCompanyActive(input, false) }
  reactivateCompany(input: RegistrationMutationInput): CompanySummary { return this.setCompanyActive(input, true) }

  listFiscalProfiles(companyId: unknown): readonly FiscalProfileSummary[] {
    const { company } = this.companyForWorkspace(companyId)
    return this.repositories.catalog.listProfiles(company.id).map((profile) => ({
      id: profile.id, revision: profile.revision, active: profile.active, companyId: profile.companyId, name: profile.name,
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
        profile: { id: profile.id, revision: profile.revision, active: profile.active, companyId: profile.companyId, name: profile.name,
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
      return { id: profile.id, revision: profile.revision, active: profile.active, companyId: profile.companyId,
        name: profile.name, validFrom: profile.validFrom,
        ...(profile.validUntil ? { validUntil: profile.validUntil } : {}) }
    })
  }

  updateFiscalProfile(input: UpdateFiscalProfileRegistrationInput): FiscalProfileSummary {
    return this.repositories.transaction(() => {
      const profile = this.repositories.catalog.getProfileById(requiredText(input.id, 'Perfil fiscal'))
      if (!profile) throw new AppError(AppErrorCode.REGISTRATION_NOT_FOUND)
      this.companyForWorkspace(profile.companyId)
      const expected = this.assertRevision(profile.revision, input.expectedRevision)
      const name = requiredText(input.name, 'Nome do perfil')
      const validFrom = requiredText(input.validFrom, 'Início da vigência')
      const validUntil = optionalText(input.validUntil)
      if (profile.name === name && profile.validFrom === validFrom && profile.validUntil === validUntil) return profile
      this.assertSaved(this.repositories.catalog.updateProfile(profile.id, expected, {
        name, validFrom, ...(validUntil ? { validUntil } : {}), updatedAt: this.now(),
      }))
      const saved = this.repositories.catalog.getProfileById(profile.id)!
      this.record(RegistrationEntityCode.FISCAL_PROFILE, profile.id, RegistrationOperationCode.UPDATE,
        saved.revision, { name: profile.name, validFrom: profile.validFrom, validUntil: profile.validUntil ?? null },
        { name, validFrom, validUntil: validUntil ?? null })
      return saved
    })
  }

  private setFiscalProfileActive(input: RegistrationMutationInput, active: boolean): FiscalProfileSummary {
    return this.repositories.transaction(() => {
      const profile = this.repositories.catalog.getProfileById(requiredText(input.id, 'Perfil fiscal'))
      if (!profile) throw new AppError(AppErrorCode.REGISTRATION_NOT_FOUND)
      const { company } = this.companyForWorkspace(profile.companyId)
      const expected = this.assertRevision(profile.revision, input.expectedRevision)
      if (profile.active === active) return profile
      if (active && !company.active) throw new AppError(AppErrorCode.ACTIVE_COMPANY_NOT_FOUND)
      this.assertSaved(this.repositories.catalog.setProfileActive(profile.id, expected, active, this.now()))
      const saved = this.repositories.catalog.getProfileById(profile.id)!
      this.record(RegistrationEntityCode.FISCAL_PROFILE, profile.id,
        active ? RegistrationOperationCode.REACTIVATE : RegistrationOperationCode.INACTIVATE,
        saved.revision, { active: profile.active }, { active })
      return saved
    })
  }

  inactivateFiscalProfile(input: RegistrationMutationInput): FiscalProfileSummary {
    return this.setFiscalProfileActive(input, false)
  }
  reactivateFiscalProfile(input: RegistrationMutationInput): FiscalProfileSummary {
    return this.setFiscalProfileActive(input, true)
  }

  listSupplierProducts(companyId: unknown): readonly SupplierProductSummary[] {
    const { company } = this.companyForWorkspace(companyId)
    return this.repositories.catalog.listSupplierProducts(company.id).map((product) => ({
      id: product.id, revision: product.revision, active: product.active, companyId: product.companyId,
      supplierCnpj: product.supplierCnpj, productCode: product.productCode,
      profileId: product.profileId,
    }))
  }

  updateSupplierProduct(input: UpdateSupplierProductRegistrationInput): SupplierProductSummary {
    return this.repositories.transaction(() => {
      const product = this.repositories.catalog.getSupplierProductById(requiredText(input.id, 'Produto'))
      if (!product) throw new AppError(AppErrorCode.REGISTRATION_NOT_FOUND)
      this.activeCompany(product.companyId)
      const expected = this.assertRevision(product.revision, input.expectedRevision)
      if (!product.active) throw new AppError(AppErrorCode.REGISTRATION_INACTIVE)
      const profileId = requiredText(input.profileId, 'Perfil fiscal')
      if (product.profileId === profileId) return product
      this.assertSaved(this.repositories.catalog.updateSupplierProduct(product.id, expected, profileId, this.now()))
      const saved = this.repositories.catalog.getSupplierProductById(product.id)!
      this.record(RegistrationEntityCode.SUPPLIER_PRODUCT, product.id, RegistrationOperationCode.UPDATE,
        saved.revision, { profileId: product.profileId }, { profileId })
      return saved
    })
  }

  private setSupplierProductActive(input: RegistrationMutationInput, active: boolean): SupplierProductSummary {
    return this.repositories.transaction(() => {
      const product = this.repositories.catalog.getSupplierProductById(requiredText(input.id, 'Produto'))
      if (!product) throw new AppError(AppErrorCode.REGISTRATION_NOT_FOUND)
      const { company } = this.companyForWorkspace(product.companyId)
      const expected = this.assertRevision(product.revision, input.expectedRevision)
      if (product.active === active) return product
      if (active && !company.active) throw new AppError(AppErrorCode.ACTIVE_COMPANY_NOT_FOUND)
      this.assertSaved(this.repositories.catalog.setSupplierProductActive(product.id, expected, active, this.now()))
      const saved = this.repositories.catalog.getSupplierProductById(product.id)!
      this.record(RegistrationEntityCode.SUPPLIER_PRODUCT, product.id,
        active ? RegistrationOperationCode.REACTIVATE : RegistrationOperationCode.INACTIVATE,
        saved.revision, { active: product.active }, { active })
      return saved
    })
  }

  inactivateSupplierProduct(input: RegistrationMutationInput): SupplierProductSummary {
    return this.setSupplierProductActive(input, false)
  }
  reactivateSupplierProduct(input: RegistrationMutationInput): SupplierProductSummary {
    return this.setSupplierProductActive(input, true)
  }

  saveSupplierProduct(input: SaveSupplierProductInput): SupplierProductSummary {
    return this.repositories.transaction(() => {
      const { company } = this.activeCompany(input.companyId)
      const supplierCnpj = normalizeCnpj(requiredText(input.supplierCnpj, 'CNPJ do fornecedor'))
      const productCode = requiredText(input.productCode, 'Código do produto')
      const profileId = requiredText(input.profileId, 'Perfil fiscal')
      const before = this.repositories.catalog.listSupplierProducts(company.id).find((product) =>
        product.supplierCnpj === supplierCnpj && product.productCode === productCode)
      if (before && !before.active) throw new AppError(AppErrorCode.REGISTRATION_INACTIVE)
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
      return { id: saved.id, revision: saved.revision, active: saved.active, companyId: saved.companyId,
        supplierCnpj: saved.supplierCnpj, productCode: saved.productCode, profileId: saved.profileId }
    })
  }

}
