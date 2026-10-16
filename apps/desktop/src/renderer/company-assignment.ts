import type { BatchPreparedDocument, WorkspaceState } from '@motor/contracts'

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
