import { FiscalRuleStatusCode, type FiscalRule } from './rule-selector'

export interface FamilyRule extends FiscalRule { familyId: string }
export interface CurrentRuleVersions<T extends FamilyRule> {
  candidates: readonly T[]
  superseded: readonly T[]
}

/** Um rascunho não desloca a versão final; revogar a mais nova não restaura uma antiga. */
export function resolveCurrentRuleVersions<T extends FamilyRule>(rules: readonly T[]): CurrentRuleVersions<T> {
  const groups = new Map<string, T[]>()
  for (const rule of rules) groups.set(rule.familyId, [...(groups.get(rule.familyId) ?? []), rule])
  const candidates: T[] = []
  const superseded: T[] = []
  for (const family of groups.values()) {
    const finalized = family.filter((rule) => rule.status !== FiscalRuleStatusCode.DRAFT)
      .sort((left, right) => right.version - left.version)[0]
    for (const rule of family) {
      if (rule.status === FiscalRuleStatusCode.DRAFT || rule.id === finalized?.id) candidates.push(rule)
      else superseded.push(rule)
    }
  }
  return { candidates, superseded }
}

export interface PotentialRuleOverlap {
  leftId: string
  rightId: string
  tiePossible: boolean
}

/** Condições exatas e vigências que podem alcançar o mesmo item no mesmo nível. */
export function detectPotentialRuleOverlaps<T extends FamilyRule>(rules: readonly T[]): readonly PotentialRuleOverlap[] {
  const active = resolveCurrentRuleVersions(rules).candidates
    .filter((rule) => rule.status === FiscalRuleStatusCode.APPROVED)
  const overlaps: PotentialRuleOverlap[] = []
  for (let i = 0; i < active.length; i += 1) {
    const left = active[i]!
    for (let j = i + 1; j < active.length; j += 1) {
      const right = active[j]!
      if (left.familyId === right.familyId || left.level !== right.level) continue
      if ((left.validUntil && left.validUntil < right.validFrom)
        || (right.validUntil && right.validUntil < left.validFrom)) continue
      const conflicting = Object.keys(left.conditions).some((key) => {
        const other = right.conditions[key as keyof typeof right.conditions]
        return other !== undefined && other !== left.conditions[key as keyof typeof left.conditions]
      })
      if (conflicting) continue
      overlaps.push({ leftId: left.id, rightId: right.id,
        tiePossible: Object.keys(left.conditions).length === Object.keys(right.conditions).length
          && left.priority === right.priority })
    }
  }
  return overlaps
}
