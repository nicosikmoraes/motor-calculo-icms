import { IPC_CHANNELS, type BuiltinRulePackSummary, type CreateRuleDraftInput, type UpdateRuleDraftInput,
  type RuleVersionMutationInput, type RevokeRuleInput } from '@motor/contracts'
import { BUILTIN_ICMS_OWN_PACK } from '@motor/tax-engine'
import type { VersionedRuleUseCases } from '../../../modules/fiscal/application/versioned-rule-use-cases'
import type { RegisterIpcRoute } from '../../route-registry'
import { inputRecord } from '../../validation/input'

export function registerFiscalRuleRoutes(register: RegisterIpcRoute, versionedRuleUseCases: () => VersionedRuleUseCases): void {
  register(IPC_CHANNELS.LIST_VERSIONED_RULES, () => versionedRuleUseCases().list())
  register(IPC_CHANNELS.CREATE_RULE_DRAFT, (_event, rawInput: unknown) =>
    versionedRuleUseCases().createDraft(inputRecord(rawInput) as unknown as CreateRuleDraftInput))
  register(IPC_CHANNELS.UPDATE_RULE_DRAFT, (_event, rawInput: unknown) =>
    versionedRuleUseCases().updateDraft(inputRecord(rawInput) as unknown as UpdateRuleDraftInput))
  register(IPC_CHANNELS.CREATE_RULE_VERSION, (_event, rawInput: unknown) =>
    versionedRuleUseCases().createVersion(inputRecord(rawInput) as unknown as RuleVersionMutationInput))
  register(IPC_CHANNELS.APPROVE_RULE, (_event, rawInput: unknown) =>
    versionedRuleUseCases().approve(inputRecord(rawInput) as unknown as RuleVersionMutationInput))
  register(IPC_CHANNELS.REVOKE_RULE, (_event, rawInput: unknown) =>
    versionedRuleUseCases().revoke(inputRecord(rawInput) as unknown as RevokeRuleInput))
  register(IPC_CHANNELS.LIST_RULE_AUDIT, (_event, versionId: unknown) =>
    versionedRuleUseCases().listAudit(versionId as string))
  register(IPC_CHANNELS.GET_BUILTIN_RULE_PACK, (): BuiltinRulePackSummary => ({
    id: BUILTIN_ICMS_OWN_PACK.id,
    version: BUILTIN_ICMS_OWN_PACK.version,
    rules: BUILTIN_ICMS_OWN_PACK.rules.map((rule) => ({ ...rule })),
  }))
}
