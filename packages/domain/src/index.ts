export * from './fiscal-profile-evidence'
export * from './registration-operations'
export * from './app-error'
export * from './document-occurrence-classifier'
export * from './document-ingestion-classifier'
export * from './normalized-nfe'
export * from './registrations'

/** Estados persistidos do ciclo de vida de um lote. */
export enum BatchStatusCode {
  RECEBIDO = 'RECEBIDO',
  VALIDANDO = 'VALIDANDO',
  PROCESSANDO = 'PROCESSANDO',
  INTERROMPIDO = 'INTERROMPIDO',
  CANCELADO = 'CANCELADO',
  CONCLUIDO = 'CONCLUIDO',
  CONCLUIDO_COM_PENDENCIAS = 'CONCLUIDO_COM_PENDENCIAS',
  FALHOU = 'FALHOU',
}
export type BatchStatus = `${BatchStatusCode}`

export enum ItemCalculationStatusCode {
  CALCULADO_ADERENTE = 'CALCULADO_ADERENTE',
  CALCULADO_DIVERGENTE = 'CALCULADO_DIVERGENTE',
  REGRA_NAO_ENCONTRADA = 'REGRA_NAO_ENCONTRADA',
  REGRA_AMBIGUA = 'REGRA_AMBIGUA',
  PRODUTO_NAO_CLASSIFICADO = 'PRODUTO_NAO_CLASSIFICADO',
  DADOS_INSUFICIENTES = 'DADOS_INSUFICIENTES',
  DIVERGENCIA_CADASTRAL = 'DIVERGENCIA_CADASTRAL',
  ERRO_CALCULO = 'ERRO_CALCULO',
}
export type ItemCalculationStatus = `${ItemCalculationStatusCode}`
export enum DocumentCalculationStatusCode {
  CALCULADA_ADERENTE = 'CALCULADA_ADERENTE',
  CALCULADA_DIVERGENTE = 'CALCULADA_DIVERGENTE',
  PENDENTE = 'PENDENTE',
  ERRO = 'ERRO',
  REPETIDA = 'REPETIDA',
}
export type DocumentCalculationStatus = `${DocumentCalculationStatusCode}`
export enum ResultCharacterCode {
  DEFINITIVO = 'DEFINITIVO',
  PROVISORIO = 'PROVISORIO',
  DIAGNOSTICO = 'DIAGNOSTICO',
}
export type ResultCharacter = `${ResultCharacterCode}`
export enum DocumentSituationCode {
  AUTORIZADA = 'AUTORIZADA',
  NAO_VERIFICADA = 'NAO_VERIFICADA',
  CANCELADA = 'CANCELADA',
  PENDENTE_REVISAO_CCE = 'PENDENTE_REVISAO_CCE',
  REJEITADA = 'REJEITADA',
  USO_DENEGADO = 'USO_DENEGADO',
  CONTINGENCIA_PENDENTE = 'CONTINGENCIA_PENDENTE',
  OPERACAO_CONFIRMADA = 'OPERACAO_CONFIRMADA',
  OPERACAO_NAO_REALIZADA = 'OPERACAO_NAO_REALIZADA',
  OPERACAO_DESCONHECIDA = 'OPERACAO_DESCONHECIDA',
}
export type DocumentSituation = `${DocumentSituationCode}`
export interface FiscalDocumentState {
  documentSituation: DocumentSituation
  calculationStatus: DocumentCalculationStatus
  resultCharacter: ResultCharacter
  calculated: boolean
  includedInTotal: boolean
  exclusionOrPendingReason?: string
}
