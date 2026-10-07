import { buildBatchConsolidation, fiscalPeriod, type ConsolidationDocument } from './consolidation'

export interface MonthlyDocument extends ConsolidationDocument {
  batchId: string
  contentHash: string
  receivedAt: string
  resolvedContentHash?: string | undefined
  preferredDocumentId?: string | undefined
  reviewReason?: string | undefined
}

/** Recebe todos os documentos da empresa: conflitos podem ter emissões em meses diferentes. */
export function buildMonthlyConsolidation(companyId: string, period: string, documents: readonly MonthlyDocument[], generatedAt?: string) {
  const byKey = new Map<string, MonthlyDocument[]>()
  for (const doc of documents.filter(d => d.companyId === companyId)) {
    const key = JSON.stringify([doc.environment, doc.accessKey])
    const entries = byKey.get(key) ?? []
    entries.push(doc); byKey.set(key, entries)
  }
  const exclusions = new Map<string, string>()
  for (const entries of byKey.values()) {
    entries.sort((a, b) => a.receivedAt.localeCompare(b.receivedAt) || a.batchId.localeCompare(b.batchId) || a.documentId.localeCompare(b.documentId))
    if (entries.length < 2) continue
    const resolvedHash = entries[0]?.resolvedContentHash && entries.every(d => d.resolvedContentHash === entries[0]!.resolvedContentHash) ? entries[0].resolvedContentHash : undefined
    if (new Set(entries.map(d => d.contentHash)).size > 1 && !resolvedHash) {
      for (const doc of entries) {
        const other = entries.find(d => d.contentHash !== doc.contentHash)!
        exclusions.set(doc.documentId, `Mesma chave com conteúdos diferentes entre lotes: revisar antes de totalizar. Outra ocorrência: lote ${other.batchId}, documento ${other.documentId}, emissão ${fiscalPeriod(other.issuedAt) ?? 'inválida'}.`)
      }
      continue
    }
    // Conserva a primeira ocorrência elegível após ordenar por recebimento e identidade.
    const selected = resolvedHash ? entries.filter(d => d.contentHash === resolvedHash) : entries
    const canonical = selected.find(d => !d.exclusionReason && d.documentId === d.preferredDocumentId) ?? selected.find(d => !d.exclusionReason)
    for (const doc of selected) if (doc !== canonical) {
      exclusions.set(doc.documentId, `Cópia repetida entre lotes.${canonical ? ` Referência: lote ${canonical.batchId}, documento ${canonical.documentId}.` : ' Nenhuma ocorrência elegível.'}`)
    }
    // Bloqueios documentais em qualquer cópia também protegem a ocorrência canônica.
    const blocking = selected.find(d => d.reviewReason)
    if (canonical && blocking) exclusions.set(canonical.documentId, `Outra ocorrência desta chave exige revisão: ${blocking.reviewReason}`)
  }
  return buildBatchConsolidation(`monthly:${companyId}:${period}`, documents
    .filter(d => d.companyId === companyId && fiscalPeriod(d.issuedAt) === period)
    .map(d => ({ ...d, ...(exclusions.has(d.documentId) ? { exclusionReason: [exclusions.get(d.documentId)!, d.reviewReason].filter(Boolean).join(' ') } : {}) })), generatedAt)
}
