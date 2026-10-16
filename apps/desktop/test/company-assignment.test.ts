import { describe, expect, it } from 'vitest'
import { suggestCompanyForDocument } from '../src/renderer/company-assignment'

const document = {
  source: '/tmp/notas.zip#nota-b.xml',
  accessKey: '1'.repeat(44),
  number: '12',
  issuerCnpj: '11444777000161',
  recipientCnpj: '11222333000181',
}
const recipient = {
  id: 'empresa-a',
  cnpj: '11222333000181',
  legalName: 'Empresa A',
  state: 'PR',
  active: true,
}
const issuer = {
  id: 'empresa-b',
  cnpj: '11444777000161',
  legalName: 'Empresa B',
  state: 'PR',
  active: true,
}

describe('sugestão de empresa por nota', () => {
  it('reconhece pelo CNPJ a destinatária quando é a única empresa compatível cadastrada', () => {
    expect(suggestCompanyForDocument(document, [recipient])).toBe(recipient.id)
  })

  it('pede a perspectiva quando as duas empresas estão cadastradas e preserva a escolha explícita', () => {
    expect(suggestCompanyForDocument(document, [recipient, issuer])).toBe('')
    expect(suggestCompanyForDocument(document, [recipient, issuer], recipient.id)).toBe(recipient.id)
    expect(suggestCompanyForDocument(document, [recipient, issuer], issuer.id)).toBe(issuer.id)
  })

  it('sugere o emitente quando ele é a única empresa compatível cadastrada', () => {
    expect(suggestCompanyForDocument(document, [issuer])).toBe(issuer.id)
  })

  it('usa o CNPJ sugerido para a compra e deixa cadastrar a compradora quando só o fornecedor existe', () => {
    const purchase = { ...document, suggestedCompanyCnpj: recipient.cnpj }
    expect(suggestCompanyForDocument(purchase, [recipient, issuer])).toBe(recipient.id)
    expect(suggestCompanyForDocument(purchase, [issuer])).toBe('')
    expect(suggestCompanyForDocument(purchase, [recipient, issuer], issuer.id)).toBe(issuer.id)
    expect(suggestCompanyForDocument(purchase, [{ ...recipient, active: false }, issuer])).toBe('')
  })
})
