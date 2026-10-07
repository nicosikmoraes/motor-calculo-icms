import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseDocumentArtifactXml } from '../src/document-artifacts'

const key = '1'.repeat(44)
const event = `<evento versao="1.00"><infEvento><tpAmb>2</tpAmb><chNFe>${key}</chNFe><dhEvento>2026-09-15T12:00:00-03:00</dhEvento><tpEvento>110111</tpEvento><nSeqEvento>1</nSeqEvento><detEvento><xJust>Teste</xJust></detEvento></infEvento></evento>`
const response = `<retEvento versao="1.00"><infEvento><tpAmb>2</tpAmb><chNFe>${key}</chNFe><tpEvento>110111</tpEvento><nSeqEvento>1</nSeqEvento><cStat>135</cStat><xMotivo>Evento registrado</xMotivo><nProt>135260000000001</nProt></infEvento></retEvento>`

describe('protocolos e eventos XML', () => {
  it('extrai o protocolo embutido em nfeProc sem alterar a nota', () => {
    const xml = readFileSync(new URL('./fixtures/nfe-proc-minima.xml', import.meta.url), 'utf8')
    const parsed = parseDocumentArtifactXml(xml)
    expect(parsed.kind).toBe('NFE')
    if (parsed.kind === 'NFE') expect(parsed.embeddedProtocol).toMatchObject({
      kind: 'PROTOCOL', envelope: 'NFE_PROC', accessKey: parsed.note.accessKey,
      version: '4.00', statusCode: '100',
    })
  })
  it('lê protocolo avulso e evento com retorno correspondente', () => {
    expect(parseDocumentArtifactXml(`<protNFe versao="4.00"><infProt><chNFe>${key}</chNFe><cStat>100</cStat></infProt></protNFe>`))
      .toMatchObject({ kind: 'PROTOCOL', artifact: { accessKey: key, statusCode: '100' } })
    expect(parseDocumentArtifactXml(`<procEventoNFe versao="1.00">${event}${response}</procEventoNFe>`))
      .toMatchObject({ kind: 'EVENT', artifact: { accessKey: key, eventType: '110111', sequence: '1',
        statusCode: '135', responseMatches: true, justification: 'Teste' } })
  })
  it('preserva evento sem retorno e marca retorno incompatível', () => {
    expect(parseDocumentArtifactXml(event)).toMatchObject({ kind: 'EVENT', artifact: { envelope: 'EVENTO' } })
    const inconsistent = response.replace('<nSeqEvento>1</nSeqEvento>', '<nSeqEvento>2</nSeqEvento>')
    expect(parseDocumentArtifactXml(`<procEventoNFe versao="1.00">${event}${inconsistent}</procEventoNFe>`))
      .toMatchObject({ kind: 'EVENT', artifact: { responseMatches: false } })
  })
  it('recusa versão não suportada e DTD', () => {
    expect(() => parseDocumentArtifactXml(event.replace('versao="1.00"', 'versao="2.00"'))).toThrow(/Versão 2.00/)
    expect(() => parseDocumentArtifactXml(`<!DOCTYPE evento>${event}`)).toThrow(/DTD/)
  })
  it('não aceita retorno de outro ambiente nem retorno sem ambiente', () => {
    for (const different of [response.replace('<tpAmb>2</tpAmb>', '<tpAmb>1</tpAmb>'), response.replace('<tpAmb>2</tpAmb>', '')]) {
      expect(parseDocumentArtifactXml(`<procEventoNFe versao="1.00">${event}${different}</procEventoNFe>`))
        .toMatchObject({ kind: 'EVENT', artifact: { responseMatches: false } })
    }
  })
})
