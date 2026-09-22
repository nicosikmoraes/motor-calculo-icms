export * from './document-occurrence-classifier'
export * from './normalized-nfe'
export * from './registrations'

export type BatchStatus =
  | 'RECEBIDO'
  | 'VALIDANDO'
  | 'PROCESSANDO'
  | 'INTERROMPIDO'
  | 'CONCLUIDO'
  | 'CONCLUIDO_COM_PENDENCIAS'
  | 'FALHOU'

export type ItemCalculationStatus =
  | 'CALCULADO_ADERENTE'
  | 'CALCULADO_DIVERGENTE'
  | 'REGRA_NAO_ENCONTRADA'
  | 'REGRA_AMBIGUA'
  | 'PRODUTO_NAO_CLASSIFICADO'
  | 'DADOS_INSUFICIENTES'
  | 'DIVERGENCIA_CADASTRAL'
  | 'ERRO_CALCULO'

export type DocumentCalculationStatus =
  | 'CALCULADA_ADERENTE'
  | 'CALCULADA_DIVERGENTE'
  | 'PENDENTE'
  | 'ERRO'
  | 'REPETIDA'

export type ResultCharacter = 'DEFINITIVO' | 'PROVISORIO' | 'DIAGNOSTICO'

export type DocumentSituation =
  | 'AUTORIZADA'
  | 'NAO_VERIFICADA'
  | 'CANCELADA'
  | 'PENDENTE_REVISAO_CCE'
  | 'REJEITADA'
  | 'USO_DENEGADO'
  | 'CONTINGENCIA_PENDENTE'
  | 'OPERACAO_CONFIRMADA'
  | 'OPERACAO_NAO_REALIZADA'
  | 'OPERACAO_DESCONHECIDA'

export interface FiscalDocumentState {
  documentSituation: DocumentSituation
  calculationStatus: DocumentCalculationStatus
  resultCharacter: ResultCharacter
  calculated: boolean
  includedInTotal: boolean
  exclusionOrPendingReason?: string
}
