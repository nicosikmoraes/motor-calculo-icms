import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { normalizeNfeXml } from '@motor/nfe-parser'
import { entryAutomationReview } from '../src/main/entry-automation-review'

const note = normalizeNfeXml(readFileSync(new URL('./fixtures/revisao-interestadual-1245.xml', import.meta.url), 'utf8'))
const product = { ...note.items[0]!, cfop: '6102', ncm: '39249000', cest: '1400500', description: 'SABONETEIRA PLASTICA', declaredIcms: { group: 'ICMS00', cst: '00', rate: '12', amount: '12' } }
const review = (n = note, item = product) => entryAutomationReview(n, item, n.recipient?.taxId)

describe('diagnóstico automático das pendências', () => {
  it('detecta seção revogada sem sugerir uma MVA de outro produto ou imposto zero', () => {
    expect(review()).toMatchObject({ category: 'REVOKED_ST' })
    expect(review()?.proposedCest).toBeUndefined()
    expect(review({ ...note, issuedAt: '2024-07-31T12:00:00-03:00' })?.category).not.toBe('REVOKED_ST')
    expect(review({ ...note, issuedAt: '2026-10-13T12:00:00-03:00' })?.category).not.toBe('REVOKED_ST')
  })
  it('prioriza destinação e retenção anterior sobre sugestões de classificação', () => {
    const consumer = { ...note, finalConsumerIndicator: '1' }
    expect(review(consumer)?.category).toBe('DESTINATION')
    expect(entryAutomationReview(consumer, { ...product, declaredIcms: { group: 'ICMSSN500', csosn: '500' } }, note.recipient?.taxId)?.category).toBe('PREVIOUS_ST')
  })
  it('não diagnostica compras fora do escopo ou escolhe classificação só pelo NCM', () => {
    expect(entryAutomationReview(note, product, note.issuer.taxId)).toBeUndefined()
    expect(entryAutomationReview(note, product)).toBeUndefined()
    expect(review({ ...note, purposeCode: '4' })).toBeUndefined()
    expect(review(note, { ...product, ncm: '82032090', cest: '0800800', description: 'CURVADOR DE CILIOS' })?.category).toBe('OUTSIDE_CATALOG')
  })
})
