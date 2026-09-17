import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import {
  INGESTION_DIAGNOSTIC_CATALOG,
  NfeParseError,
  XmlSecurityError,
  analyzeNfeXml,
  decideProcessing,
  normalizeNfeXml,
  parseNfeXml,
  validateNfeSchema,
} from '../src'

const fixtureUrl = new URL('./fixtures/nfe-proc-minima.xml', import.meta.url)

async function fixture(): Promise<string> {
  return readFile(fixtureUrl, 'utf8')
}

describe('parseNfeXml', () => {
  it('extrai a identificação sem converter códigos com zeros à esquerda', async () => {
    const result = parseNfeXml(await fixture())

    expect(result).toEqual({
      documentType: 'NFE',
      envelope: 'NFE_PROC',
      schemaVersion: '4.00',
      accessKey: '35260912345678000195550010000000011000000010',
      model: '55',
      number: '1',
      series: '1',
      issuerCnpj: '12345678000195',
      recipientCnpj: '00000000000191',
      itemCount: 1,
    })
  })

  it('recusa DTD antes do parsing', () => {
    const malicious = '<!DOCTYPE NFe [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><NFe>&xxe;</NFe>'

    expect(() => parseNfeXml(malicious)).toThrowError(XmlSecurityError)
    expect(() => parseNfeXml(malicious)).toThrowError(/DTD e entidades XML/)
  })

  it('diferencia XML malformado de informação fiscal ausente', () => {
    expect(() => parseNfeXml('<NFe>')).toThrowError(NfeParseError)
    expect(() =>
      parseNfeXml('<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><foo/></NFe>'),
    ).toThrowError(
      /infNFe não foi encontrado/,
    )
  })

  it('recusa leiaute e modelo fora do escopo do MVP', async () => {
    const xml = await fixture()

    expect(() => parseNfeXml(xml.replaceAll('versao="4.00"', 'versao="3.10"'))).toThrowError(
      /Leiaute 3.10 não suportado/,
    )
    expect(() => parseNfeXml(xml.replace('<mod>55</mod>', '<mod>57</mod>'))).toThrowError(
      /Modelo 57 não suportado/,
    )
  })
})

describe('validateNfeSchema', () => {
  it('valida um nfeProc 4.00 contra o catálogo oficial offline', async () => {
    const result = await validateNfeSchema(await fixture(), { fileName: 'nfe-proc-minima.xml' })

    expect(result.valid, result.errors.map((error) => error.rawMessage).join('\n')).toBe(true)
    expect(result.schemaRelease).toBe('PL_010f_v1.04')
  })

  it('retorna os erros XSD sem impedir a extração tolerante', async () => {
    const xml = (await fixture()).replace('<NCM>22021000</NCM>', '<NCM>INVALIDO</NCM>')

    const parsed = parseNfeXml(xml)
    const validation = await validateNfeSchema(xml)

    expect(parsed.accessKey).toHaveLength(44)
    expect(validation.valid).toBe(false)
    expect(validation.errors.length).toBeGreaterThan(0)
  })
})

