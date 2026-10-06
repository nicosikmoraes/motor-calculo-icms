export type ReportSection =
  | 'SUMMARY'
  | 'ITEMS'
  | 'DIVERGENCES'
  | 'PENDENCIES'
  | 'RULES'
  | 'XML_ERRORS'

export interface ReportRequest {
  batchId: string
  destinationPath: string
  sections: readonly ReportSection[]
}

/** Porta para geradores; a exportação XLSX do snapshot está em generateExcelReport. */
export interface ReportGenerator {
  generate(request: ReportRequest): Promise<{ path: string }>
}

export * from './report-data'
export * from './consolidation'
export * from './excel-report'

export * from './monthly-consolidation'
