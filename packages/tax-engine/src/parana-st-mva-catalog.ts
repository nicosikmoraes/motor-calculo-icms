import data from './data/pr-st-mva-1245-2025.json'

export interface ParanaStMvaRow {
  id: string; article: number; item: string; segment: string
  cest: string; ncmPrefixes: readonly string[]; description: string; originalMvaPercent: string
}
export interface ParanaStMvaCatalog {
  id: string; version: number; validFrom: string; verifiedThrough: string
  legalBasis: string; sourceUrl: string; sourceSha256: string; rows: readonly ParanaStMvaRow[]
}
export const PARANA_ST_MVA_CATALOG: ParanaStMvaCatalog = data

export type ParanaStMvaSelection =
  | { status: 'FOUND'; row: ParanaStMvaRow; catalog: ParanaStMvaCatalog }
  | { status: 'MISSING_CLASSIFICATION' | 'INVALID_DATE' | 'OUTSIDE_COVERAGE' | 'NO_MATCH' | 'CLASSIFICATION_CONFLICT' | 'AMBIGUOUS'; reason: string }

/** Consulta a MVA; a incidência e a descrição legal do produto exigem confirmação. */
export function selectParanaStMva(input: { operationDate?: string | undefined; ncm?: string | undefined; cest?: string | undefined },
  catalog: ParanaStMvaCatalog = PARANA_ST_MVA_CATALOG): ParanaStMvaSelection {
  const date = input.operationDate
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date))
    || new Date(date).toISOString().slice(0, 10) !== date) return { status: 'INVALID_DATE', reason: 'Data da operação ausente ou inválida para consultar a MVA.' }
  if (date < catalog.validFrom || date > catalog.verifiedThrough) return { status: 'OUTSIDE_COVERAGE',
    reason: `Este catálogo foi conferido para operações de ${catalog.validFrom} a ${catalog.verifiedThrough}. Informe a MVA vigente para outra data.` }
  if (!input.ncm || !/^\d{8}$/.test(input.ncm) || !input.cest || !/^\d{7}$/.test(input.cest)) return {
    status: 'MISSING_CLASSIFICATION', reason: 'A consulta da MVA exige NCM com oito dígitos e CEST com sete dígitos no XML.' }
  const cestRows = catalog.rows.filter(row => row.cest === input.cest)
  if (!cestRows.length) return { status: 'NO_MATCH', reason: 'Produto fora das tabelas de higiene/cosméticos e materiais de construção deste catálogo. Confira a MVA manualmente.' }
  const matches = cestRows.filter(row => row.ncmPrefixes.some(prefix => input.ncm!.startsWith(prefix)))
  if (!matches.length) return { status: 'CLASSIFICATION_CONFLICT', reason: 'O NCM não corresponde ao CEST nas tabelas consultadas. Revise a classificação antes de usar a MVA do catálogo.' }
  if (matches.length > 1) return { status: 'AMBIGUOUS', reason: 'Mais de uma MVA corresponde à classificação e à data. A seleção fiscal precisa de revisão.' }
  return { status: 'FOUND', row: matches[0]!, catalog }
}
