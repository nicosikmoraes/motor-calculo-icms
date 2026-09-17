/** Texto decimal canônico vindo do XML. Nunca deve ser convertido para number. */
export type DecimalText = string

export interface NormalizedSource {
  format: 'NFE_XML_4_00'
  xmlPath: string
}

export interface NormalizedParty {
  taxId?: string
  taxIdType?: 'CNPJ' | 'CPF'
  name?: string
  stateRegistration?: string
  state?: string
  taxRegimeCode?: string
}

export interface NormalizedDeclaredIcms {
  group?: string
  originCode?: string
  cst?: string
  csosn?: string
  baseMode?: string
  baseReductionPercent?: DecimalText
  baseAmount?: DecimalText
  rate?: DecimalText
  amount?: DecimalText
  stBaseMode?: string
  stMarginPercent?: DecimalText
  stBaseReductionPercent?: DecimalText
  stBaseAmount?: DecimalText
  stRate?: DecimalText
  stAmount?: DecimalText
  fcpRate?: DecimalText
  fcpAmount?: DecimalText
  fcpStRate?: DecimalText
  fcpStAmount?: DecimalText
  destinationBaseAmount?: DecimalText
  destinationFcpRate?: DecimalText
  destinationFcpAmount?: DecimalText
  interstateRate?: DecimalText
  destinationInternalRate?: DecimalText
  destinationSharePercent?: DecimalText
  destinationAmount?: DecimalText
  originAmount?: DecimalText
}

export interface NormalizedNfeItem {
  itemNumber: string
  supplierProductCode?: string
  description?: string
  ncm?: string
  cest?: string
  cfop?: string
  commercialUnit?: string
  commercialQuantity?: DecimalText
  commercialUnitAmount?: DecimalText
  productAmount?: DecimalText
  tributaryUnit?: string
  tributaryQuantity?: DecimalText
  tributaryUnitAmount?: DecimalText
  freightAmount?: DecimalText
  insuranceAmount?: DecimalText
  discountAmount?: DecimalText
  otherAmount?: DecimalText
  includedInDocumentTotal?: boolean
  declaredIcms?: NormalizedDeclaredIcms
  source: NormalizedSource
}

export interface NormalizedNfeTotals {
  icmsBaseAmount?: DecimalText
  icmsAmount?: DecimalText
  icmsExemptAmount?: DecimalText
  fcpAmount?: DecimalText
  stBaseAmount?: DecimalText
  stAmount?: DecimalText
  fcpStAmount?: DecimalText
  productAmount?: DecimalText
  freightAmount?: DecimalText
  insuranceAmount?: DecimalText
  discountAmount?: DecimalText
  importTaxAmount?: DecimalText
  ipiAmount?: DecimalText
  returnedIpiAmount?: DecimalText
  pisAmount?: DecimalText
  cofinsAmount?: DecimalText
  otherAmount?: DecimalText
  documentAmount?: DecimalText
}

export interface NormalizedNfe {
  kind: 'NFE'
  layoutVersion: '4.00'
  model: '55' | '65'
  accessKey: string
  number: string
  series: string
  issuedAt?: string
  operationNature?: string
  operationDirection?: string
  destinationIndicator?: string
  purposeCode?: string
  environmentCode?: string
  finalConsumerIndicator?: string
  presenceIndicator?: string
  issuer: NormalizedParty
  recipient?: NormalizedParty
  items: readonly NormalizedNfeItem[]
  declaredTotals: NormalizedNfeTotals
  source: NormalizedSource
}
