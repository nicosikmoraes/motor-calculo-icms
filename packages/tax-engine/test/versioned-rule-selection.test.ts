import { describe, expect, it } from 'vitest'
import { detectPotentialRuleOverlaps, resolveCurrentRuleVersions, type FamilyRule } from '../src'

const rule: FamilyRule = {
  id: 'v1', familyId: 'family-a', version: 1, name: 'NCM', status: 'APPROVED',
  level: 'NCM', priority: 0, validFrom: '2026-01-01', legalBasis: 'Lei',
  conditions: { ncm: '12345678' },
}
describe('versões vigentes e sobreposição potencial', () => {
  it('mantém versão aprovada durante rascunho e não reativa versão antiga após revogação', () => {
    const draft = { ...rule, id: 'v2', version: 2, status: 'DRAFT' as const }
    expect(resolveCurrentRuleVersions([rule, draft]).candidates.map((entry) => entry.id)).toEqual(['v1', 'v2'])
    const approved = { ...draft, status: 'APPROVED' as const }
    expect(resolveCurrentRuleVersions([rule, approved])).toMatchObject({
      candidates: [{ id: 'v2' }], superseded: [{ id: 'v1' }],
    })
    expect(resolveCurrentRuleVersions([rule, { ...approved, status: 'REVOKED' }]).candidates)
      .toMatchObject([{ id: 'v2', status: 'REVOKED' }])
  })
  it('distingue colisão real possível de vigência ou condição incompatível', () => {
    const other = { ...rule, id: 'other', familyId: 'family-b' }
    expect(detectPotentialRuleOverlaps([rule, other])).toEqual([
      { leftId: 'v1', rightId: 'other', tiePossible: true },
    ])
    expect(detectPotentialRuleOverlaps([rule, { ...other, conditions: { ncm: '87654321' } }])).toEqual([])
    expect(detectPotentialRuleOverlaps([{ ...rule, validUntil: '2026-12-31' },
      { ...other, validFrom: '2026-12-31' }])).toHaveLength(1)
    expect(detectPotentialRuleOverlaps([{ ...rule, validUntil: '2026-12-31' },
      { ...other, validFrom: '2027-01-01' }])).toEqual([])
    expect(detectPotentialRuleOverlaps([rule, { ...other, priority: 1 }]))
      .toEqual([{ leftId: 'v1', rightId: 'other', tiePossible: false }])
  })
})
