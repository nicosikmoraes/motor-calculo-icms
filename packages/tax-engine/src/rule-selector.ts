export const RULE_LEVELS = [
  'DEFAULT_OPERATION',
  'NCM',
  'NCM_CEST',
  'FISCAL_PROFILE',
  'COMPANY',
  'PRODUCT_COMPANY_EXCEPTION',
] as const

export type RuleLevel = (typeof RULE_LEVELS)[number]

export interface RuleContext {
  emissionDate: string
  companyId?: string
  supplierProductId?: string
  fiscalProfileId?: string
  originState?: string
  destinationState?: string
  ncm?: string
  cest?: string
  cfop?: string
  operationType?: string
  issuerRegime?: string
  cst?: string
  recipientTaxpayer?: string
  finalConsumer?: string
  purpose?: string
  merchandiseOrigin?: string
}

type ConditionKey = Exclude<keyof RuleContext, 'emissionDate'>
export type RuleConditions = Partial<Record<ConditionKey, string>>

export interface FiscalRule {
  id: string
  version: number
  name: string
  status: 'DRAFT' | 'APPROVED' | 'REVOKED'
  level: RuleLevel
  priority: number
  validFrom: string
  validUntil?: string
  legalBasis: string
  conditions: RuleConditions
}

export interface RankedRule {
  rule: FiscalRule
  specificity: number
  levelRank: number
}

export type RuleExclusionReason =
  | 'NOT_APPROVED'
  | 'NOT_YET_VALID'
  | 'EXPIRED'
  | 'CONDITION_MISMATCH'

export interface RuleEvaluation {
  rule: FiscalRule
  eligible: boolean
  exclusionReasons: readonly RuleExclusionReason[]
  mismatchedConditions: readonly ConditionKey[]
}

export type RuleSelection =
  | { kind: 'NOT_FOUND'; considered: readonly RankedRule[]; evaluated: readonly RuleEvaluation[] }
  | {
      kind: 'SELECTED'
      selected: RankedRule
      considered: readonly RankedRule[]
      evaluated: readonly RuleEvaluation[]
    }
  | {
      kind: 'AMBIGUOUS'
      tied: readonly RankedRule[]
      considered: readonly RankedRule[]
      evaluated: readonly RuleEvaluation[]
    }

function evaluate(rule: FiscalRule, context: RuleContext): RuleEvaluation {
  const exclusionReasons: RuleExclusionReason[] = []
  if (rule.status !== 'APPROVED') exclusionReasons.push('NOT_APPROVED')
  if (rule.validFrom > context.emissionDate) exclusionReasons.push('NOT_YET_VALID')
  if (rule.validUntil && rule.validUntil < context.emissionDate) exclusionReasons.push('EXPIRED')

  const mismatchedConditions = (Object.keys(rule.conditions) as ConditionKey[])
    .filter((key) => {
      const expected = rule.conditions[key]
      return expected !== undefined && expected !== '' && context[key] !== expected
    })
    .sort()
  if (mismatchedConditions.length > 0) exclusionReasons.push('CONDITION_MISMATCH')

  return {
    rule,
    eligible: exclusionReasons.length === 0,
    exclusionReasons,
    mismatchedConditions,
  }
}

function rank(rule: FiscalRule): RankedRule {
  const specificity = Object.values(rule.conditions).filter(
    (value) => value !== undefined && value !== '',
  ).length

  return {
    rule,
    specificity,
    levelRank: RULE_LEVELS.indexOf(rule.level),
  }
}

function compare(left: RankedRule, right: RankedRule): number {
  return (
    right.levelRank - left.levelRank ||
    right.specificity - left.specificity ||
    right.rule.priority - left.rule.priority
  )
}

export function selectFiscalRule(
  rules: readonly FiscalRule[],
  context: RuleContext,
): RuleSelection {
  const evaluated = rules.map((rule) => evaluate(rule, context))
  const considered = evaluated
    .filter((candidate) => candidate.eligible)
    .map((candidate) => rank(candidate.rule))
    .sort(compare)

  const first = considered[0]
  if (!first) return { kind: 'NOT_FOUND', considered, evaluated }

  const tied = considered.filter(
    (candidate) =>
      candidate.levelRank === first.levelRank &&
      candidate.specificity === first.specificity &&
      candidate.rule.priority === first.rule.priority,
  )

  if (tied.length > 1) return { kind: 'AMBIGUOUS', tied, considered, evaluated }

  return { kind: 'SELECTED', selected: first, considered, evaluated }
}
