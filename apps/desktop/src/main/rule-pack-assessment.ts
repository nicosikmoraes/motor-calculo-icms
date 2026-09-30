import { ItemClassificationReasonCode, RuleAssessmentKindCode, RuleAssessmentPendingCode, type ItemRuleAssessment, type RuleEvaluationSummary } from '@motor/contracts'
import { classifyFiscalItem } from './fiscal-item-classification'
import type { FiscalProfileRecord, SupplierProductRecord, VersionedRuleRecord } from '@motor/database'
import type { NormalizedNfe, NormalizedNfeItem } from '@motor/domain'
import {
  BUILTIN_ICMS_OWN_PACK, FiscalRuleStatusCode, RuleExclusionReasonCode,
  RuleSelectionKindCode, resolveCurrentRuleVersions, selectFiscalRule,
  type FamilyRule, type RuleContext, type RuleLevel,
} from '@motor/tax-engine'

export const LOCAL_RULE_PACK_ID = 'catalogo-local-e-propostas'
export const LOCAL_RULE_PACK_VERSION = 1

/** Dados usados pela seleção, inclusive vínculos cadastrais ativos da empresa. */
export function ruleContext(note: NormalizedNfe, item: NormalizedNfeItem,
  companyId?: string, profiles: readonly FiscalProfileRecord[] = [],
  products: readonly SupplierProductRecord[] = []): RuleContext {
  const issueDate = note.issuedAt?.slice(0, 10) ?? ''
  const supplierCnpj = note.issuer.taxIdType === 'CNPJ' ? note.issuer.taxId?.replace(/\D/g, '') : undefined
  const product = products.find((entry) => entry.active && entry.companyId === companyId
    && entry.supplierCnpj === supplierCnpj && entry.productCode === item.supplierProductCode)
  const profile = profiles.find((entry) => entry.active && entry.companyId === companyId
    && entry.id === product?.profileId && entry.validFrom <= issueDate
    && (!entry.validUntil || entry.validUntil >= issueDate))
  return {
    emissionDate: issueDate,
    ...(companyId ? { companyId } : {}),
    ...(product && profile ? { supplierProductId: product.id, fiscalProfileId: profile.id } : {}),
    ...(note.issuer.state ? { originState: note.issuer.state } : {}),
    ...(note.recipient?.state ? { destinationState: note.recipient.state } : {}),
    ...(note.issuer.taxRegimeCode ? { issuerRegime: note.issuer.taxRegimeCode } : {}),
    ...(note.operationDirection ? { operationType: note.operationDirection } : {}),
    ...(note.purposeCode ? { purpose: note.purposeCode } : {}),
    ...(note.finalConsumerIndicator ? { finalConsumer: note.finalConsumerIndicator } : {}),
    ...(item.cfop ? { cfop: item.cfop } : {}),
    ...(item.declaredIcms?.cst ? { cst: item.declaredIcms.cst } : {}),
    ...(item.declaredIcms?.originCode ? { merchandiseOrigin: item.declaredIcms.originCode } : {}),
    ...(item.ncm ? { ncm: item.ncm } : {}),
    ...(item.cest ? { cest: item.cest } : {}),
  }
}

type AssessmentRule = FamilyRule & { source: 'BUILTIN' | 'LOCAL'; proposedRate?: string;
  reviewStage?: 'CONDITIONS_AND_RATE_APPROVED' }
function localRule(rule: VersionedRuleRecord): AssessmentRule {
  return {
    id: rule.id, familyId: rule.familyId, version: rule.version, name: rule.name,
    status: rule.status, level: rule.level as RuleLevel, priority: rule.priority,
    validFrom: rule.validFrom, ...(rule.validUntil ? { validUntil: rule.validUntil } : {}),
    legalBasis: rule.legalBasis ?? '', conditions: rule.conditions, source: 'LOCAL',
  }
}
function result(evaluation: ReturnType<typeof selectFiscalRule>['evaluated'][number],
  rank?: number, extraReason?: string): RuleEvaluationSummary {
  const rule = evaluation.rule as AssessmentRule
  return {
    ruleId: rule.id, ruleName: rule.name, status: rule.status, source: rule.source,
    ...(rule.source === 'LOCAL' ? { familyId: rule.familyId } : {}),
    version: rule.version, level: rule.level, priority: rule.priority,
    legalBasis: rule.legalBasis, conditions: rule.conditions,
    ...(rule.proposedRate ? { proposedRate: rule.proposedRate } : {}),
    ...(rule.reviewStage ? { reviewStage: rule.reviewStage } : {}),
    ...(rank ? { selectionRank: rank } : {}),
    exclusionReasons: [...evaluation.exclusionReasons, ...(extraReason ? [extraReason] : [])],
    mismatchedConditions: evaluation.mismatchedConditions,
  }
}