describe('catálogo de severidades', () => {
  it('processa documento válido com o aviso obrigatório da assinatura', async () => {
    const result = await analyzeNfeXml(await fixture())

    expect(result.decision).toBe('PROCESSAR')
    expect(result.document?.accessKey).toHaveLength(44)
    expect(result.normalizedDocument?.items[0]?.supplierProductCode).toBe('0001')
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        code: 'ASSINATURA_NAO_VERIFICADA',
        severity: 'AVISO',
      }),
    ])
  })

  it('trata valor fiscal inválido como informação faltante e processamento parcial', async () => {
    const xml = (await fixture()).replace('<NCM>22021000</NCM>', '<NCM>INVALIDO</NCM>')
    const result = await analyzeNfeXml(xml)

    expect(result.decision).toBe('PROCESSAR_PARCIALMENTE')
    expect(result.document).toBeDefined()
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'XSD_VALOR_INVALIDO',
          severity: 'INFORMACAO_FALTANTE',
        }),
      ]),
    )
  })

  it('rejeita XML inseguro, malformado ou fora do escopo', async () => {
    const unsafe = await analyzeNfeXml('<!DOCTYPE NFe><NFe/>')
    const malformed = await analyzeNfeXml('<NFe>')
    const unsupported = await analyzeNfeXml(
      (await fixture()).replaceAll('versao="4.00"', 'versao="3.10"'),
    )

    expect(unsafe).toMatchObject({ decision: 'REJEITAR' })
    expect(unsafe.diagnostics[0]).toMatchObject({ code: 'XML_CONTEUDO_INSEGURO' })
    expect(malformed.diagnostics[0]).toMatchObject({ code: 'XML_MALFORMADO' })
    expect(unsupported.diagnostics[0]).toMatchObject({ code: 'VERSAO_NAO_SUPORTADA' })
  })

  it('mantém catálogo e decisão sem estados implícitos', () => {
    expect(Object.values(INGESTION_DIAGNOSTIC_CATALOG)).toHaveLength(10)
    expect(decideProcessing([])).toBe('PROCESSAR')
  })
})

describe('normalizeNfeXml', () => {
  it('normaliza nota, participante, item e totais sem converter decimais em number', async () => {
    const result = normalizeNfeXml(await fixture())

    expect(result).toMatchObject({
      kind: 'NFE',
      layoutVersion: '4.00',
      model: '55',
      accessKey: '35260912345678000195550010000000011000000010',
      issuedAt: '2026-09-15T12:00:00-03:00',
      issuer: {
        taxId: '12345678000195',
        taxIdType: 'CNPJ',
        state: 'SP',
        taxRegimeCode: '3',
      },
      recipient: { taxId: '00000000000191', taxIdType: 'CNPJ', state: 'SP' },
      declaredTotals: { productAmount: '100.00', documentAmount: '100.00' },
      source: { format: 'NFE_XML_4_00', xmlPath: 'NFe.infNFe' },
    })
    expect(result.items).toEqual([
      expect.objectContaining({
        itemNumber: '1',
        supplierProductCode: '0001',
        ncm: '22021000',
        cfop: '5102',
        commercialQuantity: '1.0000',
        commercialUnitAmount: '100.0000000000',
        productAmount: '100.00',
        includedInDocumentTotal: true,
        source: { format: 'NFE_XML_4_00', xmlPath: 'NFe.infNFe.det[1]' },
      }),
    ])
    expect(typeof result.items[0]?.commercialUnitAmount).toBe('string')
  })

  it('normaliza ICMS próprio, ST, FCP e DIFAL declarados quando presentes', async () => {
    const xml = (await fixture()).replace(
      '<imposto/>',
      `<imposto>
        <ICMS><ICMS00><orig>0</orig><CST>00</CST><modBC>3</modBC><vBC>100.00</vBC><pICMS>18.0000</pICMS><vICMS>18.00</vICMS><pFCP>2.0000</pFCP><vFCP>2.00</vFCP></ICMS00></ICMS>
        <ICMSUFDest><vBCUFDest>100.00</vBCUFDest><pFCPUFDest>2.0000</pFCPUFDest><pICMSUFDest>18.0000</pICMSUFDest><pICMSInter>12.00</pICMSInter><pICMSInterPart>100.0000</pICMSInterPart><vFCPUFDest>2.00</vFCPUFDest><vICMSUFDest>6.00</vICMSUFDest><vICMSUFRemet>0.00</vICMSUFRemet></ICMSUFDest>
      </imposto>`,
    )
    const icms = normalizeNfeXml(xml).items[0]?.declaredIcms

    expect(icms).toMatchObject({
      group: 'ICMS00',
      originCode: '0',
      cst: '00',
      baseAmount: '100.00',
      rate: '18.0000',
      amount: '18.00',
      fcpRate: '2.0000',
      fcpAmount: '2.00',
      destinationBaseAmount: '100.00',
      destinationInternalRate: '18.0000',
      interstateRate: '12.00',
      destinationAmount: '6.00',
    })
  })
})
