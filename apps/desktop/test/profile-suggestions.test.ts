import { describe, expect, it } from 'vitest'
import { buildFiscalProfileSuggestions } from '../src/main/profile-suggestions'

const cnpj = '11222333000181'

describe('sugestões cadastrais a partir das notas', () => {
  it('agrupa produtos consistentes e usa a primeira data de emissão', () => {
    const suggestions = buildFiscalProfileSuggestions([
      { documentId: 'nota-1', issuedAt: '2026-05-02T12:00:00Z', supplierCnpj: cnpj,
        productCode: 'A', ncm: '12345678', cest: '1234567', originCode: '0' },
      { documentId: 'nota-2', issuedAt: '2026-01-01T12:00:00Z', supplierCnpj: cnpj,
        productCode: 'A', ncm: '12345678', cest: '1234567', originCode: '0' },
      { documentId: 'nota-2', issuedAt: '2026-01-01T12:00:00Z', supplierCnpj: cnpj,
        productCode: 'B', ncm: '12345678', cest: '1234567', originCode: '0' },
    ])
    expect(suggestions).toMatchObject([{
      name: 'NCM 12345678 · CEST 1234567 · origem 0',
      validFrom: '2026-01-01', documentCount: 2,
      products: [{ productCode: 'A' }, { productCode: 'B' }],
    }])
  })

  it('não sugere produto com NCM divergente ou data ausente', () => {
    expect(buildFiscalProfileSuggestions([
      { documentId: 'nota-1', issuedAt: '2026-01-01', supplierCnpj: cnpj, productCode: 'A', ncm: '11111111' },
      { documentId: 'nota-2', issuedAt: '2026-02-01', supplierCnpj: cnpj, productCode: 'A', ncm: '22222222' },
      { documentId: 'nota-3', supplierCnpj: cnpj, productCode: 'B', ncm: '33333333' },
    ])).toEqual([])
  })
})
