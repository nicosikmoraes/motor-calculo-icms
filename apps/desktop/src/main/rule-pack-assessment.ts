import { RuleAssessmentKindCode, type ItemRuleAssessment } from '@motor/contracts'
import type { NormalizedNfe, NormalizedNfeItem } from '@motor/domain'
import { BUILTIN_ICMS_OWN_PACK, FiscalRuleStatusCode, RuleExclusionReasonCode, RuleSelectionKindCode, selectFiscalRule, type RuleContext } from '@motor/tax-engine'

/** Avalia as propostas embarcadas; DRAFT nunca vira regra selecionada para cálculo. */
export function assessBuiltinRules(note: NormalizedNfe, item: NormalizedNfeItem, assessedAt = new Date().toISOString()): ItemRuleAssessment {
  const context: RuleContext = {
    emissionDate: note.issuedAt?.slice(0, 10) ?? '',
    ...(note.issuer.state ? { originState: note.issuer.state } : {}),
    ...(note.recipient?.state ? { destinationState: note.recipient.state } : {}),
    ...(note.issuer.taxRegimeCode ? { issuerRegime: note.issuer.taxRegimeCode } : {}),
    ...(note.operationDirection ? { operationType: note.operationDirection } : {}),
    ...(note.purposeCode ? { purpose: note.purposeCode } : {}),
    ...(item.cfop ? { cfop: item.cfop } : {}),
    ...(item.declaredIcms?.cst ? { cst: item.declaredIcms.cst } : {}),
    ...(item.declaredIcms?.originCode ? { merchandiseOrigin: item.declaredIcms.originCode } : {}),
    ...(item.ncm ? { ncm: item.ncm } : {}),
    ...(item.cest ? { cest: item.cest } : {}),
  }
  const selection = selectFiscalRule(BUILTIN_ICMS_OWN_PACK.rules, context)
  const evaluated = selection.evaluated.map((candidate) => ({
    ruleId: candidate.rule.id,
    ruleName: candidate.rule.name,
    status: candidate.rule.status,
    proposedRate: BUILTIN_ICMS_OWN_PACK.rules.find((rule) => rule.id === candidate.rule.id)!.proposedRate,
    reviewStage: BUILTIN_ICMS_OWN_PACK.rules.find((rule) => rule.id === candidate.rule.id)!.reviewStage,
    exclusionReasons: candidate.exclusionReasons,
    mismatchedConditions: candidate.mismatchedConditions,
  }))
  const matchingDrafts = evaluated.filter((candidate) =>
    candidate.status === FiscalRuleStatusCode.DRAFT
    && candidate.exclusionReasons.every((reason) => reason === RuleExclusionReasonCode.NOT_APPROVED),
  )
  return {
    packId: BUILTIN_ICMS_OWN_PACK.id,
    packVersion: BUILTIN_ICMS_OWN_PACK.version,
    assessedAt,
    context: { ...context },
    kind: selection.kind === RuleSelectionKindCode.NOT_FOUND
      ? matchingDrafts.length > 0 ? RuleAssessmentKindCode.DRAFT_MATCH : RuleAssessmentKindCode.NO_MATCH
      : selection.kind,
    ...(selection.kind === RuleSelectionKindCode.SELECTED ? { selectedRuleId: selection.selected.rule.id } : {}),
    evaluated,
  }
}
