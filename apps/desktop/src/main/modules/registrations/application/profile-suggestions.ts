import type { FiscalProfileSuggestion } from '@motor/contracts'
import type { FiscalProfileEvidence } from '@motor/domain'

function productKey(row: FiscalProfileEvidence): string {
  return JSON.stringify([row.supplierCnpj, row.productCode])
}

function signature(row: FiscalProfileEvidence): string {
  return JSON.stringify([row.ncm, row.cest ?? '', row.originCode ?? ''])
}

function validIssueDate(value: string | undefined): boolean {
  const date = value?.slice(0, 10)
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const parsed = new Date(`${date}T00:00:00.000Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
}

/** Sugere apenas grupos consistentes; nenhum dado tributário é inferido do NCM. */
export function buildFiscalProfileSuggestions(
  evidence: readonly FiscalProfileEvidence[],
): readonly FiscalProfileSuggestion[] {
  const byProduct = new Map<string, FiscalProfileEvidence[]>()
  for (const row of evidence) {
    if (!row.supplierCnpj || !/^\d{14}$/.test(row.supplierCnpj)
      || !row.productCode?.trim()) continue
    const key = productKey(row)
    const group = byProduct.get(key) ?? []
    group.push(row)
    byProduct.set(key, group)
  }

  const bySignature = new Map<string, FiscalProfileEvidence[]>()
  for (const rows of byProduct.values()) {
    if (rows.some((row) => !row.ncm?.trim() || !validIssueDate(row.issuedAt))
      || new Set(rows.map(signature)).size !== 1) continue
    const key = signature(rows[0]!)
    const group = bySignature.get(key) ?? []
    group.push(...rows)
    bySignature.set(key, group)
  }

  return [...bySignature].map(([key, rows]): FiscalProfileSuggestion => {
    const first = rows[0]!
    const products = [...new Map(rows.map((row) => [productKey(row), {
      supplierCnpj: row.supplierCnpj!, productCode: row.productCode!,
      ...(row.description ? { description: row.description } : {}),
    }])).values()].sort((left, right) =>
      left.supplierCnpj.localeCompare(right.supplierCnpj) || left.productCode.localeCompare(right.productCode))
    const name = `NCM ${first.ncm}${first.cest ? ` · CEST ${first.cest}` : ''}${first.originCode ? ` · origem ${first.originCode}` : ''}`
    return {
      key, name, validFrom: rows.map((row) => row.issuedAt!.slice(0, 10)).sort()[0]!,
      ncm: first.ncm!,
      ...(first.cest ? { cest: first.cest } : {}),
      ...(first.originCode ? { originCode: first.originCode } : {}),
      documentCount: new Set(rows.map((row) => row.documentId)).size,
      products,
    }
  }).sort((left, right) =>
    right.products.length - left.products.length || left.name.localeCompare(right.name))
}
