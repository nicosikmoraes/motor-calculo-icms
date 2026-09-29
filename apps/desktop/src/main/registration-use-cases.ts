import type {
  CompanySummary, CreateCompanyInput, CreateFiscalProfileInput, CreateOrganizationInput,
  FiscalProfileSummary, OrganizationSummary, RenameOrganizationInput,
  SaveSupplierProductInput, SupplierProductSummary, WorkspaceState,
} from '@motor/contracts'
import {
  AppError, AppErrorCode, normalizeBrazilianState, normalizeCnpj,
  type Company, type Organization,
} from '@motor/domain'

/** Portas de persistência: os casos de uso não conhecem a conexão SQLite. */
export interface RegistrationRepositories {
  organizations: {
    findSingle(): Organization | undefined
    findById(id: string): Organization | undefined
    createSingle(organization: Organization): void
    rename(id: string, name: string, updatedAt: string): void
  }
  companies: {
    findById(id: string): Company | undefined
    listByOrganization(organizationId: string): readonly Company[]
    create(company: Company): void
  }
  catalog: {
    listProfiles(companyId: string): readonly FiscalProfileSummary[]
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
  return { id: organization.id, name: organization.name }
}

function companySummary(company: Company): CompanySummary {
  return {
    id: company.id, legalName: company.legalName,
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
      active: true, createdAt: timestamp, updatedAt: timestamp,
    }
    this.repositories.organizations.createSingle(organization)
    return organizationSummary(organization)
  }

  renameOrganization(input: RenameOrganizationInput): OrganizationSummary {
    const organization = this.repositories.organizations.findSingle()
    if (!organization) throw new AppError(AppErrorCode.ORGANIZATION_NOT_CONFIGURED)
    this.repositories.organizations.rename(
      organization.id, requiredText(input.name, 'Nome do escritório'), this.now(),
    )
    const saved = this.repositories.organizations.findById(organization.id)
    if (!saved) throw new AppError(AppErrorCode.REGISTRATION_NOT_FOUND)
    return organizationSummary(saved)
  }

  createCompany(input: CreateCompanyInput): CompanySummary {
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
      active: true, createdAt: timestamp, updatedAt: timestamp,
    }
    this.repositories.companies.create(company)
    return companySummary(company)
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
      id: profile.id, companyId: profile.companyId, name: profile.name,
      validFrom: profile.validFrom,
      ...(profile.validUntil ? { validUntil: profile.validUntil } : {}),
    }))
  }

  createFiscalProfile(input: CreateFiscalProfileInput): FiscalProfileSummary {
    const { organization, company } = this.activeCompany(input.companyId)
    const validUntil = optionalText(input.validUntil)
    const profile = this.repositories.catalog.createProfile({
      organizationId: organization.id, companyId: company.id,
      name: requiredText(input.name, 'Nome do perfil'),
      validFrom: requiredText(input.validFrom, 'Início da vigência'),
      ...(validUntil ? { validUntil } : {}),
    })
    return {
      id: profile.id, companyId: profile.companyId, name: profile.name,
      validFrom: profile.validFrom,
      ...(profile.validUntil ? { validUntil: profile.validUntil } : {}),
    }
  }

  listSupplierProducts(companyId: unknown): readonly SupplierProductSummary[] {
    const { company } = this.activeCompany(companyId)
    return this.repositories.catalog.listSupplierProducts(company.id).map((product) => ({
      id: product.id, companyId: product.companyId,
      supplierCnpj: product.supplierCnpj, productCode: product.productCode,
      profileId: product.profileId,
    }))
  }

  saveSupplierProduct(input: SaveSupplierProductInput): SupplierProductSummary {
    const { company } = this.activeCompany(input.companyId)
    const saved = this.repositories.catalog.upsertSupplierProduct({
      companyId: company.id,
      supplierCnpj: requiredText(input.supplierCnpj, 'CNPJ do fornecedor'),
      productCode: requiredText(input.productCode, 'Código do produto'),
      profileId: requiredText(input.profileId, 'Perfil fiscal'),
    })
    return {
      id: saved.id, companyId: saved.companyId,
      supplierCnpj: saved.supplierCnpj, productCode: saved.productCode,
      profileId: saved.profileId,
    }
  }
}
