import { randomUUID } from 'node:crypto'
import { app, ipcMain } from 'electron'
import {
  IPC_CHANNELS, type BuiltinRulePackSummary, type CreateCompanyInput,
  type CreateFiscalProfileInput, type CreateOrganizationInput,
  type CreateSuggestedFiscalProfileInput,
  type RenameOrganizationInput, type SaveSupplierProductInput,
  type RegistrationAuditFilter, type RegistrationMutationInput,
  type UpdateCompanyRegistrationInput, type UpdateFiscalProfileRegistrationInput,
  type UpdateSupplierProductRegistrationInput,
  type CreateRuleDraftInput, type UpdateRuleDraftInput, type RuleVersionMutationInput, type RevokeRuleInput,
} from '@motor/contracts'
import {
  SqliteCompanyRepository, SqliteFiscalCatalogRepository, SqliteOrganizationRepository,
  SqliteRegistrationAuditRepository, SqliteVersionedRuleRepository,
} from '@motor/database'
import { BUILTIN_ICMS_OWN_PACK } from '@motor/tax-engine'
import { activeDatabase, inputRecord } from './main-services'
import { RegistrationUseCases } from './registration-use-cases'
import { VersionedRuleUseCases } from './versioned-rule-use-cases'

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

function versionedRuleUseCases(): VersionedRuleUseCases {
  const connection = activeDatabase()
  return new VersionedRuleUseCases({
    transaction: (operation) => connection.transaction(operation),
    organizations: new SqliteOrganizationRepository(connection),
    rules: new SqliteVersionedRuleRepository(connection),
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
  ipcMain.handle(IPC_CHANNELS.UPDATE_COMPANY, (_event, rawInput: unknown) =>
    registrationUseCases().updateCompany(inputRecord(rawInput) as unknown as UpdateCompanyRegistrationInput))
  ipcMain.handle(IPC_CHANNELS.INACTIVATE_COMPANY, (_event, rawInput: unknown) =>
    registrationUseCases().inactivateCompany(inputRecord(rawInput) as unknown as RegistrationMutationInput))
  ipcMain.handle(IPC_CHANNELS.REACTIVATE_COMPANY, (_event, rawInput: unknown) =>
    registrationUseCases().reactivateCompany(inputRecord(rawInput) as unknown as RegistrationMutationInput))
  ipcMain.handle(IPC_CHANNELS.LIST_FISCAL_PROFILES, (_event, companyId: unknown) =>
    registrationUseCases().listFiscalProfiles(companyId))
  ipcMain.handle(IPC_CHANNELS.LIST_FISCAL_PROFILE_SUGGESTIONS, (_event, companyId: unknown) =>
    registrationUseCases().listFiscalProfileSuggestions(companyId))
  ipcMain.handle(IPC_CHANNELS.CREATE_SUGGESTED_FISCAL_PROFILE, (_event, rawInput: unknown) =>
    registrationUseCases().createSuggestedFiscalProfile(
      inputRecord(rawInput) as unknown as CreateSuggestedFiscalProfileInput))
  ipcMain.handle(IPC_CHANNELS.CREATE_FISCAL_PROFILE, (_event, rawInput: unknown) =>
    registrationUseCases().createFiscalProfile(inputRecord(rawInput) as unknown as CreateFiscalProfileInput))
  ipcMain.handle(IPC_CHANNELS.UPDATE_FISCAL_PROFILE, (_event, rawInput: unknown) =>
    registrationUseCases().updateFiscalProfile(inputRecord(rawInput) as unknown as UpdateFiscalProfileRegistrationInput))
  ipcMain.handle(IPC_CHANNELS.INACTIVATE_FISCAL_PROFILE, (_event, rawInput: unknown) =>
    registrationUseCases().inactivateFiscalProfile(inputRecord(rawInput) as unknown as RegistrationMutationInput))
  ipcMain.handle(IPC_CHANNELS.REACTIVATE_FISCAL_PROFILE, (_event, rawInput: unknown) =>
    registrationUseCases().reactivateFiscalProfile(inputRecord(rawInput) as unknown as RegistrationMutationInput))
  ipcMain.handle(IPC_CHANNELS.LIST_SUPPLIER_PRODUCTS, (_event, companyId: unknown) =>
    registrationUseCases().listSupplierProducts(companyId))
  ipcMain.handle(IPC_CHANNELS.SAVE_SUPPLIER_PRODUCT, (_event, rawInput: unknown) =>
    registrationUseCases().saveSupplierProduct(inputRecord(rawInput) as unknown as SaveSupplierProductInput))
  ipcMain.handle(IPC_CHANNELS.UPDATE_SUPPLIER_PRODUCT, (_event, rawInput: unknown) =>
    registrationUseCases().updateSupplierProduct(inputRecord(rawInput) as unknown as UpdateSupplierProductRegistrationInput))
  ipcMain.handle(IPC_CHANNELS.INACTIVATE_SUPPLIER_PRODUCT, (_event, rawInput: unknown) =>
    registrationUseCases().inactivateSupplierProduct(inputRecord(rawInput) as unknown as RegistrationMutationInput))
  ipcMain.handle(IPC_CHANNELS.REACTIVATE_SUPPLIER_PRODUCT, (_event, rawInput: unknown) =>
    registrationUseCases().reactivateSupplierProduct(inputRecord(rawInput) as unknown as RegistrationMutationInput))
  ipcMain.handle(IPC_CHANNELS.LIST_VERSIONED_RULES, () => versionedRuleUseCases().list())
  ipcMain.handle(IPC_CHANNELS.CREATE_RULE_DRAFT, (_event, rawInput: unknown) =>
    versionedRuleUseCases().createDraft(inputRecord(rawInput) as unknown as CreateRuleDraftInput))
  ipcMain.handle(IPC_CHANNELS.UPDATE_RULE_DRAFT, (_event, rawInput: unknown) =>
    versionedRuleUseCases().updateDraft(inputRecord(rawInput) as unknown as UpdateRuleDraftInput))
  ipcMain.handle(IPC_CHANNELS.CREATE_RULE_VERSION, (_event, rawInput: unknown) =>
    versionedRuleUseCases().createVersion(inputRecord(rawInput) as unknown as RuleVersionMutationInput))
  ipcMain.handle(IPC_CHANNELS.APPROVE_RULE, (_event, rawInput: unknown) =>
    versionedRuleUseCases().approve(inputRecord(rawInput) as unknown as RuleVersionMutationInput))
  ipcMain.handle(IPC_CHANNELS.REVOKE_RULE, (_event, rawInput: unknown) =>
    versionedRuleUseCases().revoke(inputRecord(rawInput) as unknown as RevokeRuleInput))
  ipcMain.handle(IPC_CHANNELS.LIST_RULE_AUDIT, (_event, versionId: unknown) =>
    versionedRuleUseCases().listAudit(versionId as string))
  ipcMain.handle(IPC_CHANNELS.GET_BUILTIN_RULE_PACK, (): BuiltinRulePackSummary => ({
    id: BUILTIN_ICMS_OWN_PACK.id,
    version: BUILTIN_ICMS_OWN_PACK.version,
    rules: BUILTIN_ICMS_OWN_PACK.rules.map((rule) => ({ ...rule })),
  }))
}
