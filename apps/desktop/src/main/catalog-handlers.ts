import { randomUUID } from 'node:crypto'
import { app, ipcMain } from 'electron'
import {
  IPC_CHANNELS,
  type BuiltinRulePackSummary, type CompanySummary, type CreateCompanyInput,
  type CreateFiscalProfileInput, type FiscalProfileSummary, type SaveSupplierProductInput,
  type SupplierProductSummary, type CreateOrganizationInput, type OrganizationSummary,
  type RenameOrganizationInput, type WorkspaceState,
} from '@motor/contracts'
import { SqliteCompanyRepository, SqliteFiscalCatalogRepository, SqliteOrganizationRepository } from '@motor/database'
import { AppError, AppErrorCode, normalizeBrazilianState, normalizeCnpj } from '@motor/domain'
import { BUILTIN_ICMS_OWN_PACK } from '@motor/tax-engine'
import { activeDatabase, inputRecord, requiredInputText } from './main-services'

/** Garante que o catálogo só acesse empresas ativas da organização local. */
function catalogCompany(rawCompanyId: unknown) {
  const connection = activeDatabase()
  const organization = new SqliteOrganizationRepository(connection).findSingle()
  const company = new SqliteCompanyRepository(connection).findById(requiredInputText(rawCompanyId, 'Empresa'))
  if (!organization || !company || company.organizationId !== organization.id || !company.active) {
    throw new AppError(AppErrorCode.ACTIVE_COMPANY_NOT_FOUND)
  }
  return { organization, company, connection }
}

function optionalInputText(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') throw new AppError(AppErrorCode.INVALID_TEXT_FIELD)
  return value.trim() || undefined
}

function organizationSummary(organization: { id: string; name: string }): OrganizationSummary {
  return { id: organization.id, name: organization.name }
}

function companySummary(company: {
  id: string
  legalName: string
  tradeName?: string
  cnpj: string
  state: string
  active: boolean
}): CompanySummary {
  return {
    id: company.id,
    legalName: company.legalName,
    ...(company.tradeName ? { tradeName: company.tradeName } : {}),
    cnpj: company.cnpj,
    state: company.state,
    active: company.active,
  }
}

