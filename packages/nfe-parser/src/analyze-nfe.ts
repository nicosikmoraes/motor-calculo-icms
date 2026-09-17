import {
  classifyParseError,
  classifySchemaError,
  decideProcessing,
  findNormalizedNfeDiagnostics,
  signatureNotVerifiedDiagnostic,
  type IngestionDiagnostic,
  type ProcessingDecision,
} from './diagnostic-catalog'
import {
  NfeParseError,
  parseNfeStructure,
  readNfeXmlStructure,
  type ParsedNfe,
} from './nfe-parser'
import { normalizeNfeStructure } from './normalize-nfe'
import { validateNfeSchema } from './schema-validator'
import { XmlSecurityError } from './xml-security'

export interface NfeAnalysisResult {
  document?: ParsedNfe
  normalizedDocument?: NormalizedNfe
  diagnostics: readonly IngestionDiagnostic[]
  decision: ProcessingDecision
}

/**
 * Executa a fronteira de ingestão já com a política de severidades do MVP.
 * Uma pendência não altera o XML original nem inventa valores ausentes.
 */
export async function analyzeNfeXml(
  xml: string,
  options: { fileName?: string; schemaDirectory?: string } = {},
): Promise<NfeAnalysisResult> {
  let document: ParsedNfe
  let normalizedDocument: NormalizedNfe

  try {
    const structure = readNfeXmlStructure(xml)
    document = parseNfeStructure(structure)
    normalizedDocument = normalizeNfeStructure(structure)
  } catch (error) {
    if (!(error instanceof NfeParseError) && !(error instanceof XmlSecurityError)) throw error

    const diagnostics = [classifyParseError(error)]
    return { diagnostics, decision: decideProcessing(diagnostics) }
  }

  const validation = await validateNfeSchema(xml, options)
  const diagnostics = [
    signatureNotVerifiedDiagnostic(),
    ...validation.errors.map(classifySchemaError),
    ...findNormalizedNfeDiagnostics(normalizedDocument),
  ]

  return {
    document,
    normalizedDocument,
    diagnostics,
    decision: decideProcessing(diagnostics),
  }
}
import type { NormalizedNfe } from '@motor/domain'
