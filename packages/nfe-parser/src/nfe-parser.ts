import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { assertSafeXml } from './xml-security'

export type XmlObject = Record<string, unknown>

export interface ParsedNfe {
  documentType: 'NFE' | 'NFCE'
  envelope: 'NFE' | 'NFE_PROC'
  schemaVersion: string
  accessKey: string
  model: '55' | '65'
  number: string
  series: string
  issuerCnpj?: string
  recipientCnpj?: string
  itemCount: number
}

export enum NfeParseErrorCode {
  XML_NOT_WELL_FORMED = 'XML_NOT_WELL_FORMED',
  UNSUPPORTED_XML_ROOT = 'UNSUPPORTED_XML_ROOT',
  UNSUPPORTED_LAYOUT_VERSION = 'UNSUPPORTED_LAYOUT_VERSION',
  MISSING_NFE_INFO = 'MISSING_NFE_INFO',
  UNSUPPORTED_DOCUMENT_MODEL = 'UNSUPPORTED_DOCUMENT_MODEL',
}

/** Mensagens do parser; parâmetros entre chaves são preenchidos na origem. */
export enum NfeParseErrorMessage {
  MISSING_FIELD = 'Campo obrigatório não encontrado: {field}.',
  MALFORMED_XML = 'XML malformado: {detail} (linha {line}).',
  UNSUPPORTED_ROOT = 'O XML não contém uma raiz NFe ou nfeProc suportada.',
  MISSING_INFO = 'O grupo infNFe não foi encontrado.',
  UNSUPPORTED_LAYOUT = 'Leiaute {version} não suportado; o MVP aceita apenas 4.00.',
  MISSING_IDE = 'O grupo ide não foi encontrado.',
  UNSUPPORTED_MODEL = 'Modelo {model} não suportado; o MVP aceita apenas 55 e 65.',
  MISSING_ISSUER = 'O grupo emit não foi encontrado.',
}

export function formatNfeParseErrorMessage(
  message: NfeParseErrorMessage,
  params: Readonly<Record<string, string | number>> = {},
): string {
  return message.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? `{${key}}`))
}

export class NfeParseError extends Error {
  constructor(readonly code: NfeParseErrorCode, message: string) {
    super(message)
    this.name = 'NfeParseError'
  }
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  removeNSPrefix: true,
  allowBooleanAttributes: false,
  // DTD e declarações ENTITY são recusados por assertSafeXml antes desta etapa.
  // As cinco entidades predefinidas do XML ainda precisam ser decodificadas.
  processEntities: true,
  isArray: (_tagName, jPath) =>
    typeof jPath === 'string' && jPath.endsWith('.infNFe.det'),
})

export function asObject(value: unknown): XmlObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as XmlObject)
    : undefined
}

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

export function requiredString(object: XmlObject, key: string): string {
  const value = asString(object[key])
  if (!value) {
    throw new NfeParseError(NfeParseErrorCode.MISSING_NFE_INFO, formatNfeParseErrorMessage(NfeParseErrorMessage.MISSING_FIELD, { field: key }))
  }
  return value
}

export interface NfeXmlStructure {
  processed?: XmlObject
  nfe: XmlObject
  info: XmlObject
}

/** @internal Árvore intermediária restrita à fronteira do parser. */
export function readNfeXmlStructure(xml: string): NfeXmlStructure {
  assertSafeXml(xml)

  const wellFormed = XMLValidator.validate(xml)
  if (wellFormed !== true) {
    throw new NfeParseError(
      NfeParseErrorCode.XML_NOT_WELL_FORMED,
      formatNfeParseErrorMessage(NfeParseErrorMessage.MALFORMED_XML, { detail: wellFormed.err.msg, line: wellFormed.err.line }),
    )
  }

  const document = asObject(parser.parse(xml))
  const processed = asObject(document?.nfeProc)
  const nfe = processed ? asObject(processed.NFe) : asObject(document?.NFe)

  if (!nfe) {
    throw new NfeParseError(
      NfeParseErrorCode.UNSUPPORTED_XML_ROOT,
      NfeParseErrorMessage.UNSUPPORTED_ROOT,
    )
  }

  const info = asObject(nfe.infNFe)
  if (!info) {
    throw new NfeParseError(NfeParseErrorCode.MISSING_NFE_INFO, NfeParseErrorMessage.MISSING_INFO)
  }

  return { ...(processed ? { processed } : {}), nfe, info }
}

/** @internal Converte a árvore intermediária na identificação resumida. */
export function parseNfeStructure({ processed, info }: NfeXmlStructure): ParsedNfe {
  const schemaVersion = requiredString(info, '@_versao')
  if (schemaVersion !== '4.00') {
    throw new NfeParseError(
      NfeParseErrorCode.UNSUPPORTED_LAYOUT_VERSION,
      formatNfeParseErrorMessage(NfeParseErrorMessage.UNSUPPORTED_LAYOUT, { version: schemaVersion }),
    )
  }

  const ide = asObject(info.ide)
  if (!ide) throw new NfeParseError(NfeParseErrorCode.MISSING_NFE_INFO, NfeParseErrorMessage.MISSING_IDE)

  const model = requiredString(ide, 'mod')
  if (model !== '55' && model !== '65') {
    throw new NfeParseError(
      NfeParseErrorCode.UNSUPPORTED_DOCUMENT_MODEL,
      formatNfeParseErrorMessage(NfeParseErrorMessage.UNSUPPORTED_MODEL, { model }),
    )
  }

  const issuer = asObject(info.emit)
  const recipient = asObject(info.dest)
  const details = Array.isArray(info.det) ? info.det : info.det ? [info.det] : []
  const id = requiredString(info, '@_Id')
  const issuerCnpj = issuer ? asString(issuer.CNPJ) : undefined
  const recipientCnpj = recipient ? asString(recipient.CNPJ) : undefined

  return {
    documentType: model === '55' ? 'NFE' : 'NFCE',
    envelope: processed ? 'NFE_PROC' : 'NFE',
    schemaVersion,
    accessKey: id.startsWith('NFe') ? id.slice(3) : id,
    model,
    number: requiredString(ide, 'nNF'),
    series: requiredString(ide, 'serie'),
    ...(issuerCnpj ? { issuerCnpj } : {}),
    ...(recipientCnpj ? { recipientCnpj } : {}),
    itemCount: details.length,
  }
}

export function parseNfeXml(xml: string): ParsedNfe {
  return parseNfeStructure(readNfeXmlStructure(xml))
}
