import { describe, expect, it } from 'vitest'
import { assignBatchCompanies, inferBatchCompanyCnpj, pendingCompanyRegistrations, suggestCompanyForDocument } from '../src/renderer/company-assignment'

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

describe('empresa analisada no lote sem perder os participantes do XML', () => {
  const thirdCompany = { ...issuer, id: 'empresa-c', cnpj: '12345678000195', legalName: 'Empresa C' }
  const documents = [
    { ...document, source: 'venda.xml', suggestedCompanyCnpj: issuer.cnpj },
    { ...document, source: 'outra-venda.xml', issuerCnpj: thirdCompany.cnpj },
    { ...document, source: 'devolucao.xml', issuerCnpj: recipient.cnpj, recipientCnpj: thirdCompany.cnpj },
  ]

  it('sugere o único CNPJ comum, mesmo mudando de emitente para destinatário', () => {
    expect(inferBatchCompanyCnpj(documents)).toBe(recipient.cnpj)
    expect(inferBatchCompanyCnpj(documents, issuer.cnpj)).toBe(issuer.cnpj)
    expect(inferBatchCompanyCnpj(documents, '00000000000000')).toBe(recipient.cnpj)
  })

  it('não inventa perspectiva quando duas empresas são comuns ou não há CNPJ comum', () => {
    expect(inferBatchCompanyCnpj([document, { ...document, source: 'repetida.xml' }])).toBe('')
    expect(inferBatchCompanyCnpj([document, { source: 'terceira.xml', accessKey: '2'.repeat(44), number: '13', issuerCnpj: thirdCompany.cnpj }])).toBe('')
    expect(inferBatchCompanyCnpj([])).toBe('')
  })

  it('preenche o lote inteiro com a empresa analisada, inclusive devoluções com outra sugestão', () => {
    const before = structuredClone(documents)
    expect(assignBatchCompanies(documents, [recipient, issuer, thirdCompany], recipient.cnpj)).toEqual({
      'venda.xml': recipient.id, 'outra-venda.xml': recipient.id, 'devolucao.xml': recipient.id,
    })
    expect(documents).toEqual(before)
  })

  it('aguarda cadastro da empresa analisada sem substituí-la pelo fornecedor já cadastrado', () => {
    expect(assignBatchCompanies(documents, [issuer, thirdCompany], recipient.cnpj)).toEqual({
      'venda.xml': '', 'outra-venda.xml': '', 'devolucao.xml': '',
    })
    expect(assignBatchCompanies(documents, [{ ...recipient, active: false }, issuer], recipient.cnpj)['venda.xml']).toBe('')
  })

  it('mantém ajustes individuais explícitos e não associa empresa ausente de um XML', () => {
    expect(assignBatchCompanies(documents, [recipient, issuer, thirdCompany], issuer.cnpj)).toEqual({
      'venda.xml': issuer.id, 'outra-venda.xml': '', 'devolucao.xml': '',
    })
    expect(assignBatchCompanies(documents, [recipient, issuer, thirdCompany], recipient.cnpj, {
      'venda.xml': issuer.id, 'outra-venda.xml': '', 'devolucao.xml': issuer.id,
    })).toEqual({ 'venda.xml': issuer.id, 'outra-venda.xml': '', 'devolucao.xml': '' })
  })

  it('não troca silenciosamente uma escolha manual cujo cadastro ficou inativo', () => {
    expect(assignBatchCompanies([document], [recipient, { ...issuer, active: false }], recipient.cnpj, {
      [document.source]: issuer.id,
    })[document.source]).toBe('')
  })

  it('oferece cadastro da empresa analisada em vez de cadastrar todas as contrapartes', () => {
    const candidates = [recipient, issuer, thirdCompany].map(c => ({ cnpj: c.cnpj, legalName: c.legalName,
      state: c.state, roles: ['ISSUER', 'RECIPIENT'] as const, documentCount: 3 }))
    expect(pendingCompanyRegistrations(documents, candidates, [issuer], {}, recipient.cnpj).map(c => c.cnpj)).toEqual([recipient.cnpj])
    expect(pendingCompanyRegistrations(documents, candidates, [recipient, issuer],
      assignBatchCompanies(documents, [recipient, issuer], recipient.cnpj), recipient.cnpj)).toEqual([])
    expect(pendingCompanyRegistrations(documents, candidates, [{ ...recipient, active: false }, issuer], {}, recipient.cnpj)).toEqual([])
  })

  it('permite cadastrar a empresa de uma exceção que não contém o CNPJ escolhido para o lote', () => {
    const exception = { ...document, source: 'excecao.xml', recipientCnpj: thirdCompany.cnpj }
    const candidates = [{ cnpj: thirdCompany.cnpj, legalName: thirdCompany.legalName,
      roles: ['RECIPIENT'] as const, documentCount: 1 }]
    expect(pendingCompanyRegistrations([exception], candidates, [recipient, issuer], {}, recipient.cnpj)).toEqual(candidates)
  })
})
