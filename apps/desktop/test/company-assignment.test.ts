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
  it('não atribui automaticamente a empresa destinatária quando o emitente ainda não está cadastrado', () => {
    expect(suggestCompanyForDocument(document, [recipient])).toBe('')
  })

  it('associa o emitente cadastrado e preserva escolha explícita pelo destinatário', () => {
    expect(suggestCompanyForDocument(document, [recipient, issuer])).toBe(issuer.id)
    expect(suggestCompanyForDocument(document, [recipient, issuer], recipient.id)).toBe(recipient.id)
  })
})
