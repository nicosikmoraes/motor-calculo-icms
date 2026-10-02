import { XMLBuilder, XMLParser } from 'fast-xml-parser'
import { validateXML } from 'xmllint-wasm'
import { bundledArtifactSchemas } from './artifact-schema-catalog'
import type { ParsedDocumentArtifact } from './document-artifacts'
import { assertSafeXml } from './xml-security'

export interface ArtifactSchemaIssue { code: string; message: string }

/** Serializa uma subárvore somente para validação, conservando namespaces herdados. */
function subtree(xml: string, path: string[]): string | undefined {
  const tree = new XMLParser({ ignoreAttributes: false, parseTagValue: false,
    parseAttributeValue: false, trimValues: false }).parse(xml) as Record<string, unknown>
  let current: any = tree
  const namespaces: Record<string, unknown> = {}
  for (const localName of path) {
    const name = Object.keys(current).find((name) => name.split(':').at(-1) === localName)
    if (!name) return undefined
    current = current[name]
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined
    for (const [key, value] of Object.entries(current)) {
      if (key === '@_xmlns' || key.startsWith('@_xmlns:')) namespaces[key] = value
    }
    if (localName === path.at(-1)) {
      return new XMLBuilder({ ignoreAttributes: false }).build({ [name]: { ...namespaces, ...current } })
    }
  }
  return undefined
}

async function validate(xml: string, entryName: string): Promise<ArtifactSchemaIssue[]> {
  const schemas = new Map(bundledArtifactSchemas.map((schema) => [schema.fileName, schema]))
  const entry = schemas.get(entryName)!
  const result = await validateXML({ xml: [{ fileName: 'artefato.xml', contents: xml }],
    schema: [entry], preload: [...schemas.values()].filter((schema) => schema !== entry) })
  return result.errors.map((error) => ({ code: 'ARTEFATO_XSD_INVALIDO',
    message: `Schema ${entryName}${error.loc?.lineNumber ? `, linha ${error.loc.lineNumber}` : ''}: ${error.message.trim()}` }))
}

/** Diagnósticos estruturais: não certifica assinatura nem aplica efeitos fiscais. */
export async function validateDocumentArtifactSchema(
  xml: string, parsed: ParsedDocumentArtifact,
): Promise<ArtifactSchemaIssue[]> {
  assertSafeXml(xml)
  if (parsed.kind === 'NFE') {
    if (!parsed.embeddedProtocol) return []
    const protocol = subtree(xml, ['nfeProc', 'protNFe'])
    return protocol ? validate(protocol, 'protNFe-adapter.xsd') : []
  }
  if (parsed.kind === 'PROTOCOL') return validate(xml, 'protNFe-adapter.xsd')
  const issues = await validate(xml, parsed.artifact.envelope === 'PROC_EVENTO_NFE'
    ? 'procEventoNFe_v1.00.xsd' : 'evento-adapter.xsd')
  const specific = ({ '110110': 'e110110_v1.00.xsd', '110111': 'e110111_v1.00.xsd' } as Record<string, string>)[parsed.artifact.eventType ?? '']
  if (!specific) {
    issues.push({ code: 'EVENTO_XSD_ESPECIFICO_NAO_DISPONIVEL',
      message: `Evento ${parsed.artifact.eventType}: somente o envelope foi validado; o schema específico de detEvento não está disponível no catálogo local.` })
  } else {
    const path = parsed.artifact.envelope === 'PROC_EVENTO_NFE'
      ? ['procEventoNFe', 'evento', 'infEvento', 'detEvento'] : ['evento', 'infEvento', 'detEvento']
    const detail = subtree(xml, path)
    if (detail) issues.push(...await validate(detail, specific))
  }
  return issues
}
