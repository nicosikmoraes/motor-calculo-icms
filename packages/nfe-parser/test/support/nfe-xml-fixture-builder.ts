export interface SyntheticIcms {
  originCode: string
  cst: string
  baseMode: string
  baseAmount: string
  rate: string
  amount: string
  fcpRate?: string
  fcpAmount?: string
}

export interface SyntheticNfeItem {
  supplierProductCode: string
  description: string
  ncm: string
  cfop: string
  commercialUnit: string
  commercialQuantity: string
  commercialUnitAmount: string
  productAmount: string
  icms?: SyntheticIcms
}

export type OmissibleNfeField =
  | 'ISSUER_TAX_ID'
  | 'RECIPIENT'
  | 'NCM'
  | 'CFOP'
  | 'ITEM_TAX'
  | 'TOTALS'

interface FixtureState {
  model: '55' | '65'
  accessKey: string
  number: string
  series: string
  issuedAt: string
  issuerTaxId: string
  recipientTaxId: string
  items: SyntheticNfeItem[]
  omitted: Set<OmissibleNfeField>
  includeDoctype: boolean
}

const DEFAULT_ITEM: SyntheticNfeItem = {
  supplierProductCode: '0001',
  description: 'PRODUTO SINTETICO PARA TESTE',
  ncm: '22021000',
  cfop: '5102',
  commercialUnit: 'UN',
  commercialQuantity: '1.0000',
  commercialUnitAmount: '100.0000000000',
  productAmount: '100.00',
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function element(name: string, value: string | undefined): string {
  return value === undefined ? '' : `<${name}>${escapeXml(value)}</${name}>`
}

function sumDecimalTexts(values: readonly string[]): string {
  const cents = values.reduce((sum, value) => sum + BigInt(value.replace('.', '')), 0n)
  return `${cents / 100n}.${String(cents % 100n).padStart(2, '0')}`
}

function renderIcms(icms: SyntheticIcms | undefined): string {
  if (!icms) return '<imposto/>'
  return `<imposto><ICMS><ICMS00>${element('orig', icms.originCode)}${element('CST', icms.cst)}${element('modBC', icms.baseMode)}${element('vBC', icms.baseAmount)}${element('pICMS', icms.rate)}${element('vICMS', icms.amount)}${element('pFCP', icms.fcpRate)}${element('vFCP', icms.fcpAmount)}</ICMS00></ICMS></imposto>`
}

function renderItem(
  item: SyntheticNfeItem,
  index: number,
  omitted: ReadonlySet<OmissibleNfeField>,
): string {
  return `<det nItem="${index + 1}"><prod>${element('cProd', item.supplierProductCode)}<cEAN>SEM GTIN</cEAN>${element('xProd', item.description)}${omitted.has('NCM') ? '' : element('NCM', item.ncm)}${omitted.has('CFOP') ? '' : element('CFOP', item.cfop)}${element('uCom', item.commercialUnit)}${element('qCom', item.commercialQuantity)}${element('vUnCom', item.commercialUnitAmount)}${element('vProd', item.productAmount)}<cEANTrib>SEM GTIN</cEANTrib>${element('uTrib', item.commercialUnit)}${element('qTrib', item.commercialQuantity)}${element('vUnTrib', item.commercialUnitAmount)}<indTot>1</indTot></prod>${omitted.has('ITEM_TAX') ? '' : renderIcms(item.icms)}</det>`
}

function withModelInAccessKey(accessKey: string, model: '55' | '65'): string {
  return `${accessKey.slice(0, 20)}${model}${accessKey.slice(22)}`
}

/**
 * Builder exclusivo de testes. Os padrões são estáveis e não contêm dados reais.
 * Variações inválidas são deliberadas para exercitar a fronteira de ingestão.
 */
export class NfeXmlFixtureBuilder {
  private readonly state: FixtureState

  constructor(state?: Partial<Omit<FixtureState, 'omitted' | 'items'>> & {
    omitted?: Iterable<OmissibleNfeField>
    items?: readonly SyntheticNfeItem[]
  }) {
    this.state = {
      model: state?.model ?? '55',
      accessKey: state?.accessKey ?? '35260912345678000195550010000000011000000010',
      number: state?.number ?? '1',
      series: state?.series ?? '1',
      issuedAt: state?.issuedAt ?? '2026-09-15T12:00:00-03:00',
      issuerTaxId: state?.issuerTaxId ?? '12345678000195',
      recipientTaxId: state?.recipientTaxId ?? '00000000000191',
      items: state?.items?.map((item) => ({ ...item })) ?? [{ ...DEFAULT_ITEM }],
      omitted: new Set(state?.omitted),
      includeDoctype: state?.includeDoctype ?? false,
    }
  }

  private copy(change: Partial<FixtureState>): NfeXmlFixtureBuilder {
    return new NfeXmlFixtureBuilder({
      ...this.state,
      ...change,
      items: change.items ?? this.state.items,
      omitted: change.omitted ?? this.state.omitted,
    })
  }

  withModel(model: '55' | '65'): NfeXmlFixtureBuilder {
    return this.copy({ model, accessKey: withModelInAccessKey(this.state.accessKey, model) })
  }

  withDocumentIdentity(values: {
    accessKey?: string
    number?: string
    series?: string
    issuedAt?: string
  }): NfeXmlFixtureBuilder {
    return this.copy(values)
  }

  withItem(overrides: Partial<SyntheticNfeItem>, index = 0): NfeXmlFixtureBuilder {
    const items = this.state.items.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...overrides } : { ...item },
    )
    if (!items[index]) throw new RangeError(`Item sintético inexistente: ${index}.`)
    return this.copy({ items })
  }

  addItem(overrides: Partial<SyntheticNfeItem> = {}): NfeXmlFixtureBuilder {
    return this.copy({ items: [...this.state.items, { ...DEFAULT_ITEM, ...overrides }] })
  }

  omit(field: OmissibleNfeField): NfeXmlFixtureBuilder {
    return this.copy({ omitted: new Set([...this.state.omitted, field]) })
  }

  withDoctype(): NfeXmlFixtureBuilder {
    return this.copy({ includeDoctype: true })
  }

  build(): string {
    const state = this.state
    const accessKey = withModelInAccessKey(state.accessKey, state.model)
    const productAmount = sumDecimalTexts(state.items.map((item) => item.productAmount))
    const items = state.items.map((item, index) => renderItem(item, index, state.omitted)).join('')
    const totals = state.omitted.has('TOTALS')
      ? ''
      : `<total><ICMSTot><vBC>0.00</vBC><vICMS>0.00</vICMS><vICMSDeson>0.00</vICMSDeson><vFCP>0.00</vFCP><vBCST>0.00</vBCST><vST>0.00</vST><vFCPST>0.00</vFCPST><vFCPSTRet>0.00</vFCPSTRet><vProd>${productAmount}</vProd><vFrete>0.00</vFrete><vSeg>0.00</vSeg><vDesc>0.00</vDesc><vII>0.00</vII><vIPI>0.00</vIPI><vIPIDevol>0.00</vIPIDevol><vPIS>0.00</vPIS><vCOFINS>0.00</vCOFINS><vOutro>0.00</vOutro><vNF>${productAmount}</vNF></ICMSTot></total>`
    const recipient = state.omitted.has('RECIPIENT')
      ? ''
      : `<dest>${element('CNPJ', state.recipientTaxId)}<xNome>DESTINATARIO SINTETICO</xNome><enderDest><xLgr>AVENIDA DE TESTE</xLgr><nro>200</nro><xBairro>CENTRO</xBairro><cMun>3550308</cMun><xMun>SAO PAULO</xMun><UF>SP</UF><CEP>01002000</CEP><cPais>1058</cPais><xPais>BRASIL</xPais></enderDest><indIEDest>9</indIEDest></dest>`
    const doctype = state.includeDoctype ? '<!DOCTYPE nfeProc>' : ''

    return `<?xml version="1.0" encoding="UTF-8"?>${doctype}<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe${accessKey}" versao="4.00"><ide><cUF>35</cUF><cNF>00000001</cNF><natOp>VENDA DE MERCADORIA</natOp><mod>${state.model}</mod><serie>${escapeXml(state.series)}</serie><nNF>${escapeXml(state.number)}</nNF><dhEmi>${escapeXml(state.issuedAt)}</dhEmi><tpNF>1</tpNF><idDest>1</idDest><cMunFG>3550308</cMunFG><tpImp>${state.model === '65' ? '4' : '1'}</tpImp><tpEmis>1</tpEmis><cDV>0</cDV><tpAmb>2</tpAmb><finNFe>1</finNFe><indFinal>1</indFinal><indPres>1</indPres><procEmi>0</procEmi><verProc>FIXTURE-BUILDER</verProc></ide><emit>${state.omitted.has('ISSUER_TAX_ID') ? '' : element('CNPJ', state.issuerTaxId)}<xNome>EMPRESA EMITENTE SINTETICA</xNome><enderEmit><xLgr>RUA DE TESTE</xLgr><nro>100</nro><xBairro>CENTRO</xBairro><cMun>3550308</cMun><xMun>SAO PAULO</xMun><UF>SP</UF><CEP>01001000</CEP><cPais>1058</cPais><xPais>BRASIL</xPais></enderEmit><IE>110042490114</IE><CRT>3</CRT></emit>${recipient}${items}${totals}<transp><modFrete>9</modFrete></transp><pag><detPag><tPag>01</tPag><vPag>${productAmount}</vPag></detPag></pag></infNFe><Signature xmlns="http://www.w3.org/2000/09/xmldsig#"><SignedInfo><CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/><SignatureMethod Algorithm="http://www.w3.org/2000/09/xmldsig#rsa-sha1"/><Reference URI="#NFe${accessKey}"><Transforms><Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"/><Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"/></Transforms><DigestMethod Algorithm="http://www.w3.org/2000/09/xmldsig#sha1"/><DigestValue>AA==</DigestValue></Reference></SignedInfo><SignatureValue>AA==</SignatureValue><KeyInfo><X509Data><X509Certificate>AA==</X509Certificate></X509Data></KeyInfo></Signature></NFe><protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><verAplic>TESTE</verAplic><chNFe>${accessKey}</chNFe><dhRecbto>2026-09-15T12:01:00-03:00</dhRecbto><nProt>135260000000001</nProt><digVal>AA==</digVal><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe></nfeProc>`
  }
}

export function syntheticNfeXml(): NfeXmlFixtureBuilder {
  return new NfeXmlFixtureBuilder()
}
