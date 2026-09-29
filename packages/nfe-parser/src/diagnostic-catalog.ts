import type { NormalizedNfe } from '@motor/domain'
import type { XMLValidationError } from 'xmllint-wasm'
import { NfeParseError } from './nfe-parser'
import { XmlSecurityError } from './xml-security'

export enum DiagnosticSeverityCode {
  AVISO = 'AVISO',
  INFORMACAO_FALTANTE = 'INFORMACAO_FALTANTE',
  ERRO_IMPEDITIVO = 'ERRO_IMPEDITIVO',
}

export enum ProcessingDecisionCode {
  PROCESSAR = 'PROCESSAR',
  PROCESSAR_PARCIALMENTE = 'PROCESSAR_PARCIALMENTE',
  REJEITAR = 'REJEITAR',
}

export enum IngestionDiagnosticCode {
  ASSINATURA_NAO_VERIFICADA = 'ASSINATURA_NAO_VERIFICADA',
  XSD_INCOMPATIBILIDADE = 'XSD_INCOMPATIBILIDADE',
  XSD_CAMPO_OBRIGATORIO_AUSENTE = 'XSD_CAMPO_OBRIGATORIO_AUSENTE',
  XSD_VALOR_INVALIDO = 'XSD_VALOR_INVALIDO',
  INFORMACOES_FALTANTES = 'INFORMACOES_FALTANTES',
  XML_CONTEUDO_INSEGURO = 'XML_CONTEUDO_INSEGURO',
  XML_MALFORMADO = 'XML_MALFORMADO',
  TIPO_XML_NAO_SUPORTADO = 'TIPO_XML_NAO_SUPORTADO',
  VERSAO_NAO_SUPORTADA = 'VERSAO_NAO_SUPORTADA',
  MODELO_NAO_SUPORTADO = 'MODELO_NAO_SUPORTADO',
}

export enum DiagnosticSourceCode {
  SECURITY = 'SECURITY',
  XML = 'XML',
  XSD = 'XSD',
  POLICY = 'POLICY',
}

export type DiagnosticSeverity = `${DiagnosticSeverityCode}`
export type ProcessingDecision = `${ProcessingDecisionCode}`

/** Textos padrão do catálogo de diagnósticos. */
export enum IngestionDiagnosticMessage {
  ASSINATURA_NAO_VERIFICADA = 'A assinatura digital não é validada pelo MVP.',
  XSD_INCOMPATIBILIDADE = 'O XML diverge do schema, mas os dados reconhecidos podem ser processados.',
  XSD_CAMPO_OBRIGATORIO_AUSENTE = 'Um elemento ou atributo obrigatório não foi informado.',
  XSD_VALOR_INVALIDO = 'Um valor obrigatório não pode ser usado porque não respeita o schema.',
  INFORMACOES_FALTANTES = 'Não há dados suficientes para concluir todo o cálculo.',
  XML_CONTEUDO_INSEGURO = 'O XML contém construção proibida por segurança.',
  XML_MALFORMADO = 'O conteúdo não é um XML bem formado.',
  TIPO_XML_NAO_SUPORTADO = 'O arquivo não contém uma NF-e ou NFC-e reconhecida.',
  VERSAO_NAO_SUPORTADA = 'O leiaute identificado não é suportado por esta versão do aplicativo.',
  MODELO_NAO_SUPORTADO = 'O modelo fiscal identificado está fora do escopo do MVP.',
  MISSING_FIELD = 'Campo necessário não encontrado: {path}.',
}

