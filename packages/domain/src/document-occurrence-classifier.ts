export interface DocumentOccurrenceIdentity {
  occurrenceId: string
  batchId: string
  order: number
  accessKey?: string
  contentHash: string
}

export type RepetitionClassification = 'ORIGINAL' | 'REPETIDA' | 'NAO_CLASSIFICAVEL'
export type ContentConflictClassification =
  | 'SEM_CONFLITO'
  | 'CONFLITO_CONTEUDO'
  | 'NAO_CLASSIFICAVEL'

export type OccurrencePolicyExclusionReason =
  | 'REPETIDA'
  | 'CONFLITO_CONTEUDO'
  | 'CHAVE_ACESSO_AUSENTE'

export interface ClassifiedDocumentOccurrence extends DocumentOccurrenceIdentity {
  repetition: RepetitionClassification
  contentConflict: ContentConflictClassification
  originalOccurrenceId?: string
  eligibleForTotalsByOccurrencePolicy: boolean
  exclusionReason?: OccurrencePolicyExclusionReason
}

interface PreparedOccurrence extends DocumentOccurrenceIdentity {
  normalizedAccessKey?: string
  normalizedContentHash: string
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function compareOccurrences(left: PreparedOccurrence, right: PreparedOccurrence): number {
  return (
    compareText(left.batchId, right.batchId) ||
    left.order - right.order ||
    compareText(left.occurrenceId, right.occurrenceId) ||
    compareText(left.normalizedContentHash, right.normalizedContentHash)
  )
}

function requiredText(value: string, field: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${field} deve ser informado.`)
  return normalized
}

function normalizeHash(value: string): string {
  const normalized = requiredText(value, 'contentHash').toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error('contentHash deve ser um SHA-256 hexadecimal com 64 caracteres.')
  }
  return normalized
}

function prepare(
  occurrences: readonly DocumentOccurrenceIdentity[],
): readonly PreparedOccurrence[] {
  const ids = new Set<string>()

  return occurrences.map((occurrence) => {
    const occurrenceId = requiredText(occurrence.occurrenceId, 'occurrenceId')
    if (ids.has(occurrenceId)) {
      throw new Error(`occurrenceId repetido no classificador: ${occurrenceId}.`)
    }
    ids.add(occurrenceId)

    if (!Number.isSafeInteger(occurrence.order) || occurrence.order < 1) {
      throw new Error(`order inválida para a ocorrência ${occurrenceId}.`)
    }

    const normalizedAccessKey = occurrence.accessKey?.trim()
    const normalizedContentHash = normalizeHash(occurrence.contentHash)

    return {
      ...occurrence,
      occurrenceId,
      batchId: requiredText(occurrence.batchId, 'batchId'),
      contentHash: normalizedContentHash,
      normalizedContentHash,
      ...(normalizedAccessKey ? { accessKey: normalizedAccessKey, normalizedAccessKey } : {}),
    }
  })
}

function groupBy<T>(values: readonly T[], keyOf: (value: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const value of values) {
    const key = keyOf(value)
    const group = groups.get(key)
    if (group) group.push(value)
    else groups.set(key, [value])
  }
  return groups
}

/**
 * Classifica ocorrências sem descartá-las. A elegibilidade retornada considera
 * apenas repetição e conflito; outras pendências fiscais continuam sendo
 * avaliadas pelas etapas seguintes.
 */
export function classifyDocumentOccurrences(
  occurrences: readonly DocumentOccurrenceIdentity[],
): readonly ClassifiedDocumentOccurrence[] {
  const prepared = [...prepare(occurrences)].sort(compareOccurrences)
  const result = new Map<string, ClassifiedDocumentOccurrence>()

  for (const occurrence of prepared.filter(({ normalizedAccessKey }) => !normalizedAccessKey)) {
    result.set(occurrence.occurrenceId, {
      occurrenceId: occurrence.occurrenceId,
      batchId: occurrence.batchId,
      order: occurrence.order,
      contentHash: occurrence.normalizedContentHash,
      repetition: 'NAO_CLASSIFICAVEL',
      contentConflict: 'NAO_CLASSIFICAVEL',
      eligibleForTotalsByOccurrencePolicy: false,
      exclusionReason: 'CHAVE_ACESSO_AUSENTE',
    })
  }

  const identifiable = prepared.filter(
    (occurrence): occurrence is PreparedOccurrence & { normalizedAccessKey: string } =>
      occurrence.normalizedAccessKey !== undefined,
  )
  const identityGroups = groupBy(
    identifiable,
    ({ batchId, normalizedAccessKey }) => `${batchId}\u0000${normalizedAccessKey}`,
  )

  for (const identityGroup of identityGroups.values()) {
    const contentGroups = groupBy(
      identityGroup,
      ({ normalizedContentHash }) => normalizedContentHash,
    )
    const hasConflict = contentGroups.size > 1

    for (const contentGroup of contentGroups.values()) {
      contentGroup.sort(compareOccurrences)
      const original = contentGroup[0]
      if (!original) continue

      for (const [index, occurrence] of contentGroup.entries()) {
        const repeated = index > 0
        result.set(occurrence.occurrenceId, {
          occurrenceId: occurrence.occurrenceId,
          batchId: occurrence.batchId,
          order: occurrence.order,
          accessKey: occurrence.normalizedAccessKey,
          contentHash: occurrence.normalizedContentHash,
          repetition: repeated ? 'REPETIDA' : 'ORIGINAL',
          contentConflict: hasConflict ? 'CONFLITO_CONTEUDO' : 'SEM_CONFLITO',
          ...(repeated ? { originalOccurrenceId: original.occurrenceId } : {}),
          eligibleForTotalsByOccurrencePolicy: !hasConflict && !repeated,
          ...(hasConflict
            ? { exclusionReason: 'CONFLITO_CONTEUDO' as const }
            : repeated
              ? { exclusionReason: 'REPETIDA' as const }
              : {}),
        })
      }
    }
  }

  return prepared.map((occurrence) => {
    const classified = result.get(occurrence.occurrenceId)
    if (!classified) throw new Error(`Ocorrência não classificada: ${occurrence.occurrenceId}.`)
    return classified
  })
}
