import type { NormalizedNfe } from '@motor/domain'
import type { XMLValidationError } from 'xmllint-wasm'
import { NfeParseError } from './nfe-parser'
import { XmlSecurityError } from './xml-security'

export type DiagnosticSeverity = 'AVISO' | 'INFORMACAO_FALTANTE' | 'ERRO_IMPEDITIVO'
export type ProcessingDecision = 'PROCESSAR' | 'PROCESSAR_PARCIALMENTE' | 'REJEITAR'

export const INGESTION_DIAGNOSTIC_CATALOG = {
  ASSINATURA_NAO_VERIFICADA: {
    severity: 'AVISO',
    description: 'A assinatura digital não é validada pelo MVP.',
  },
  XSD_INCOMPATIBILIDADE: {
    severity: 'AVISO',
    description: 'O XML diverge do schema, mas os dados reconhecidos podem ser processados.',
  },
  XSD_CAMPO_OBRIGATORIO_AUSENTE: {
    severity: 'INFORMACAO_FALTANTE',
    description: 'Um elemento ou atributo obrigatório não foi informado.',
  },
  XSD_VALOR_INVALIDO: {
    severity: 'INFORMACAO_FALTANTE',
    description: 'Um valor obrigatório não pode ser usado porque não respeita o schema.',
  },
  INFORMACOES_FALTANTES: {
    severity: 'INFORMACAO_FALTANTE',
    description: 'Não há dados suficientes para concluir todo o cálculo.',
  },
  XML_CONTEUDO_INSEGURO: {
    severity: 'ERRO_IMPEDITIVO',
    description: 'O XML contém construção proibida por segurança.',
  },
  XML_MALFORMADO: {
    severity: 'ERRO_IMPEDITIVO',
    description: 'O conteúdo não é um XML bem formado.',
  },
  TIPO_XML_NAO_SUPORTADO: {
    severity: 'ERRO_IMPEDITIVO',
    description: 'O arquivo não contém uma NF-e ou NFC-e reconhecida.',
  },
  VERSAO_NAO_SUPORTADA: {
    severity: 'ERRO_IMPEDITIVO',
    description: 'O leiaute identificado não é suportado por esta versão do aplicativo.',
  },
  MODELO_NAO_SUPORTADO: {
    severity: 'ERRO_IMPEDITIVO',
    description: 'O modelo fiscal identificado está fora do escopo do MVP.',
  },
} as const satisfies Record<
  string,
  { severity: DiagnosticSeverity; description: string }
>

export type IngestionDiagnosticCode = keyof typeof INGESTION_DIAGNOSTIC_CATALOG

export interface IngestionDiagnostic {
  code: IngestionDiagnosticCode
  severity: DiagnosticSeverity
  message: string
  source: 'SECURITY' | 'XML' | 'XSD' | 'POLICY'
  line?: number
}

function diagnostic(
  code: IngestionDiagnosticCode,
  message: string,
  source: IngestionDiagnostic['source'],
  line?: number,
): IngestionDiagnostic {
  return {
    code,
    severity: INGESTION_DIAGNOSTIC_CATALOG[code].severity,
    message,
    source,
    ...(line === undefined ? {} : { line }),
  }
}

export function signatureNotVerifiedDiagnostic(): IngestionDiagnostic {
  return diagnostic(
    'ASSINATURA_NAO_VERIFICADA',
    INGESTION_DIAGNOSTIC_CATALOG.ASSINATURA_NAO_VERIFICADA.description,
    'POLICY',
  )
}

export function findNormalizedNfeDiagnostics(
  document: NormalizedNfe,
): readonly IngestionDiagnostic[] {
  const missing: string[] = []

  if (!document.issuer.taxId) missing.push('NFe.infNFe.emit.CNPJ/CPF')
  if (!document.issuer.state) missing.push('NFe.infNFe.emit.enderEmit.UF')

  for (const [index, item] of document.items.entries()) {
    const path = `NFe.infNFe.det[${index + 1}].prod`
    if (!item.supplierProductCode) missing.push(`${path}.cProd`)
    if (!item.ncm) missing.push(`${path}.NCM`)
    if (!item.cfop) missing.push(`${path}.CFOP`)
    if (!item.commercialQuantity) missing.push(`${path}.qCom`)
    if (!item.commercialUnitAmount) missing.push(`${path}.vUnCom`)
    if (!item.productAmount) missing.push(`${path}.vProd`)
  }

  return missing.map((path) =>
    diagnostic('INFORMACOES_FALTANTES', `Campo necessário não encontrado: ${path}.`, 'XML'),
  )
}

export function classifyParseError(error: NfeParseError | XmlSecurityError): IngestionDiagnostic {
  if (error instanceof XmlSecurityError) {
    return diagnostic('XML_CONTEUDO_INSEGURO', error.message, 'SECURITY')
  }

  const codeByParseError = {
    XML_NOT_WELL_FORMED: 'XML_MALFORMADO',
    UNSUPPORTED_XML_ROOT: 'TIPO_XML_NAO_SUPORTADO',
    UNSUPPORTED_LAYOUT_VERSION: 'VERSAO_NAO_SUPORTADA',
    MISSING_NFE_INFO: 'INFORMACOES_FALTANTES',
    UNSUPPORTED_DOCUMENT_MODEL: 'MODELO_NAO_SUPORTADO',
  } as const satisfies Record<NfeParseError['code'], IngestionDiagnosticCode>

  return diagnostic(codeByParseError[error.code], error.message, 'XML')
}

export function classifySchemaError(error: XMLValidationError): IngestionDiagnostic {
  const message = error.message.trim()
  const line = error.loc?.lineNumber

  if (/Missing child element|attribute .* is required but missing/i.test(message)) {
    return diagnostic('XSD_CAMPO_OBRIGATORIO_AUSENTE', message, 'XSD', line)
  }

  if (/facet|not a valid value|not accepted by the pattern|is not a valid value/i.test(message)) {
    return diagnostic('XSD_VALOR_INVALIDO', message, 'XSD', line)
  }

  return diagnostic('XSD_INCOMPATIBILIDADE', message, 'XSD', line)
}

export function decideProcessing(
  diagnostics: readonly IngestionDiagnostic[],
): ProcessingDecision {
  if (diagnostics.some(({ severity }) => severity === 'ERRO_IMPEDITIVO')) return 'REJEITAR'
  if (diagnostics.some(({ severity }) => severity === 'INFORMACAO_FALTANTE')) {
    return 'PROCESSAR_PARCIALMENTE'
  }
  return 'PROCESSAR'
}
