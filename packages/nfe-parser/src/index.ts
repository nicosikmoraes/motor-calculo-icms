export * from './analyze-nfe'
export * from './diagnostic-catalog'
export * from './file-inventory'
export * from './nfe-parser'
export * from './normalize-nfe'
export * from './schema-validator'
export * from './xml-security'
export * from './zip-security'

export interface ParseFailure {
  file: string
  stage: 'INVENTORY' | 'XML' | 'SCHEMA' | 'NORMALIZATION'
  code: string
  message: string
}

export interface ParsedFiscalArtifact {
  sourcePath: string
  contentHash: string
  kind: 'NFE' | 'PROTOCOL' | 'EVENT' | 'INVALID'
  accessKey?: string
  normalized: unknown
}

export interface NfeParser {
  parse(sourcePath: string): Promise<ParsedFiscalArtifact | ParseFailure>
}
