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

export type RuleSelection =
  | { kind: 'NOT_FOUND'; considered: readonly RankedRule[] }
  | { kind: 'SELECTED'; selected: RankedRule; considered: readonly RankedRule[] }
  | { kind: 'AMBIGUOUS'; tied: readonly RankedRule[]; considered: readonly RankedRule[] }

function isInForce(rule: FiscalRule, emissionDate: string): boolean {
  return rule.validFrom <= emissionDate && (!rule.validUntil || emissionDate <= rule.validUntil)
}

function matchesContext(conditions: RuleConditions, context: RuleContext): boolean {
  return Object.entries(conditions).every(([key, expected]) => {
    if (expected === undefined || expected === '') return true
    return context[key as ConditionKey] === expected
  })
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
  const considered = rules
    .filter((rule) => rule.status === 'APPROVED')
    .filter((rule) => isInForce(rule, context.emissionDate))
    .filter((rule) => matchesContext(rule.conditions, context))
    .map(rank)
    .sort(compare)

  const first = considered[0]
  if (!first) return { kind: 'NOT_FOUND', considered }

  const tied = considered.filter(
    (candidate) =>
      candidate.levelRank === first.levelRank &&
      candidate.specificity === first.specificity &&
      candidate.rule.priority === first.rule.priority,
  )

  if (tied.length > 1) return { kind: 'AMBIGUOUS', tied, considered }

  return { kind: 'SELECTED', selected: first, considered }
}
