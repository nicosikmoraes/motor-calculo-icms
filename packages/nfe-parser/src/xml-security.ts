import { AppErrorCode, AppTypeError } from '@motor/domain'
export enum XmlSecurityErrorCode {
  XML_DOCTYPE_FORBIDDEN = 'XML_DOCTYPE_FORBIDDEN',
  XML_ENTITY_FORBIDDEN = 'XML_ENTITY_FORBIDDEN',
  XML_TOO_LARGE = 'XML_TOO_LARGE',
  XML_DEPTH_EXCEEDED = 'XML_DEPTH_EXCEEDED',
}

export enum XmlSecurityErrorMessage {
  DEPTH_EXCEEDED = 'XML excede a profundidade máxima de {maxDepth} elementos.',
  TOO_LARGE = 'XML excede o limite de {maxBytes} bytes.',
  FORBIDDEN_DECLARATION = 'DTD e entidades XML não são aceitos em documentos fiscais.',
}

function formatXmlSecurityMessage(message: XmlSecurityErrorMessage, params: Readonly<Record<string, number>>): string {
  return message.replace(/\{(\w+)\}/g, (_, key: string) => String(params[key] ?? `{${key}}`))
}

const FORBIDDEN_XML_DECLARATIONS = [
  { pattern: /<!DOCTYPE\b/i, code: XmlSecurityErrorCode.XML_DOCTYPE_FORBIDDEN },
  { pattern: /<!ENTITY\b/i, code: XmlSecurityErrorCode.XML_ENTITY_FORBIDDEN },
] as const

export interface XmlSecurityPolicy {
  maxBytes: number
  maxDepth: number
}

export const PRODUCTION_XML_SECURITY_POLICY: Readonly<XmlSecurityPolicy> = Object.freeze({
  maxBytes: 10 * 1024 * 1024,
  maxDepth: 100,
})

export class XmlSecurityError extends Error {
  constructor(
    readonly code: XmlSecurityErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'XmlSecurityError'
  }
}

function assertValidPolicy(policy: XmlSecurityPolicy): void {
  for (const [name, value] of Object.entries(policy)) {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new AppTypeError(AppErrorCode.INVALID_XML_LIMIT, { name, value })
    }
  }
}

function findTagEnd(xml: string, start: number): number {
  let quote: '"' | "'" | undefined
  for (let index = start; index < xml.length; index += 1) {
    const character = xml[index]
    if (quote) {
      if (character === quote) quote = undefined
    } else if (character === '"' || character === "'") {
      quote = character
    } else if (character === '>') {
      return index
    }
  }
  return xml.length - 1
}

function assertXmlDepth(xml: string, maxDepth: number): void {
  let depth = 0
  let cursor = 0

  while (cursor < xml.length) {
    const tagStart = xml.indexOf('<', cursor)
    if (tagStart === -1) return

    if (xml.startsWith('<!--', tagStart)) {
      const end = xml.indexOf('-->', tagStart + 4)
      cursor = end === -1 ? xml.length : end + 3
      continue
    }
    if (xml.startsWith('<![CDATA[', tagStart)) {
      const end = xml.indexOf(']]>', tagStart + 9)
      cursor = end === -1 ? xml.length : end + 3
      continue
    }
    if (xml.startsWith('<?', tagStart)) {
      const end = xml.indexOf('?>', tagStart + 2)
      cursor = end === -1 ? xml.length : end + 2
      continue
    }

    const tagEnd = findTagEnd(xml, tagStart + 1)
    const tag = xml.slice(tagStart + 1, tagEnd).trim()
    if (tag.startsWith('/')) {
      depth = Math.max(0, depth - 1)
    } else if (tag && !tag.startsWith('!')) {
      depth += 1
      if (depth > maxDepth) {
        throw new XmlSecurityError(
          XmlSecurityErrorCode.XML_DEPTH_EXCEEDED,
          formatXmlSecurityMessage(XmlSecurityErrorMessage.DEPTH_EXCEEDED, { maxDepth }),
        )
      }
      if (tag.endsWith('/')) depth -= 1
    }
    cursor = tagEnd + 1
  }
}

export function assertSafeXml(
  xml: string,
  policy: XmlSecurityPolicy = PRODUCTION_XML_SECURITY_POLICY,
): void {
  assertValidPolicy(policy)
  if (Buffer.byteLength(xml, 'utf8') > policy.maxBytes) {
    throw new XmlSecurityError(
      XmlSecurityErrorCode.XML_TOO_LARGE,
      formatXmlSecurityMessage(XmlSecurityErrorMessage.TOO_LARGE, { maxBytes: policy.maxBytes }),
    )
  }
  for (const forbidden of FORBIDDEN_XML_DECLARATIONS) {
    if (forbidden.pattern.test(xml)) {
      throw new XmlSecurityError(
        forbidden.code,
        XmlSecurityErrorMessage.FORBIDDEN_DECLARATION,
      )
    }
  }
  assertXmlDepth(xml, policy.maxDepth)
}
