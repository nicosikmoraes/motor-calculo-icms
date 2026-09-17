import { describe, expect, it } from 'vitest'
import { analyzeNfeXml, normalizeNfeXml, validateNfeSchema } from '../src'
import { syntheticNfeXml } from './support/nfe-xml-fixture-builder'

describe('NfeXmlFixtureBuilder', () => {
  it('gera uma NF-e 4.00 mínima aceita pelo schema oficial', async () => {
    const xml = syntheticNfeXml().build()
    const validation = await validateNfeSchema(xml, { fileName: 'builder-nfe.xml' })

    expect(validation.valid, validation.errors.map((error) => error.rawMessage).join('\n')).toBe(true)
    expect(normalizeNfeXml(xml)).toMatchObject({
      model: '55',
      number: '1',
      issuer: { taxId: '12345678000195' },
      items: [{ supplierProductCode: '0001', productAmount: '100.00' }],
      declaredTotals: { productAmount: '100.00', documentAmount: '100.00' },
    })
  })

  it('cria NFC-e com múltiplos itens e total determinístico', async () => {
    const xml = syntheticNfeXml()
      .withModel('65')
      .withItem({ productAmount: '100.00' })
      .addItem({ supplierProductCode: '0002', productAmount: '25.50' })
      .build()
    const result = normalizeNfeXml(xml)
    const validation = await validateNfeSchema(xml, { fileName: 'builder-nfce.xml' })

    expect(validation.valid, validation.errors.map((error) => error.rawMessage).join('\n')).toBe(true)
    expect(result.model).toBe('65')
    expect(result.accessKey.slice(20, 22)).toBe('65')
    expect(result.items.map((item) => item.itemNumber)).toEqual(['1', '2'])
    expect(result.declaredTotals.documentAmount).toBe('125.50')
  })

  it('gera ICMS declarado sem perder escala decimal', () => {
    const xml = syntheticNfeXml()
      .withItem({
        icms: {
          originCode: '0',
          cst: '00',
          baseMode: '3',
          baseAmount: '100.00',
          rate: '18.0000',
          amount: '18.00',
        },
      })
      .build()

    expect(normalizeNfeXml(xml).items[0]?.declaredIcms).toMatchObject({
      group: 'ICMS00',
      cst: '00',
      rate: '18.0000',
      amount: '18.00',
    })
  })

  it('produz variações controladas para pendência e segurança', async () => {
    const missingNcm = await analyzeNfeXml(syntheticNfeXml().omit('NCM').build())
    const unsafe = await analyzeNfeXml(syntheticNfeXml().withDoctype().build())

    expect(missingNcm.decision).toBe('PROCESSAR_PARCIALMENTE')
    expect(missingNcm.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: 'INFORMACAO_FALTANTE' }),
      ]),
    )
    expect(unsafe).toMatchObject({ decision: 'REJEITAR' })
    expect(unsafe.diagnostics[0]).toMatchObject({ code: 'XML_CONTEUDO_INSEGURO' })
  })

  it('escapa valores fornecidos pelo teste em vez de injetar marcação XML', () => {
    const xml = syntheticNfeXml()
      .withItem({ description: 'PRODUTO <TESTE> & "SEGURO"' })
      .build()

    expect(xml).toContain('PRODUTO &lt;TESTE&gt; &amp; &quot;SEGURO&quot;')
    expect(normalizeNfeXml(xml).items[0]?.description).toBe('PRODUTO <TESTE> & "SEGURO"')
  })
})
