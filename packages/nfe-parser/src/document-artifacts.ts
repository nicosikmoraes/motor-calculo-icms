import { ArtifactEnvelopeCode, DocumentArtifactKindCode, type NormalizedDocumentArtifact, type NormalizedNfe } from '@motor/domain'
import { normalizeNfeStructure } from './normalize-nfe'
import { asObject, asString, NfeParseError, NfeParseErrorCode,
  readFiscalXmlDocument, type XmlObject } from './nfe-parser'

export { DocumentArtifactKindCode, ArtifactEnvelopeCode } from '@motor/domain'
export enum DocumentArtifactErrorMessage {
  UNSUPPORTED_ROOT = 'Tipo de XML fiscal não suportado nesta importação.',
  UNSUPPORTED_VERSION = 'Versão {version} não suportada para {kind}.',
  MISSING_FIELD = 'Campo obrigatório ausente no protocolo ou evento: {field}.',
  INVALID_ACCESS_KEY = 'Chave de acesso inválida no protocolo ou evento.',
  INVALID_EVENT_TYPE = 'Tipo ou sequência do evento inválidos.',
}
export type ParsedDocumentArtifact =
  | { kind: 'NFE'; note: NormalizedNfe; embeddedProtocol?: NormalizedDocumentArtifact }
  | { kind: 'PROTOCOL' | 'EVENT'; artifact: NormalizedDocumentArtifact }

function required(node: XmlObject | undefined, field: string): string {
  const value = node ? asString(node[field]) : undefined
  if (!value) throw new NfeParseError(NfeParseErrorCode.MISSING_NFE_INFO,
    DocumentArtifactErrorMessage.MISSING_FIELD.replace('{field}', field))
  return value
}
function version(node: XmlObject, expected: string, kind: string): string {
  const actual = required(node, '@_versao')
  if (actual !== expected) throw new NfeParseError(NfeParseErrorCode.UNSUPPORTED_LAYOUT_VERSION,
    DocumentArtifactErrorMessage.UNSUPPORTED_VERSION.replace('{version}', actual).replace('{kind}', kind))
  return actual
}
function key(value: string): string {
  if (!/^\d{44}$/.test(value)) throw new NfeParseError(NfeParseErrorCode.MISSING_NFE_INFO,
    DocumentArtifactErrorMessage.INVALID_ACCESS_KEY)
  return value
}
function protocol(node: XmlObject, envelope: ArtifactEnvelopeCode, embeddedForAccessKey?: string): NormalizedDocumentArtifact {
  const info = asObject(node.infProt)
  const protocolVersion = version(node, '4.00', 'protocolo NF-e')
  const accessKey = key(required(info, 'chNFe'))
  return {
    kind: DocumentArtifactKindCode.PROTOCOL, envelope, version: protocolVersion, accessKey,
    statusCode: required(info, 'cStat'),
    ...(asString(info?.xMotivo) ? { statusReason: asString(info?.xMotivo)! } : {}),
    ...(asString(info?.tpAmb) ? { environmentCode: asString(info?.tpAmb)! } : {}),
    ...(asString(info?.nProt) ? { protocolNumber: asString(info?.nProt)! } : {}),
    ...(asString(info?.dhRecbto) ? { occurredAt: asString(info?.dhRecbto)! } : {}),
    ...(embeddedForAccessKey ? { embeddedForAccessKey } : {}),
  }
}
function event(node: XmlObject, response: XmlObject | undefined, envelope: ArtifactEnvelopeCode): NormalizedDocumentArtifact {
  const eventVersion = version(node, '1.00', 'evento NF-e')
  const info = asObject(node.infEvento)
  const accessKey = key(required(info, 'chNFe'))
  const eventType = required(info, 'tpEvento')
  const sequence = required(info, 'nSeqEvento')
  if (!/^\d{6}$/.test(eventType) || !/^\d{1,2}$/.test(sequence) || Number(sequence) < 1) {
    throw new NfeParseError(NfeParseErrorCode.MISSING_NFE_INFO, DocumentArtifactErrorMessage.INVALID_EVENT_TYPE)
  }
  const responseInfo = response ? asObject(response.infEvento) : undefined
  if (response) version(response, '1.00', 'retorno de evento NF-e')
  const responseMatches = responseInfo !== undefined && asString(responseInfo.chNFe) === accessKey
    && asString(responseInfo.tpEvento) === eventType && asString(responseInfo.nSeqEvento) === sequence
    && asString(responseInfo.tpAmb) === asString(info?.tpAmb)
  const details = asObject(info?.detEvento)
  return {
    kind: DocumentArtifactKindCode.EVENT, envelope, version: eventVersion, accessKey,
    eventType, sequence,
    ...(asString(info?.tpAmb) ? { environmentCode: asString(info?.tpAmb)! } : {}),
    ...(asString(info?.dhEvento) ? { occurredAt: asString(info?.dhEvento)! } : {}),
    ...(asString(details?.xCorrecao) ? { correctionText: asString(details?.xCorrecao)! } : {}),
    ...(asString(details?.xJust) ? { justification: asString(details?.xJust)! } : {}),
    ...(responseInfo && asString(responseInfo.cStat) ? { statusCode: asString(responseInfo.cStat)! } : {}),
    ...(responseInfo && asString(responseInfo.xMotivo) ? { statusReason: asString(responseInfo.xMotivo)! } : {}),
    ...(responseInfo && asString(responseInfo.nProt) ? { protocolNumber: asString(responseInfo.nProt)! } : {}),
    ...(response ? { responseMatches } : {}),
  }
}

