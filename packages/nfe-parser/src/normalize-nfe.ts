import type {
  NormalizedDeclaredIcms,
  NormalizedNfe,
  NormalizedNfeItem,
  NormalizedNfeTotals,
  NormalizedParty,
} from '@motor/domain'
import {
  NfeParseError,
  asObject,
  asString,
  readNfeXmlStructure,
  requiredString,
  type NfeXmlStructure,
  type XmlObject,
} from './nfe-parser'

function optionalFields<T extends object>(
  fields: { [Key in keyof T]?: T[Key] | undefined },
): Partial<T> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as Partial<T>
}

function party(node: XmlObject | undefined, addressKey: string): NormalizedParty | undefined {
  if (!node) return undefined
  const address = asObject(node[addressKey])
  const cnpj = asString(node.CNPJ)
  const cpf = asString(node.CPF)

  return optionalFields<NormalizedParty>({
    taxId: cnpj ?? cpf,
    taxIdType: cnpj ? 'CNPJ' : cpf ? 'CPF' : undefined,
    name: asString(node.xNome),
    stateRegistration: asString(node.IE),
    state: address ? asString(address.UF) : undefined,
    taxRegimeCode: asString(node.CRT),
  })
}

function firstObjectChild(node: XmlObject | undefined): [string, XmlObject] | undefined {
  if (!node) return undefined
  for (const [name, value] of Object.entries(node)) {
    const object = asObject(value)
    if (object) return [name, object]
  }
  return undefined
}

function declaredIcms(tax: XmlObject | undefined): NormalizedDeclaredIcms | undefined {
  const icmsContainer = asObject(tax?.ICMS)
  const selected = firstObjectChild(icmsContainer)
  const destination = asObject(tax?.ICMSUFDest)
  if (!selected && !destination) return undefined

  const [group, icms] = selected ?? ['', {}]
  return optionalFields<NormalizedDeclaredIcms>({
    group: group || undefined,
    originCode: asString(icms.orig),
    cst: asString(icms.CST),
    csosn: asString(icms.CSOSN),
    baseMode: asString(icms.modBC),
    baseReductionPercent: asString(icms.pRedBC),
    baseAmount: asString(icms.vBC),
    rate: asString(icms.pICMS),
    amount: asString(icms.vICMS),
    stBaseMode: asString(icms.modBCST),
    stMarginPercent: asString(icms.pMVAST),
    stBaseReductionPercent: asString(icms.pRedBCST),
    stBaseAmount: asString(icms.vBCST),
    stRate: asString(icms.pICMSST),
    stAmount: asString(icms.vICMSST),
    fcpRate: asString(icms.pFCP),
    fcpAmount: asString(icms.vFCP),
    fcpStRate: asString(icms.pFCPST),
    fcpStAmount: asString(icms.vFCPST),
    destinationBaseAmount: asString(destination?.vBCUFDest),
    destinationFcpRate: asString(destination?.pFCPUFDest),
    destinationFcpAmount: asString(destination?.vFCPUFDest),
    interstateRate: asString(destination?.pICMSInter),
    destinationInternalRate: asString(destination?.pICMSUFDest),
    destinationSharePercent: asString(destination?.pICMSInterPart),
    destinationAmount: asString(destination?.vICMSUFDest),
    originAmount: asString(destination?.vICMSUFRemet),
  })
}

function item(det: XmlObject, index: number): NormalizedNfeItem {
  const product = asObject(det.prod)
  const tax = asObject(det.imposto)
  const itemNumber = asString(det['@_nItem']) ?? String(index + 1)

  return {
    itemNumber,
    ...optionalFields<NormalizedNfeItem>({
      supplierProductCode: asString(product?.cProd),
      description: asString(product?.xProd),
      ncm: asString(product?.NCM),
      cest: asString(product?.CEST),
      cfop: asString(product?.CFOP),
      commercialUnit: asString(product?.uCom),
      commercialQuantity: asString(product?.qCom),
      commercialUnitAmount: asString(product?.vUnCom),
      productAmount: asString(product?.vProd),
      tributaryUnit: asString(product?.uTrib),
      tributaryQuantity: asString(product?.qTrib),
      tributaryUnitAmount: asString(product?.vUnTrib),
      freightAmount: asString(product?.vFrete),
      insuranceAmount: asString(product?.vSeg),
      discountAmount: asString(product?.vDesc),
      otherAmount: asString(product?.vOutro),
      ipiAmount: asString(asObject(asObject(tax?.IPI)?.IPITrib)?.vIPI),
      includedInDocumentTotal:
        asString(product?.indTot) === undefined ? undefined : asString(product?.indTot) === '1',
      declaredIcms: declaredIcms(tax),
    }),
    source: { format: 'NFE_XML_4_00', xmlPath: `NFe.infNFe.det[${index + 1}]` },
  }
}

