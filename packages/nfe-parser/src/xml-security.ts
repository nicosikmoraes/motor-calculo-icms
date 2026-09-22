const FORBIDDEN_XML_DECLARATIONS = [
  { pattern: /<!DOCTYPE\b/i, code: 'XML_DOCTYPE_FORBIDDEN' },
  { pattern: /<!ENTITY\b/i, code: 'XML_ENTITY_FORBIDDEN' },
] as const

export interface XmlSecurityPolicy {
  maxBytes: number
  maxDepth: number
}

export const PRODUCTION_XML_SECURITY_POLICY: Readonly<XmlSecurityPolicy> = Object.freeze({
  maxBytes: 10 * 1024 * 1024,
  maxDepth: 100,
})

export type XmlSecurityErrorCode =
  | (typeof FORBIDDEN_XML_DECLARATIONS)[number]['code']
  | 'XML_TOO_LARGE'
  | 'XML_DEPTH_EXCEEDED'

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
      throw new TypeError(`Limite XML inválido em ${name}: ${value}.`)
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
          'XML_DEPTH_EXCEEDED',
          `XML excede a profundidade máxima de ${maxDepth} elementos.`,
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
      'XML_TOO_LARGE',
      `XML excede o limite de ${policy.maxBytes} bytes.`,
    )
  }
  for (const forbidden of FORBIDDEN_XML_DECLARATIONS) {
    if (forbidden.pattern.test(xml)) {
      throw new XmlSecurityError(
        forbidden.code,
        'DTD e entidades XML não são aceitos em documentos fiscais.',
      )
    }
  }
  assertXmlDepth(xml, policy.maxDepth)
}
