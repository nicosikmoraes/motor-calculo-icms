import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { NfeXmlFixtureBuilder } from './support/nfe-xml-fixture-builder'
import { parseDocumentArtifactXml } from '../src/document-artifacts'
import { validateDocumentArtifactSchema } from '../src/artifact-schema-validator'
const key = '41260112345678000190550010000000011000000010'
const ns = 'http://www.portalfiscal.inf.br/nfe'
const protocol = `<protNFe xmlns="${ns}" versao="4.00"><infProt><tpAmb>2</tpAmb><verAplic>teste</verAplic><chNFe>${key}</chNFe><dhRecbto>2026-01-01T12:00:00-03:00</dhRecbto><nProt>141260000000001</nProt><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe>`
async function analyze(xml: string) { return validateDocumentArtifactSchema(xml, parseDocumentArtifactXml(xml)) }
const event = (type = '110111', detail = '<descEvento>Cancelamento</descEvento><nProt>141260000000001</nProt><xJust>Cancelamento de nota emitida indevidamente</xJust>') => `<evento xmlns="${ns}" versao="1.00"><infEvento Id="ID${type}${key}01"><cOrgao>41</cOrgao><tpAmb>2</tpAmb><CNPJ>12345678000190</CNPJ><chNFe>${key}</chNFe><dhEvento>2026-01-01T12:00:00-03:00</dhEvento><tpEvento>${type}</tpEvento><nSeqEvento>1</nSeqEvento><verEvento>1.00</verEvento><detEvento versao="1.00">${detail}</detEvento></infEvento></evento>`
describe('XSD offline de artefatos', () => {
  it('confere integridade de todos os schemas usados no catálogo', async () => {
    const manifest = JSON.parse(await readFile(new URL('../schemas/artifacts/sha256.json', import.meta.url), 'utf8')) as Record<string, string>
    for (const [path, hash] of Object.entries(manifest)) {
      const contents = await readFile(new URL('../'+path, import.meta.url))
      expect(createHash('sha256').update(contents).digest('hex')).toBe(hash)
    }
  })
  it('aceita cancelamento completo e protocolo embutido com namespace herdado', async () => {
    const note = new NfeXmlFixtureBuilder().build()
    const signature = note.match(/<Signature[\s\S]*?<\/Signature>/)![0]
    expect(await analyze(event().replace('</evento>', signature+'</evento>'))).toEqual([])
    expect(await analyze(note)).toEqual([])
    const invalid = note.replace('<verAplic>TESTE</verAplic>', '')
    expect(await analyze(invalid)).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'ARTEFATO_XSD_INVALIDO' })]))
  })
  it('aceita protocolo completo pelo tipo oficial', async () => { expect(await analyze(protocol)).toEqual([]) })
  it.each([
    protocol.replace('<tpAmb>2</tpAmb>', '<tpAmb>9</tpAmb>'),
    protocol.replace('<verAplic>teste</verAplic>', ''),
    protocol.replace(ns, 'urn:incorreto'),
    protocol.replace('2026-01-01T12:00:00-03:00', 'ontem'),
  ])('diagnostica valor, campo, namespace ou data inválida', async (xml) => {
    expect(await analyze(xml)).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'ARTEFATO_XSD_INVALIDO' })]))
  })
  it('valida detalhes do cancelamento mesmo quando o envelope já tem erro', async () => {
    const issues = await analyze(event('110111', '<descEvento>Cancelamento</descEvento><xJust>curta</xJust>'))
    expect(issues.some(({ message }) => message.includes('e110111_v1.00.xsd'))).toBe(true)
  })
  it('valida detalhes da carta de correção', async () => {
    const issues = await analyze(event('110110', '<descEvento>Carta de Correcao</descEvento><xCorrecao>curta</xCorrecao>'))
    expect(issues.some(({ message }) => message.includes('e110110_v1.00.xsd'))).toBe(true)
  })
  it('não declara cobertura específica para evento fora do catálogo', async () => {
    expect(await analyze(event('999999'))).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'EVENTO_XSD_ESPECIFICO_NAO_DISPONIVEL' }),
    ]))
  })
  it('valida também o retorno do evento processado', async () => {
    const xml = `<procEventoNFe xmlns="${ns}" versao="1.00">${event()}<retEvento versao="1.00"><infEvento><chNFe>${key}</chNFe><tpEvento>110111</tpEvento><nSeqEvento>1</nSeqEvento></infEvento></retEvento></procEventoNFe>`
    expect((await analyze(xml)).some(({ message }) => message.includes('procEventoNFe_v1.00.xsd'))).toBe(true)
  })
  it('mantém proteção contra DTD antes de validar', async () => {
    await expect(validateDocumentArtifactSchema('<!DOCTYPE protNFe>'+protocol, parseDocumentArtifactXml(protocol))).rejects.toThrow(/DTD/)
  })
})