function totals(info: XmlObject): NormalizedNfeTotals {
  const value = asObject(asObject(info.total)?.ICMSTot)
  return optionalFields<NormalizedNfeTotals>({
    icmsBaseAmount: asString(value?.vBC),
    icmsAmount: asString(value?.vICMS),
    icmsExemptAmount: asString(value?.vICMSDeson),
    fcpAmount: asString(value?.vFCP),
    stBaseAmount: asString(value?.vBCST),
    stAmount: asString(value?.vST),
    fcpStAmount: asString(value?.vFCPST),
    productAmount: asString(value?.vProd),
    freightAmount: asString(value?.vFrete),
    insuranceAmount: asString(value?.vSeg),
    discountAmount: asString(value?.vDesc),
    importTaxAmount: asString(value?.vII),
    ipiAmount: asString(value?.vIPI),
    returnedIpiAmount: asString(value?.vIPIDevol),
    pisAmount: asString(value?.vPIS),
    cofinsAmount: asString(value?.vCOFINS),
    otherAmount: asString(value?.vOutro),
    documentAmount: asString(value?.vNF),
  })
}

/** @internal Converte a árvore intermediária no contrato independente do parser. */
export function normalizeNfeStructure({ info }: NfeXmlStructure): NormalizedNfe {
  const version = requiredString(info, '@_versao')
  if (version !== '4.00') {
    throw new NfeParseError(
      'UNSUPPORTED_LAYOUT_VERSION',
      `Leiaute ${version} não suportado; o MVP aceita apenas 4.00.`,
    )
  }

  const ide = asObject(info.ide)
  if (!ide) throw new NfeParseError('MISSING_NFE_INFO', 'O grupo ide não foi encontrado.')
  const model = requiredString(ide, 'mod')
  if (model !== '55' && model !== '65') {
    throw new NfeParseError(
      'UNSUPPORTED_DOCUMENT_MODEL',
      `Modelo ${model} não suportado; o MVP aceita apenas 55 e 65.`,
    )
  }

  const id = requiredString(info, '@_Id')
  const details = Array.isArray(info.det) ? info.det : info.det ? [info.det] : []
  const issuer = party(asObject(info.emit), 'enderEmit')
  if (!issuer) throw new NfeParseError('MISSING_NFE_INFO', 'O grupo emit não foi encontrado.')

  return {
    kind: 'NFE',
    layoutVersion: '4.00',
    model,
    accessKey: id.startsWith('NFe') ? id.slice(3) : id,
    number: requiredString(ide, 'nNF'),
    series: requiredString(ide, 'serie'),
    ...optionalFields<NormalizedNfe>({
      issuedAt: asString(ide.dhEmi) ?? asString(ide.dEmi),
      operationNature: asString(ide.natOp),
      operationDirection: asString(ide.tpNF),
      destinationIndicator: asString(ide.idDest),
      purposeCode: asString(ide.finNFe),
      environmentCode: asString(ide.tpAmb),
      finalConsumerIndicator: asString(ide.indFinal),
      presenceIndicator: asString(ide.indPres),
      recipient: party(asObject(info.dest), 'enderDest'),
    }),
    issuer,
    items: details.flatMap((detail, index) => {
      const object = asObject(detail)
      return object ? [item(object, index)] : []
    }),
    declaredTotals: totals(info),
    source: { format: 'NFE_XML_4_00', xmlPath: 'NFe.infNFe' },
  }
}

export function normalizeNfeXml(xml: string): NormalizedNfe {
  return normalizeNfeStructure(readNfeXmlStructure(xml))
}
