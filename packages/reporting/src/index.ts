export type ReportSection =
  | 'SUMMARY'
  | 'ITEMS'
  | 'PENDENCIES'
  | 'RULES'
  | 'XML_ERRORS'

export interface ReportRequest {
  batchId: string
  destinationPath: string
  sections: readonly ReportSection[]
}

/** Porta estável enquanto nomes, colunas e biblioteca XLSX seguem pendentes. */
export interface ReportGenerator {
  generate(request: ReportRequest): Promise<{ path: string }>
}
