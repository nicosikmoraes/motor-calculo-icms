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
  const issuer = options.find((company) => company.cnpj === document.issuerCnpj)
  if (issuer) return issuer.id
  return document.issuerCnpj ? '' : (options[0]?.id ?? '')
}
