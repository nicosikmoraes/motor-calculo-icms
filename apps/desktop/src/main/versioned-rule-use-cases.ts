import { hostname, userInfo } from 'node:os'
import type {
  CreateRuleDraftInput, RevokeRuleInput, RuleAuditSummary, RuleDraftFields,
  RuleVersionMutationInput, UpdateRuleDraftInput, VersionedRuleSummary,
} from '@motor/contracts'
import { AppError, AppErrorCode, assertRegistrationRevision, type Organization } from '@motor/domain'
import type { RuleAuditEvent, SqliteVersionedRuleRepository, VersionedRuleRecord } from '@motor/database'
import { FiscalRuleStatusCode, RuleLevelCode, RULE_LEVELS } from '@motor/tax-engine'

type RuleRepositories = {
  transaction<T>(operation: () => T): T
  organizations: { findSingle(): Organization | undefined }
  rules: Pick<SqliteVersionedRuleRepository,
    'createFamily' | 'insertDraft' | 'get' | 'list' | 'listFamily' | 'updateDraft' |
    'approve' | 'revoke' | 'appendEvent' | 'listEvents'>
}

type Change = { before: string | number | null; after: string | number | null }
const CONDITION_KEYS = new Set([
  'companyId', 'supplierProductId', 'fiscalProfileId', 'originState', 'destinationState',
  'ncm', 'cest', 'cfop', 'operationType', 'issuerRegime', 'cst', 'recipientTaxpayer',
  'finalConsumer', 'purpose', 'merchandiseOrigin',
])
const REQUIRED_BY_LEVEL: Record<RuleLevelCode, readonly string[]> = {
  [RuleLevelCode.DEFAULT_OPERATION]: ['operationType'],
  [RuleLevelCode.NCM]: ['ncm'],
  [RuleLevelCode.NCM_CEST]: ['ncm', 'cest'],
  [RuleLevelCode.FISCAL_PROFILE]: ['fiscalProfileId'],
  [RuleLevelCode.COMPANY]: ['companyId'],
  [RuleLevelCode.PRODUCT_COMPANY_EXCEPTION]: ['companyId', 'supplierProductId'],
}

