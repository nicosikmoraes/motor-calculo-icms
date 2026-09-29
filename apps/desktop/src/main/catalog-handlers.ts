import { randomUUID } from 'node:crypto'
import { app, ipcMain } from 'electron'
import {
  IPC_CHANNELS, type BuiltinRulePackSummary, type CreateCompanyInput,
  type CreateFiscalProfileInput, type CreateOrganizationInput,
  type CreateSuggestedFiscalProfileInput,
  type RenameOrganizationInput, type SaveSupplierProductInput,
  type RegistrationAuditFilter,
} from '@motor/contracts'
import {
  SqliteCompanyRepository, SqliteFiscalCatalogRepository, SqliteOrganizationRepository,
  SqliteRegistrationAuditRepository,
} from '@motor/database'
import { BUILTIN_ICMS_OWN_PACK } from '@motor/tax-engine'
import { activeDatabase, inputRecord } from './main-services'
import { RegistrationUseCases } from './registration-use-cases'

/** Conecta as portas dos casos de uso à conexão local já migrada. */
function registrationUseCases(): RegistrationUseCases {
  const connection = activeDatabase()
  return new RegistrationUseCases({
    transaction: (operation) => connection.transaction(operation),
    organizations: new SqliteOrganizationRepository(connection),
    companies: new SqliteCompanyRepository(connection),
    audit: new SqliteRegistrationAuditRepository(connection),
    catalog: new SqliteFiscalCatalogRepository(connection),
  }, randomUUID, () => new Date().toISOString())
}

/** A ponte IPC valida o envelope e delega regras dos cadastros aos casos de uso. */
export function registerCatalogHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.APP_VERSION, () => app.getVersion())
  ipcMain.handle(IPC_CHANNELS.GET_WORKSPACE, () => registrationUseCases().getWorkspace())
  ipcMain.handle(IPC_CHANNELS.LIST_REGISTRATION_AUDIT, (_event, rawFilter: unknown) =>
    registrationUseCases().listAudit(rawFilter === undefined ? {} :
      inputRecord(rawFilter) as unknown as RegistrationAuditFilter))
  ipcMain.handle(IPC_CHANNELS.CREATE_ORGANIZATION, (_event, rawInput: unknown) =>
    registrationUseCases().createOrganization(inputRecord(rawInput) as unknown as CreateOrganizationInput))
  ipcMain.handle(IPC_CHANNELS.RENAME_ORGANIZATION, (_event, rawInput: unknown) =>
    registrationUseCases().renameOrganization(inputRecord(rawInput) as unknown as RenameOrganizationInput))
  ipcMain.handle(IPC_CHANNELS.CREATE_COMPANY, (_event, rawInput: unknown) =>
    registrationUseCases().createCompany(inputRecord(rawInput) as unknown as CreateCompanyInput))
  ipcMain.handle(IPC_CHANNELS.LIST_FISCAL_PROFILES, (_event, companyId: unknown) =>
    registrationUseCases().listFiscalProfiles(companyId))
  ipcMain.handle(IPC_CHANNELS.LIST_FISCAL_PROFILE_SUGGESTIONS, (_event, companyId: unknown) =>
    registrationUseCases().listFiscalProfileSuggestions(companyId))
  ipcMain.handle(IPC_CHANNELS.CREATE_SUGGESTED_FISCAL_PROFILE, (_event, rawInput: unknown) =>
    registrationUseCases().createSuggestedFiscalProfile(
      inputRecord(rawInput) as unknown as CreateSuggestedFiscalProfileInput))
  ipcMain.handle(IPC_CHANNELS.CREATE_FISCAL_PROFILE, (_event, rawInput: unknown) =>
    registrationUseCases().createFiscalProfile(inputRecord(rawInput) as unknown as CreateFiscalProfileInput))
  ipcMain.handle(IPC_CHANNELS.LIST_SUPPLIER_PRODUCTS, (_event, companyId: unknown) =>
    registrationUseCases().listSupplierProducts(companyId))
  ipcMain.handle(IPC_CHANNELS.SAVE_SUPPLIER_PRODUCT, (_event, rawInput: unknown) =>
    registrationUseCases().saveSupplierProduct(inputRecord(rawInput) as unknown as SaveSupplierProductInput))
  ipcMain.handle(IPC_CHANNELS.GET_BUILTIN_RULE_PACK, (): BuiltinRulePackSummary => ({
    id: BUILTIN_ICMS_OWN_PACK.id,
    version: BUILTIN_ICMS_OWN_PACK.version,
    rules: BUILTIN_ICMS_OWN_PACK.rules.map((rule) => ({ ...rule })),
  }))
}
