import { describe, expect, it } from 'vitest'
import type { FiscalProfileRecord, SupplierProductRecord, VersionedRuleRecord } from '@motor/database'
import type { NormalizedNfe, NormalizedNfeItem } from '@motor/domain'
import { assessFiscalRules } from '../src/main/rule-pack-assessment'

const item: NormalizedNfeItem = {
  itemNumber: '1', supplierProductCode: 'P1', ncm: '12345678', cfop: '6102',
  source: { format: 'NFE_XML_4_00', xmlPath: 'NFe.infNFe.det[1]' },
}
const note: NormalizedNfe = {
  kind: 'NFE', layoutVersion: '4.00', model: '55', accessKey: '0'.repeat(44),
  number: '1', series: '1', issuedAt: '2026-09-15T12:00:00-03:00',
  operationDirection: '1', finalConsumerIndicator: '1',
  issuer: { taxIdType: 'CNPJ', taxId: '11222333000181', state: 'PR' },
  recipient: { state: 'SP' }, items: [item], declaredTotals: {},
  source: { format: 'NFE_XML_4_00', xmlPath: 'NFe.infNFe' },
}
const rule: VersionedRuleRecord = {
  id: 'v1', familyId: 'family-a', organizationId: 'org', version: 1, revision: 2,
  status: 'APPROVED', name: 'NCM original', level: 'NCM', priority: 0,
  validFrom: '2026-01-01', legalBasis: 'Lei', conditions: { ncm: '12345678' },
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
}
const profile: FiscalProfileRecord = {
  id: 'profile', revision: 1, active: true, organizationId: 'org', companyId: 'company',
  name: 'Perfil', validFrom: '2026-01-01', createdAt: '2026-01-01T00:00:00.000Z',
}
const product: SupplierProductRecord = {
  id: 'product', revision: 1, active: true, companyId: 'company',
  supplierCnpj: '11222333000181', productCode: 'P1', profileId: 'profile',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('avaliação com catálogo versionado', () => {
  it('mantém aprovada anterior durante rascunho e substitui somente após aprovação', () => {
    const newer = { ...rule, id: 'v2', version: 2, name: 'NCM nova', status: 'DRAFT' as const }
    const before = assessFiscalRules(note, item, [rule, newer], 'company', [], [], '2026-09-29T20:00:00.000Z')
    expect(before.selectedRuleId).toBe('v1')
    expect(before.evaluated.find((entry) => entry.ruleId === 'v2')?.exclusionReasons).toContain('NOT_APPROVED')
    const after = assessFiscalRules(note, item, [rule, { ...newer, status: 'APPROVED' }], 'company')
    expect(after).toMatchObject({ kind: 'SELECTED', selectedRuleId: 'v2', selectedRuleVersion: 2 })
    expect(after.evaluated.find((entry) => entry.ruleId === 'v1')?.exclusionReasons).toContain('SUPERSEDED')
    expect(after.evaluated.find((entry) => entry.ruleId === 'v2')).toMatchObject({
      source: 'LOCAL', familyId: 'family-a', version: 2, legalBasis: 'Lei',
      conditions: { ncm: '12345678' },
    })
    expect(before.selectedRuleId).toBe('v1')
    expect(before.evaluated.find((entry) => entry.ruleId === 'v1')?.exclusionReasons).toEqual([])
  })

  it('não restaura versão antiga quando a nova é revogada', () => {
    const after = assessFiscalRules(note, item, [rule, { ...rule, id: 'v2', version: 2, status: 'REVOKED' }], 'company')
    expect(after.selectedRuleId).toBeUndefined()
    expect(after.evaluated.find((entry) => entry.ruleId === 'v1')?.exclusionReasons).toContain('SUPERSEDED')
    expect(after.evaluated.find((entry) => entry.ruleId === 'v2')).toMatchObject({
      source: 'LOCAL', familyId: 'family-a', version: 2, legalBasis: 'Lei',
      conditions: { ncm: '12345678' },
    })
    expect(after.evaluated.find((entry) => entry.ruleId === 'v2')?.status).toBe('REVOKED')
  })

  it('não restaura versão antiga quando a mais recente está fora da vigência', () => {
    const latest = { ...rule, id: 'v2', version: 2, validFrom: '2027-01-01' }
    const assessment = assessFiscalRules(note, item, [rule, latest], 'company')
    expect(assessment).toMatchObject({ kind: 'NO_MATCH', pendingCodes: ['REGRA_NAO_ENCONTRADA', 'PRODUTO_NAO_CLASSIFICADO'] })
    expect(assessment.evaluated.find((entry) => entry.ruleId === 'v1')?.exclusionReasons).toContain('SUPERSEDED')
    expect(assessment.evaluated.find((entry) => entry.ruleId === 'v2')?.exclusionReasons).toContain('NOT_YET_VALID')
  })

  it('registra empate de famílias diferentes e explica a precedência', () => {
    const other = { ...rule, id: 'other', familyId: 'family-b', name: 'Outro NCM' }
    const ambiguous = assessFiscalRules(note, item, [rule, other], 'company')
    expect(ambiguous.kind).toBe('AMBIGUOUS')
    expect(ambiguous.tiedRuleIds).toEqual(['v1', 'other'])
    const stronger = { ...other, priority: 1 }
    const selected = assessFiscalRules(note, item, [rule, stronger], 'company')
    expect(selected.selectedRuleId).toBe('other')
    expect(selected.evaluated.find((entry) => entry.ruleId === 'v1')?.selectionRank).toBe(2)
  })

  it('usa vínculo e perfil ativos para condições cadastrais', () => {
    const byProfile = { ...rule, level: 'FISCAL_PROFILE', conditions: { fiscalProfileId: 'profile' } }
    const active = assessFiscalRules(note, item, [byProfile], 'company', [profile], [product])
    expect(active.selectedRuleId).toBe('v1')
    expect(active.context).toMatchObject({ companyId: 'company', fiscalProfileId: 'profile', supplierProductId: 'product' })
    const inactive = assessFiscalRules(note, item, [byProfile], 'company', [{ ...profile, active: false }], [product])
    expect(inactive.selectedRuleId).toBeUndefined()
    expect(inactive.evaluated.find((entry) => entry.ruleId === 'v1')?.mismatchedConditions)
      .toContain('fiscalProfileId')
  })
  it('registra regra ausente e produto sem vínculo como pendências distintas', () => {
    const assessment = assessFiscalRules(note, item, [], 'company', [], [])
    expect(assessment).toMatchObject({
      kind: 'NO_MATCH',
      pendingCodes: ['REGRA_NAO_ENCONTRADA', 'PRODUTO_NAO_CLASSIFICADO'],
      pendingDetail: 'PRODUCT_NOT_LINKED',
    })
  })

  it('mantém a pendência de regra quando só há rascunho compatível', () => {
    const assessment = assessFiscalRules(note, item, [{ ...rule, status: 'DRAFT' }], 'company', [profile], [product])
    expect(assessment).toMatchObject({ kind: 'DRAFT_MATCH', pendingCodes: ['REGRA_NAO_ENCONTRADA'] })
  })

  it('registra divergência cadastral quando o perfil vinculado está inativo', () => {
    const byProfile = { ...rule, level: 'FISCAL_PROFILE', conditions: { fiscalProfileId: 'profile' } }
    const assessment = assessFiscalRules(note, item, [byProfile], 'company', [{ ...profile, active: false }], [product])
    expect(assessment).toMatchObject({
      kind: 'NO_MATCH',
      pendingCodes: ['REGRA_NAO_ENCONTRADA', 'DIVERGENCIA_CADASTRAL'],
      pendingDetail: 'PROFILE_INACTIVE',
    })
  })

  it('registra empate e não cria pendência quando uma regra aprovada é selecionada', () => {
    const other = { ...rule, id: 'other', familyId: 'family-b' }
    const ambiguous = assessFiscalRules(note, item, [rule, other], 'company', [], [])
    expect(ambiguous.pendingCodes).toEqual(['REGRA_AMBIGUA'])
    const selected = assessFiscalRules(note, item, [rule], 'company', [], [])
    expect(selected.kind).toBe('SELECTED')
    expect(selected.pendingCodes).toBeUndefined()
  })
})