function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new AppError(AppErrorCode.REQUIRED_FIELD, { field })
  return value.trim()
}
function optional(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') throw new AppError(AppErrorCode.INVALID_TEXT_FIELD)
  return value.trim() || undefined
}
function date(value: unknown, field: string): string {
  const parsed = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00.000Z`) : null
  if (!parsed || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new AppError(AppErrorCode.INVALID_DATE, { field })
  }
  return value
}
function draftFields(input: RuleDraftFields): RuleDraftFields {
  const level = input.level
  if (!RULE_LEVELS.includes(level as RuleLevelCode)) throw new AppError(AppErrorCode.RULE_INVALID_LEVEL)
  if (!Number.isSafeInteger(input.priority) || input.priority < 0) throw new AppError(AppErrorCode.RULE_INVALID_PRIORITY)
  const priorityReason = optional(input.priorityReason)
  if (input.priority > 0 && !priorityReason) throw new AppError(AppErrorCode.RULE_INVALID_PRIORITY)
  if (!input.conditions || typeof input.conditions !== 'object' || Array.isArray(input.conditions)) {
    throw new AppError(AppErrorCode.RULE_INVALID_CONDITIONS)
  }
  const conditions: Record<string, string> = {}
  for (const [key, value] of Object.entries(input.conditions)) {
    if (!CONDITION_KEYS.has(key) || typeof value !== 'string' || !value.trim()) {
      throw new AppError(AppErrorCode.RULE_INVALID_CONDITIONS)
    }
    conditions[key] = value.trim()
  }
  const validFrom = date(input.validFrom, 'Início da vigência')
  const validUntil = optional(input.validUntil)
  if (validUntil) date(validUntil, 'Fim da vigência')
  if (validUntil && validUntil < validFrom) throw new AppError(AppErrorCode.INVALID_VALIDITY_RANGE)
  const legalBasis = optional(input.legalBasis)
  return {
    name: text(input.name, 'Nome da regra'), level, priority: input.priority,
    ...(priorityReason ? { priorityReason } : {}), validFrom,
    ...(validUntil ? { validUntil } : {}),
    ...(legalBasis ? { legalBasis } : {}),
    conditions,
  }
}
function summary(rule: VersionedRuleRecord): VersionedRuleSummary {
  return {
    id: rule.id, familyId: rule.familyId, version: rule.version, revision: rule.revision,
    status: rule.status, name: rule.name, level: rule.level, priority: rule.priority,
    ...(rule.priorityReason ? { priorityReason: rule.priorityReason } : {}),
    validFrom: rule.validFrom, ...(rule.validUntil ? { validUntil: rule.validUntil } : {}),
    ...(rule.legalBasis ? { legalBasis: rule.legalBasis } : {}), conditions: rule.conditions,
    createdAt: rule.createdAt, updatedAt: rule.updatedAt,
    ...(rule.approvedAt ? { approvedAt: rule.approvedAt } : {}),
    ...(rule.revokedAt ? { revokedAt: rule.revokedAt } : {}),
    ...(rule.revocationReason ? { revocationReason: rule.revocationReason } : {}),
  }
}
function fieldsOf(rule: VersionedRuleRecord): RuleDraftFields {
  return { name: rule.name, level: rule.level, priority: rule.priority,
    ...(rule.priorityReason ? { priorityReason: rule.priorityReason } : {}),
    validFrom: rule.validFrom, ...(rule.validUntil ? { validUntil: rule.validUntil } : {}),
    ...(rule.legalBasis ? { legalBasis: rule.legalBasis } : {}), conditions: rule.conditions }
}

/** Coordena versões, revisão otimista e auditoria na mesma transação local. */
export class VersionedRuleUseCases {
  constructor(private readonly repositories: RuleRepositories,
    private readonly generateId: () => string, private readonly now: () => string) {}

  private organization(): Organization {
    const organization = this.repositories.organizations.findSingle()
    if (!organization) throw new AppError(AppErrorCode.ORGANIZATION_NOT_CONFIGURED)
    return organization
  }
  private get(id: string): VersionedRuleRecord {
    const rule = this.repositories.rules.get(text(id, 'Regra'))
    if (!rule || rule.organizationId !== this.organization().id) throw new AppError(AppErrorCode.RULE_NOT_FOUND)
    return rule
  }
  private revision(rule: VersionedRuleRecord, expected: unknown): number {
    const revision = assertRegistrationRevision(expected)
    if (rule.revision !== revision) throw new AppError(AppErrorCode.REGISTRATION_REVISION_CONFLICT)
    return revision
  }
  private record(rule: VersionedRuleRecord, operation: RuleAuditEvent['operation'],
    changes: Record<string, Change>): void {
    this.repositories.rules.appendEvent({ versionId: rule.id, operation, revision: rule.revision,
      changes, computer: hostname(), systemUser: userInfo().username, createdAt: this.now() })
  }
  list(): readonly VersionedRuleSummary[] {
    return this.repositories.rules.list(this.organization().id).map(summary)
  }
  listAudit(versionId: string): readonly RuleAuditSummary[] {
    const rule = this.get(versionId)
    return this.repositories.rules.listEvents(rule.id)
  }
  createDraft(input: CreateRuleDraftInput): VersionedRuleSummary {
    const fields = draftFields(input)
    return this.repositories.transaction(() => {
      const organization = this.organization()
      const familyId = this.generateId()
      const id = this.generateId()
      const timestamp = this.now()
      this.repositories.rules.createFamily(familyId, organization.id, timestamp)
      this.repositories.rules.insertDraft({ ...fields, id, familyId, version: 1, timestamp })
      const saved = this.get(id)
      this.record(saved, 'CREATE_DRAFT', {
        name: { before: null, after: saved.name }, level: { before: null, after: saved.level },
        priority: { before: null, after: saved.priority },
        validFrom: { before: null, after: saved.validFrom },
        validUntil: { before: null, after: saved.validUntil ?? null },
        legalBasis: { before: null, after: saved.legalBasis ?? null },
        conditions: { before: null, after: JSON.stringify(saved.conditions) },
      })
      return summary(saved)
    })
  }
  updateDraft(input: UpdateRuleDraftInput): VersionedRuleSummary {
    const fields = draftFields(input)
    return this.repositories.transaction(() => {
      const before = this.get(input.id)
      const revision = this.revision(before, input.expectedRevision)
      if (before.status !== FiscalRuleStatusCode.DRAFT) throw new AppError(AppErrorCode.RULE_NOT_DRAFT)
      const changes: Record<string, Change> = {}
      const oldFields = fieldsOf(before)
      for (const key of ['name', 'level', 'priority', 'priorityReason', 'validFrom', 'validUntil', 'legalBasis'] as const) {
        const previous = oldFields[key] ?? null
        const next = fields[key] ?? null
        if (previous !== next) changes[key] = { before: previous, after: next }
      }
      const previousConditions = JSON.stringify(oldFields.conditions)
      const nextConditions = JSON.stringify(fields.conditions)
      if (previousConditions !== nextConditions) changes.conditions = { before: previousConditions, after: nextConditions }
      if (!Object.keys(changes).length) return summary(before)
      if (!this.repositories.rules.updateDraft(before.id, revision, { ...fields, updatedAt: this.now() })) {
        throw new AppError(AppErrorCode.REGISTRATION_REVISION_CONFLICT)
      }
      const saved = this.get(before.id)
      this.record(saved, 'UPDATE_DRAFT', changes)
      return summary(saved)
    })
  }
  createVersion(input: RuleVersionMutationInput): VersionedRuleSummary {
    return this.repositories.transaction(() => {
      const previous = this.get(input.id)
      this.revision(previous, input.expectedRevision)
      if (previous.status === FiscalRuleStatusCode.DRAFT) throw new AppError(AppErrorCode.RULE_NOT_APPROVED)
      const family = this.repositories.rules.listFamily(previous.familyId)
      if (family.some((rule) => rule.status === FiscalRuleStatusCode.DRAFT)) throw new AppError(AppErrorCode.RULE_DRAFT_EXISTS)
      if (family[0]?.version !== previous.version) throw new AppError(AppErrorCode.REGISTRATION_REVISION_CONFLICT)
      const id = this.generateId()
      this.repositories.rules.insertDraft({ ...fieldsOf(previous), id, familyId: previous.familyId,
        version: previous.version + 1, timestamp: this.now() })
      const saved = this.get(id)
      this.record(saved, 'NEW_VERSION', { version: { before: previous.version, after: saved.version } })
      return summary(saved)
    })
  }
  approve(input: RuleVersionMutationInput): VersionedRuleSummary {
    return this.repositories.transaction(() => {
      const before = this.get(input.id)
      const revision = this.revision(before, input.expectedRevision)
      if (before.status !== FiscalRuleStatusCode.DRAFT) throw new AppError(AppErrorCode.RULE_NOT_DRAFT)
      const required = REQUIRED_BY_LEVEL[before.level as RuleLevelCode]
      if (!before.legalBasis || !required?.every((key) => before.conditions[key])) {
        throw new AppError(AppErrorCode.RULE_APPROVAL_INCOMPLETE)
      }
      const timestamp = this.now()
      if (!this.repositories.rules.approve(before.id, revision, timestamp, userInfo().username)) {
        throw new AppError(AppErrorCode.REGISTRATION_REVISION_CONFLICT)
      }
      const saved = this.get(before.id)
      this.record(saved, 'APPROVE', { status: { before: 'DRAFT', after: 'APPROVED' } })
      return summary(saved)
    })
  }
  revoke(input: RevokeRuleInput): VersionedRuleSummary {
    return this.repositories.transaction(() => {
      const before = this.get(input.id)
      this.revision(before, input.expectedRevision)
      if (before.status !== FiscalRuleStatusCode.APPROVED) throw new AppError(AppErrorCode.RULE_NOT_APPROVED)
      this.repositories.rules.revoke(before.id, text(input.reason, 'Motivo da revogação'), this.now(), userInfo().username)
      const saved = this.get(before.id)
      this.record(saved, 'REVOKE', { status: { before: 'APPROVED', after: 'REVOKED' },
        revocationReason: { before: null, after: saved.revocationReason ?? null } })
      return summary(saved)
    })
  }
}
