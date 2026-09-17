const FORBIDDEN_XML_DECLARATIONS = [
  { pattern: /<!DOCTYPE\b/i, code: 'XML_DOCTYPE_FORBIDDEN' },
  { pattern: /<!ENTITY\b/i, code: 'XML_ENTITY_FORBIDDEN' },
] as const

export class XmlSecurityError extends Error {
  constructor(
    readonly code: (typeof FORBIDDEN_XML_DECLARATIONS)[number]['code'],
    message: string,
  ) {
    super(message)
    this.name = 'XmlSecurityError'
  }
}

export function assertSafeXml(xml: string): void {
  for (const forbidden of FORBIDDEN_XML_DECLARATIONS) {
    if (forbidden.pattern.test(xml)) {
      throw new XmlSecurityError(
        forbidden.code,
        'DTD e entidades XML não são aceitos em documentos fiscais.',
      )
    }
  }
}
