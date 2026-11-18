import {
  IPC_CHANNELS, type CreateCompanyInput, type CreateFiscalProfileInput, type CreateOrganizationInput,
  type CreateSuggestedFiscalProfileInput, type RenameOrganizationInput, type SaveSupplierProductInput,
  type RegistrationAuditFilter, type RegistrationMutationInput, type UpdateCompanyRegistrationInput,
  type UpdateFiscalProfileRegistrationInput, type UpdateSupplierProductRegistrationInput,
} from '@motor/contracts'
import type { RegistrationUseCases } from '../../../modules/registrations/application/registration-use-cases'
import type { RegisterIpcRoute } from '../../route-registry'
import { inputRecord } from '../../validation/input'

/** Valida o envelope IPC e delega as regras de cadastro à aplicação. */
export function registerRegistrationRoutes(register: RegisterIpcRoute, registrationUseCases: () => RegistrationUseCases): void {
  register(IPC_CHANNELS.GET_WORKSPACE, () => registrationUseCases().getWorkspace())
  register(IPC_CHANNELS.LIST_REGISTRATION_AUDIT, (_event, rawFilter: unknown) =>
    registrationUseCases().listAudit(rawFilter === undefined ? {} :
      inputRecord(rawFilter) as unknown as RegistrationAuditFilter))
  register(IPC_CHANNELS.CREATE_ORGANIZATION, (_event, rawInput: unknown) =>
    registrationUseCases().createOrganization(inputRecord(rawInput) as unknown as CreateOrganizationInput))
  register(IPC_CHANNELS.RENAME_ORGANIZATION, (_event, rawInput: unknown) =>
    registrationUseCases().renameOrganization(inputRecord(rawInput) as unknown as RenameOrganizationInput))
  register(IPC_CHANNELS.CREATE_COMPANY, (_event, rawInput: unknown) =>
    registrationUseCases().createCompany(inputRecord(rawInput) as unknown as CreateCompanyInput))
  register(IPC_CHANNELS.UPDATE_COMPANY, (_event, rawInput: unknown) =>
    registrationUseCases().updateCompany(inputRecord(rawInput) as unknown as UpdateCompanyRegistrationInput))
  register(IPC_CHANNELS.INACTIVATE_COMPANY, (_event, rawInput: unknown) =>
    registrationUseCases().inactivateCompany(inputRecord(rawInput) as unknown as RegistrationMutationInput))
  register(IPC_CHANNELS.REACTIVATE_COMPANY, (_event, rawInput: unknown) =>
    registrationUseCases().reactivateCompany(inputRecord(rawInput) as unknown as RegistrationMutationInput))
  register(IPC_CHANNELS.LIST_FISCAL_PROFILES, (_event, companyId: unknown) =>
    registrationUseCases().listFiscalProfiles(companyId))
  register(IPC_CHANNELS.LIST_FISCAL_PROFILE_SUGGESTIONS, (_event, companyId: unknown) =>
    registrationUseCases().listFiscalProfileSuggestions(companyId))
  register(IPC_CHANNELS.CREATE_SUGGESTED_FISCAL_PROFILE, (_event, rawInput: unknown) =>
    registrationUseCases().createSuggestedFiscalProfile(
      inputRecord(rawInput) as unknown as CreateSuggestedFiscalProfileInput))
  register(IPC_CHANNELS.CREATE_FISCAL_PROFILE, (_event, rawInput: unknown) =>
    registrationUseCases().createFiscalProfile(inputRecord(rawInput) as unknown as CreateFiscalProfileInput))
  register(IPC_CHANNELS.UPDATE_FISCAL_PROFILE, (_event, rawInput: unknown) =>
    registrationUseCases().updateFiscalProfile(inputRecord(rawInput) as unknown as UpdateFiscalProfileRegistrationInput))
  register(IPC_CHANNELS.INACTIVATE_FISCAL_PROFILE, (_event, rawInput: unknown) =>
    registrationUseCases().inactivateFiscalProfile(inputRecord(rawInput) as unknown as RegistrationMutationInput))
  register(IPC_CHANNELS.REACTIVATE_FISCAL_PROFILE, (_event, rawInput: unknown) =>
    registrationUseCases().reactivateFiscalProfile(inputRecord(rawInput) as unknown as RegistrationMutationInput))
  register(IPC_CHANNELS.LIST_SUPPLIER_PRODUCTS, (_event, companyId: unknown) =>
    registrationUseCases().listSupplierProducts(companyId))
  register(IPC_CHANNELS.SAVE_SUPPLIER_PRODUCT, (_event, rawInput: unknown) =>
    registrationUseCases().saveSupplierProduct(inputRecord(rawInput) as unknown as SaveSupplierProductInput))
  register(IPC_CHANNELS.UPDATE_SUPPLIER_PRODUCT, (_event, rawInput: unknown) =>
    registrationUseCases().updateSupplierProduct(inputRecord(rawInput) as unknown as UpdateSupplierProductRegistrationInput))
  register(IPC_CHANNELS.INACTIVATE_SUPPLIER_PRODUCT, (_event, rawInput: unknown) =>
    registrationUseCases().inactivateSupplierProduct(inputRecord(rawInput) as unknown as RegistrationMutationInput))
  register(IPC_CHANNELS.REACTIVATE_SUPPLIER_PRODUCT, (_event, rawInput: unknown) =>
    registrationUseCases().reactivateSupplierProduct(inputRecord(rawInput) as unknown as RegistrationMutationInput))
}
