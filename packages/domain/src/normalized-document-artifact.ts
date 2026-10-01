/** Dados estruturais de protocolo ou evento, sem efeito fiscal calculado. */
export enum DocumentArtifactKindCode { PROTOCOL = 'PROTOCOL', EVENT = 'EVENT' }
export enum ArtifactEnvelopeCode { NFE_PROC = 'NFE_PROC', PROT_NFE = 'PROT_NFE', PROC_EVENTO_NFE = 'PROC_EVENTO_NFE', EVENTO = 'EVENTO' }
export interface NormalizedDocumentArtifact {
  kind: `${DocumentArtifactKindCode}`
  envelope: `${ArtifactEnvelopeCode}`
  version: string
  accessKey: string
  environmentCode?: string
  statusCode?: string
  statusReason?: string
  protocolNumber?: string
  occurredAt?: string
  eventType?: string
  sequence?: string
  correctionText?: string
  justification?: string
  responseMatches?: boolean
  embeddedForAccessKey?: string
}
