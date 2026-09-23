import type { NormalizedNfe } from './normalized-nfe'
import { normalizeCnpj } from './registrations'

export type FiscalEnvironmentCode = '1' | '2'

export type DocumentIngestionPendingReason =
  | 'EMPRESA_DIVERGENTE'
  | 'AMBIENTE_NAO_INFORMADO'
  | 'AMBIENTE_DIVERGENTE'
  | 'OCORRENCIA_INELEGIVEL'

export interface DocumentIngestionClassification {
  eligibleForProcessing: boolean
  pendingReasons: readonly DocumentIngestionPendingReason[]
}

export function classifyDocumentIngestion(
  document: NormalizedNfe,
  companyCnpj: string,
  environmentCode: FiscalEnvironmentCode,
  occurrenceEligible: boolean,
): DocumentIngestionClassification {
  const normalizedCompanyCnpj = normalizeCnpj(companyCnpj)
  const partyCnpjs = [document.issuer, document.recipient]
    .filter((party) => party?.taxIdType === 'CNPJ' && party.taxId)
    .map((party) => party!.taxId!.replace(/\D/g, ''))
  const pendingReasons: DocumentIngestionPendingReason[] = []

  if (!partyCnpjs.includes(normalizedCompanyCnpj)) pendingReasons.push('EMPRESA_DIVERGENTE')
  if (!document.environmentCode) pendingReasons.push('AMBIENTE_NAO_INFORMADO')
  else if (document.environmentCode !== environmentCode) pendingReasons.push('AMBIENTE_DIVERGENTE')
  if (!occurrenceEligible) pendingReasons.push('OCORRENCIA_INELEGIVEL')

  return {
    eligibleForProcessing: pendingReasons.length === 0,
    pendingReasons,
  }
}
