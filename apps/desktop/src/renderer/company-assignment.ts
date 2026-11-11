import type { BatchCompanyCandidate, BatchPreparedDocument, WorkspaceState } from '@motor/contracts'

function containsCompany(document: BatchPreparedDocument, cnpj: string): boolean {
  return document.issuerCnpj === cnpj || document.recipientCnpj === cnpj
}

/** A empresa analisada pode aparecer em qualquer lado do XML, inclusive em devoluções. */
export function inferBatchCompanyCnpj(documents: readonly BatchPreparedDocument[], requestedCnpj = ''): string {
  if (requestedCnpj && documents.some(document => containsCompany(document, requestedCnpj))) return requestedCnpj
  const first = documents[0]
  if (!first) return ''
  const common = [...new Set([first.issuerCnpj, first.recipientCnpj].filter((cnpj): cnpj is string => !!cnpj))]
    .filter(cnpj => documents.every(document => containsCompany(document, cnpj)))
  return common.length === 1 ? common[0]! : ''
}

/** O contexto do lote prevalece sobre sugestões fiscais; exceções explícitas são preservadas. */
export function assignBatchCompanies(
  documents: readonly BatchPreparedDocument[],
  companies: WorkspaceState['companies'],
  batchCompanyCnpj = '',
  manualAssignments: Readonly<Record<string, string>> = {},
): Record<string, string> {
  const activeCompanies = companies.filter(company => company.active)
  return Object.fromEntries(documents.map(document => {
    if (Object.hasOwn(manualAssignments, document.source)) {
      const selected = activeCompanies.find(company => company.id === manualAssignments[document.source]
        && containsCompany(document, company.cnpj))
      return [document.source, selected?.id ?? '']
    }
    if (batchCompanyCnpj) {
      const selected = containsCompany(document, batchCompanyCnpj)
        ? activeCompanies.find(company => company.cnpj === batchCompanyCnpj) : undefined
      return [document.source, selected?.id ?? '']
    }
    return [document.source, suggestCompanyForDocument(document, companies)]
  }))
}

/** Não cria fornecedores na carteira nem oferece duplicar um cadastro inativo. */
export function pendingCompanyRegistrations(
  documents: readonly BatchPreparedDocument[],
  candidates: readonly BatchCompanyCandidate[],
  companies: WorkspaceState['companies'],
  assignments: Readonly<Record<string, string>>,
  batchCompanyCnpj = '',
): readonly BatchCompanyCandidate[] {
  return candidates.filter(candidate => !companies.some(company => company.cnpj === candidate.cnpj)
    && documents.some(document => !assignments[document.source] && containsCompany(document, candidate.cnpj)
      && (!batchCompanyCnpj || !containsCompany(document, batchCompanyCnpj) || candidate.cnpj === batchCompanyCnpj)))
}

export function suggestCompanyForDocument(
  document: BatchPreparedDocument,
  companies: WorkspaceState['companies'],
  previousId = '',
): string {
  const options = companies.filter((company) =>
    company.active && (company.cnpj === document.issuerCnpj || company.cnpj === document.recipientCnpj),
  )
  if (options.some((company) => company.id === previousId)) return previousId
  if (document.suggestedCompanyCnpj) return options.find(company => company.cnpj === document.suggestedCompanyCnpj)?.id ?? ''
  // Com as duas partes cadastradas, o XML não determina qual empresa o usuário
  // está conferindo. Escolher o emitente aqui pode trocar uma compra por venda.
  if (options.length > 1) return ''
  return options[0]?.id ?? ''
}
