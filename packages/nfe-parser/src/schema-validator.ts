import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { validateXML, type XMLFileInfo, type XMLValidationError } from 'xmllint-wasm'
import { assertSafeXml } from './xml-security'

export const NFE_SCHEMA_RELEASE = {
  name: 'PL_010f_v1.04',
  publishedAt: '2026-08-31',
  archiveSha256: 'b8589490a58a09a993a80e6ac4d7ed10f20892061ecfc56719337098d4b95998',
  sourceUrl:
    'https://www.nfe.fazenda.gov.br/portal/exibirArquivo.aspx?conteudo=8ITFuBLltXs=',
  procNfeSourceRelease: 'PL_009p_NT2024_003_v1.03',
  procNfeArchiveSha256:
    '2e925939a228aaf785be9fe7d6315f2da94d3a10036d54ffb7c1273aa7502b05',
} as const

const SCHEMA_FILE_NAMES = [
  'DFeTiposBasicos_v1.00.xsd',
  'leiauteNFe_v4.00.xsd',
  'nfe_v4.00.xsd',
  'procNFe_v4.00.xsd',
  'tiposBasico_v4.00.xsd',
  'xmldsig-core-schema_v1.01.xsd',
] as const

export interface SchemaValidationResult {
  valid: boolean
  errors: readonly XMLValidationError[]
  schemaRelease: typeof NFE_SCHEMA_RELEASE.name
}

function defaultSchemaDirectory(): string {
  return fileURLToPath(new URL('../schemas/PL_010f_v1.04/', import.meta.url))
}

async function loadSchemas(directory: string): Promise<Map<string, XMLFileInfo>> {
  const entries = await Promise.all(
    SCHEMA_FILE_NAMES.map(async (fileName) => [
      fileName,
      { fileName, contents: await readFile(`${directory}/${fileName}`, 'utf8') },
    ] as const),
  )
  return new Map(entries)
}

function detectSchema(xml: string): 'nfe_v4.00.xsd' | 'procNFe_v4.00.xsd' {
  return /<(?:[A-Za-z_][\w.-]*:)?nfeProc(?:\s|>)/.test(xml)
    ? 'procNFe_v4.00.xsd'
    : 'nfe_v4.00.xsd'
}

export async function validateNfeSchema(
  xml: string,
  options: { fileName?: string; schemaDirectory?: string } = {},
): Promise<SchemaValidationResult> {
  assertSafeXml(xml)

  const schemas = await loadSchemas(options.schemaDirectory ?? defaultSchemaDirectory())
  const entryName = detectSchema(xml)
  const entry = schemas.get(entryName)
  if (!entry) throw new Error(`Schema principal não encontrado: ${entryName}.`)

  const result = await validateXML({
    xml: [{ fileName: options.fileName ?? 'documento.xml', contents: xml }],
    schema: [entry],
    preload: [...schemas.values()].filter((schema) => schema.fileName !== entryName),
  })

  return {
    valid: result.valid,
    errors: result.errors,
    schemaRelease: NFE_SCHEMA_RELEASE.name,
  }
}
