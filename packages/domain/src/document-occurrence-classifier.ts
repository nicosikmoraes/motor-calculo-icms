import { AppError, AppErrorCode } from './app-error'
export interface DocumentOccurrenceIdentity {
  occurrenceId: string
  batchId: string
  order: number
  accessKey?: string
  contentHash: string
}

export enum RepetitionClassificationCode {
  ORIGINAL = 'ORIGINAL',
  REPETIDA = 'REPETIDA',
  NAO_CLASSIFICAVEL = 'NAO_CLASSIFICAVEL',
}
export type RepetitionClassification = `${RepetitionClassificationCode}`
export enum ContentConflictClassificationCode {
  SEM_CONFLITO = 'SEM_CONFLITO',
  CONFLITO_CONTEUDO = 'CONFLITO_CONTEUDO',
  NAO_CLASSIFICAVEL = 'NAO_CLASSIFICAVEL',
}
export type ContentConflictClassification = `${ContentConflictClassificationCode}`
export enum OccurrencePolicyExclusionReasonCode {
  REPETIDA = 'REPETIDA',
  CONFLITO_CONTEUDO = 'CONFLITO_CONTEUDO',
  CHAVE_ACESSO_AUSENTE = 'CHAVE_ACESSO_AUSENTE',
}
export type OccurrencePolicyExclusionReason = `${OccurrencePolicyExclusionReasonCode}`
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
  if (!normalized) throw new AppError(AppErrorCode.REQUIRED_FIELD, { field })
  return normalized
}

function normalizeHash(value: string): string {
  const normalized = requiredText(value, 'contentHash').toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new AppError(AppErrorCode.INVALID_CONTENT_HASH)
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
      throw new AppError(AppErrorCode.DUPLICATE_OCCURRENCE_ID, { id: occurrenceId })
    }
    ids.add(occurrenceId)

    if (!Number.isSafeInteger(occurrence.order) || occurrence.order < 1) {
      throw new AppError(AppErrorCode.INVALID_OCCURRENCE_ORDER, { id: occurrenceId })
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
    if (!classified) throw new AppError(AppErrorCode.UNCLASSIFIED_OCCURRENCE, { id: occurrence.occurrenceId })
    return classified
  })
}