/** Salva uma fotografia da seleção; propostas embarcadas continuam sem cálculo. */
export function assessFiscalRules(note: NormalizedNfe, item: NormalizedNfeItem,
  versioned: readonly VersionedRuleRecord[], companyId?: string,
  profiles: readonly FiscalProfileRecord[] = [], products: readonly SupplierProductRecord[] = [],
  assessedAt = new Date().toISOString()): ItemRuleAssessment {
  const context = ruleContext(note, item, companyId, profiles, products)
  const builtin: AssessmentRule[] = BUILTIN_ICMS_OWN_PACK.rules.map((rule) => ({
    ...rule, familyId: rule.id, source: 'BUILTIN',
  }))
  const current = resolveCurrentRuleVersions(versioned.map(localRule))
  const selection = selectFiscalRule([...builtin, ...current.candidates], context)
  const ranks = new Map(selection.considered.map((candidate, index) => [candidate.rule.id, index + 1]))
  const superseded = selectFiscalRule(current.superseded, context).evaluated
    .map((evaluation) => result(evaluation, undefined, RuleExclusionReasonCode.SUPERSEDED))
  const evaluated = [...selection.evaluated.map((evaluation) => result(evaluation, ranks.get(evaluation.rule.id))),
    ...superseded]
  const matchingDrafts = evaluated.filter((candidate) => candidate.status === FiscalRuleStatusCode.DRAFT
    && candidate.exclusionReasons.every((reason) => reason === RuleExclusionReasonCode.NOT_APPROVED))
  // A falta de regra aprovada e a falha cadastral são fatos distintos: ambos ficam no snapshot.
  const pendingCodes: RuleAssessmentPendingCode[] = []
  if (selection.kind === RuleSelectionKindCode.AMBIGUOUS) {
    pendingCodes.push(RuleAssessmentPendingCode.REGRA_AMBIGUA)
  } else if (selection.kind === RuleSelectionKindCode.NOT_FOUND) {
    pendingCodes.push(RuleAssessmentPendingCode.REGRA_NAO_ENCONTRADA)
  }
  const supplierCnpj = note.issuer.taxIdType === 'CNPJ' ? note.issuer.taxId?.replace(/\D/g, '') : undefined
  const classification = classifyFiscalItem(companyId, supplierCnpj, item.supplierProductCode,
    note.issuedAt, profiles, products)
  if (selection.kind === RuleSelectionKindCode.NOT_FOUND) {
    if (classification.classificationReason === ItemClassificationReasonCode.PRODUCT_CODE_MISSING
      || classification.classificationReason === ItemClassificationReasonCode.PRODUCT_NOT_LINKED) {
      pendingCodes.push(RuleAssessmentPendingCode.PRODUTO_NAO_CLASSIFICADO)
    } else if (([
      ItemClassificationReasonCode.PRODUCT_INACTIVE, ItemClassificationReasonCode.PROFILE_NOT_FOUND,
      ItemClassificationReasonCode.PROFILE_INACTIVE, ItemClassificationReasonCode.PROFILE_NOT_YET_VALID,
      ItemClassificationReasonCode.PROFILE_EXPIRED,
    ] as readonly string[]).includes(classification.classificationReason)) {
      pendingCodes.push(RuleAssessmentPendingCode.DIVERGENCIA_CADASTRAL)
    }
  }
  return {
    packId: versioned.length ? LOCAL_RULE_PACK_ID : BUILTIN_ICMS_OWN_PACK.id,
    packVersion: versioned.length ? LOCAL_RULE_PACK_VERSION : BUILTIN_ICMS_OWN_PACK.version,
    assessedAt, context: { ...context },
    ...(pendingCodes.length ? { pendingCodes } : {}),
    ...(pendingCodes.length > 1 ? { pendingDetail: classification.classificationReason } : {}),
    kind: selection.kind === RuleSelectionKindCode.NOT_FOUND
      ? matchingDrafts.length ? RuleAssessmentKindCode.DRAFT_MATCH : RuleAssessmentKindCode.NO_MATCH
      : selection.kind,
    ...(selection.kind === RuleSelectionKindCode.SELECTED
      ? { selectedRuleId: selection.selected.rule.id, selectedRuleVersion: selection.selected.rule.version } : {}),
    ...(selection.kind === RuleSelectionKindCode.AMBIGUOUS
      ? { tiedRuleIds: selection.tied.map((entry) => entry.rule.id) } : {}),
    evaluated,
  }
}

/** Mantém o contrato dos testes e das avaliações antigas do pacote embarcado. */
export function assessBuiltinRules(note: NormalizedNfe, item: NormalizedNfeItem,
  assessedAt = new Date().toISOString()): ItemRuleAssessment {
  return assessFiscalRules(note, item, [], undefined, [], [], assessedAt)
}