export const INGESTION_DIAGNOSTIC_CATALOG = {
  ASSINATURA_NAO_VERIFICADA: {
    severity: DiagnosticSeverityCode.AVISO,
    description: IngestionDiagnosticMessage.ASSINATURA_NAO_VERIFICADA,
  },
  XSD_INCOMPATIBILIDADE: {
    severity: DiagnosticSeverityCode.AVISO,
    description: IngestionDiagnosticMessage.XSD_INCOMPATIBILIDADE,
  },
  XSD_CAMPO_OBRIGATORIO_AUSENTE: {
    severity: DiagnosticSeverityCode.INFORMACAO_FALTANTE,
    description: IngestionDiagnosticMessage.XSD_CAMPO_OBRIGATORIO_AUSENTE,
  },
  XSD_VALOR_INVALIDO: {
    severity: DiagnosticSeverityCode.INFORMACAO_FALTANTE,
    description: IngestionDiagnosticMessage.XSD_VALOR_INVALIDO,
  },
  INFORMACOES_FALTANTES: {
    severity: DiagnosticSeverityCode.INFORMACAO_FALTANTE,
    description: IngestionDiagnosticMessage.INFORMACOES_FALTANTES,
  },
  XML_CONTEUDO_INSEGURO: {
    severity: DiagnosticSeverityCode.ERRO_IMPEDITIVO,
    description: IngestionDiagnosticMessage.XML_CONTEUDO_INSEGURO,
  },
  XML_MALFORMADO: {
    severity: DiagnosticSeverityCode.ERRO_IMPEDITIVO,
    description: IngestionDiagnosticMessage.XML_MALFORMADO,
  },
  TIPO_XML_NAO_SUPORTADO: {
    severity: DiagnosticSeverityCode.ERRO_IMPEDITIVO,
    description: IngestionDiagnosticMessage.TIPO_XML_NAO_SUPORTADO,
  },
  VERSAO_NAO_SUPORTADA: {
    severity: DiagnosticSeverityCode.ERRO_IMPEDITIVO,
    description: IngestionDiagnosticMessage.VERSAO_NAO_SUPORTADA,
  },
  MODELO_NAO_SUPORTADO: {
    severity: DiagnosticSeverityCode.ERRO_IMPEDITIVO,
    description: IngestionDiagnosticMessage.MODELO_NAO_SUPORTADO,
  },
} as const satisfies Record<
  string,
  { severity: DiagnosticSeverity; description: string }
>

export interface IngestionDiagnostic {
  code: IngestionDiagnosticCode
  severity: DiagnosticSeverity
  message: string
  source: DiagnosticSourceCode.SECURITY | DiagnosticSourceCode.XML | DiagnosticSourceCode.XSD | DiagnosticSourceCode.POLICY
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
    IngestionDiagnosticCode.ASSINATURA_NAO_VERIFICADA,
    INGESTION_DIAGNOSTIC_CATALOG.ASSINATURA_NAO_VERIFICADA.description,
    DiagnosticSourceCode.POLICY,
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
    diagnostic(IngestionDiagnosticCode.INFORMACOES_FALTANTES, IngestionDiagnosticMessage.MISSING_FIELD.replace('{path}', path), DiagnosticSourceCode.XML),
  )
}

export function classifyParseError(error: NfeParseError | XmlSecurityError): IngestionDiagnostic {
  if (error instanceof XmlSecurityError) {
    return diagnostic(IngestionDiagnosticCode.XML_CONTEUDO_INSEGURO, error.message, DiagnosticSourceCode.SECURITY)
  }

  const codeByParseError = {
    XML_NOT_WELL_FORMED: IngestionDiagnosticCode.XML_MALFORMADO,
    UNSUPPORTED_XML_ROOT: IngestionDiagnosticCode.TIPO_XML_NAO_SUPORTADO,
    UNSUPPORTED_LAYOUT_VERSION: IngestionDiagnosticCode.VERSAO_NAO_SUPORTADA,
    MISSING_NFE_INFO: IngestionDiagnosticCode.INFORMACOES_FALTANTES,
    UNSUPPORTED_DOCUMENT_MODEL: IngestionDiagnosticCode.MODELO_NAO_SUPORTADO,
  } as const satisfies Record<NfeParseError['code'], IngestionDiagnosticCode>

  return diagnostic(codeByParseError[error.code], error.message, DiagnosticSourceCode.XML)
}

export function classifySchemaError(error: XMLValidationError): IngestionDiagnostic {
  const message = error.message.trim()
  const line = error.loc?.lineNumber

  if (/Missing child element|attribute .* is required but missing/i.test(message)) {
    return diagnostic(IngestionDiagnosticCode.XSD_CAMPO_OBRIGATORIO_AUSENTE, message, DiagnosticSourceCode.XSD, line)
  }

  if (/facet|not a valid value|not accepted by the pattern|is not a valid value/i.test(message)) {
    return diagnostic(IngestionDiagnosticCode.XSD_VALOR_INVALIDO, message, DiagnosticSourceCode.XSD, line)
  }

  return diagnostic(IngestionDiagnosticCode.XSD_INCOMPATIBILIDADE, message, DiagnosticSourceCode.XSD, line)
}

export function decideProcessing(
  diagnostics: readonly IngestionDiagnostic[],
): ProcessingDecision {
  if (diagnostics.some(({ severity }) => severity === DiagnosticSeverityCode.ERRO_IMPEDITIVO)) return ProcessingDecisionCode.REJEITAR
  if (diagnostics.some(({ severity }) => severity === DiagnosticSeverityCode.INFORMACAO_FALTANTE)) {
    return ProcessingDecisionCode.PROCESSAR_PARCIALMENTE
  }
  return ProcessingDecisionCode.PROCESSAR
}