/** Registra operações de escritório, empresas, catálogo e pacote fiscal. */
export function registerCatalogHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.APP_VERSION, () => app.getVersion())
  // Escritório e empresas formam o contexto local usado pelos demais comandos.
  ipcMain.handle(IPC_CHANNELS.GET_WORKSPACE, (): WorkspaceState => {
    const connection = activeDatabase()
    const organization = new SqliteOrganizationRepository(connection).findSingle()
    return {
      ...(organization ? { organization: organizationSummary(organization) } : {}),
      companies: organization
        ? new SqliteCompanyRepository(connection)
            .listByOrganization(organization.id)
            .map(companySummary)
        : [],
    }
  })
  ipcMain.handle(
    IPC_CHANNELS.CREATE_ORGANIZATION,
    (_event, rawInput: unknown): OrganizationSummary => {
      const input = inputRecord(rawInput) as unknown as CreateOrganizationInput
      const timestamp = new Date().toISOString()
      const organization = {
        id: randomUUID(),
        name: requiredInputText(input.name, 'Nome do escritório'),
        active: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      new SqliteOrganizationRepository(activeDatabase()).createSingle(organization)
      return organizationSummary(organization)
    },
  )
  ipcMain.handle(
    IPC_CHANNELS.RENAME_ORGANIZATION,
    (_event, rawInput: unknown): OrganizationSummary => {
      const input = inputRecord(rawInput) as unknown as RenameOrganizationInput
      const repository = new SqliteOrganizationRepository(activeDatabase())
      const organization = repository.findSingle()
      if (!organization) throw new AppError(AppErrorCode.ORGANIZATION_NOT_CONFIGURED)
      repository.rename(
        organization.id,
        requiredInputText(input.name, 'Nome do escritório'),
        new Date().toISOString(),
      )
      return organizationSummary(repository.findById(organization.id)!)
    },
  )
  ipcMain.handle(
    IPC_CHANNELS.CREATE_COMPANY,
    (_event, rawInput: unknown): CompanySummary => {
      const input = inputRecord(rawInput) as unknown as CreateCompanyInput
      const connection = activeDatabase()
      const organization = new SqliteOrganizationRepository(connection).findSingle()
      if (!organization) throw new AppError(AppErrorCode.ORGANIZATION_REQUIRED, { action: 'cadastrar empresas' })
      const timestamp = new Date().toISOString()
      const tradeName = optionalInputText(input.tradeName)
      const company = {
        id: randomUUID(),
        organizationId: organization.id,
        legalName: requiredInputText(input.legalName, 'Razão social'),
        ...(tradeName ? { tradeName } : {}),
        cnpj: normalizeCnpj(requiredInputText(input.cnpj, 'CNPJ')),
        state: normalizeBrazilianState(requiredInputText(input.state, 'UF')),
        active: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      }
      new SqliteCompanyRepository(connection).create(company)
      return companySummary(company)
    },
  )
  // Perfis e vínculos de produtos pertencem sempre a uma empresa ativa.
  ipcMain.handle(
    IPC_CHANNELS.LIST_FISCAL_PROFILES,
    (_event, rawCompanyId: unknown): readonly FiscalProfileSummary[] => {
      const { company, connection } = catalogCompany(rawCompanyId)
      return new SqliteFiscalCatalogRepository(connection).listProfiles(company.id).map((profile) => ({
        id: profile.id, companyId: profile.companyId, name: profile.name,
        validFrom: profile.validFrom,
        ...(profile.validUntil ? { validUntil: profile.validUntil } : {}),
      }))
    },
  )
  ipcMain.handle(
    IPC_CHANNELS.CREATE_FISCAL_PROFILE,
    (_event, rawInput: unknown): FiscalProfileSummary => {
      const input = inputRecord(rawInput) as unknown as CreateFiscalProfileInput
      const { organization, company, connection } = catalogCompany(input.companyId)
      const profile = new SqliteFiscalCatalogRepository(connection).createProfile({
        organizationId: organization.id,
        companyId: company.id,
        name: requiredInputText(input.name, 'Nome do perfil'),
        validFrom: requiredInputText(input.validFrom, 'Início da vigência'),
        ...(optionalInputText(input.validUntil) ? { validUntil: optionalInputText(input.validUntil)! } : {}),
      })
      return {
        id: profile.id, companyId: profile.companyId, name: profile.name,
        validFrom: profile.validFrom,
        ...(profile.validUntil ? { validUntil: profile.validUntil } : {}),
      }
    },
  )
  ipcMain.handle(
    IPC_CHANNELS.LIST_SUPPLIER_PRODUCTS,
    (_event, rawCompanyId: unknown): readonly SupplierProductSummary[] => {
      const { company, connection } = catalogCompany(rawCompanyId)
      return new SqliteFiscalCatalogRepository(connection).listSupplierProducts(company.id)
        .map(({ id, companyId, supplierCnpj, productCode, profileId }) => ({
          id, companyId, supplierCnpj, productCode, profileId,
        }))
    },
  )
  ipcMain.handle(
    IPC_CHANNELS.SAVE_SUPPLIER_PRODUCT,
    (_event, rawInput: unknown): SupplierProductSummary => {
      const input = inputRecord(rawInput) as unknown as SaveSupplierProductInput
      const { company, connection } = catalogCompany(input.companyId)
      const saved = new SqliteFiscalCatalogRepository(connection).upsertSupplierProduct({
        companyId: company.id,
        supplierCnpj: requiredInputText(input.supplierCnpj, 'CNPJ do fornecedor'),
        productCode: requiredInputText(input.productCode, 'Código do produto'),
        profileId: requiredInputText(input.profileId, 'Perfil fiscal'),
      })
      return {
        id: saved.id, companyId: saved.companyId, supplierCnpj: saved.supplierCnpj,
        productCode: saved.productCode, profileId: saved.profileId,
      }
    },
  )
  // Expõe a versão embarcada das propostas fiscais para consulta na interface.
  ipcMain.handle(IPC_CHANNELS.GET_BUILTIN_RULE_PACK, (): BuiltinRulePackSummary => ({
    id: BUILTIN_ICMS_OWN_PACK.id,
    version: BUILTIN_ICMS_OWN_PACK.version,
    rules: BUILTIN_ICMS_OWN_PACK.rules.map((rule) => ({ ...rule })),
  }))
}