/** Reconhece artefatos estruturais; não confere assinatura nem aplica efeitos fiscais. */
export function parseDocumentArtifactXml(xml: string): ParsedDocumentArtifact {
  const root = readFiscalXmlDocument(xml)
  const processed = asObject(root.nfeProc)
  const standalone = asObject(root.NFe)
  if (processed || standalone) {
    const nfe = processed ? asObject(processed.NFe) : standalone
    const info = asObject(nfe?.infNFe)
    if (!nfe || !info) throw new NfeParseError(NfeParseErrorCode.MISSING_NFE_INFO, DocumentArtifactErrorMessage.MISSING_FIELD.replace('{field}', 'infNFe'))
    if (processed) version(processed, '4.00', 'nfeProc')
    const note = normalizeNfeStructure({ ...(processed ? { processed } : {}), nfe, info })
    const embedded = processed ? asObject(processed.protNFe) : undefined
    return { kind: 'NFE', note,
      ...(embedded ? { embeddedProtocol: protocol(embedded, ArtifactEnvelopeCode.NFE_PROC, note.accessKey) } : {}) }
  }
  const standaloneProtocol = asObject(root.protNFe)
  if (standaloneProtocol) return { kind: 'PROTOCOL', artifact: protocol(standaloneProtocol, ArtifactEnvelopeCode.PROT_NFE) }
  const processedEvent = asObject(root.procEventoNFe)
  if (processedEvent) {
    version(processedEvent, '1.00', 'procEventoNFe')
    const request = asObject(processedEvent.evento)
    if (!request) throw new NfeParseError(NfeParseErrorCode.MISSING_NFE_INFO, DocumentArtifactErrorMessage.MISSING_FIELD.replace('{field}', 'evento'))
    return { kind: 'EVENT', artifact: event(request, asObject(processedEvent.retEvento), ArtifactEnvelopeCode.PROC_EVENTO_NFE) }
  }
  const standaloneEvent = asObject(root.evento)
  if (standaloneEvent) return { kind: 'EVENT', artifact: event(standaloneEvent, undefined, ArtifactEnvelopeCode.EVENTO) }
  throw new NfeParseError(NfeParseErrorCode.UNSUPPORTED_XML_ROOT, DocumentArtifactErrorMessage.UNSUPPORTED_ROOT)
}
