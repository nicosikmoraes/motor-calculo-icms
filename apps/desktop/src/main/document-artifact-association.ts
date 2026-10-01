import { randomUUID } from 'node:crypto'
import { DocumentArtifactAssociationCode, type DocumentArtifactRecord } from '@motor/database'
import type { NormalizedDocumentArtifact } from '@motor/domain'
import { ImportIssueCode, ImportIssueMessage } from './import-issues'

export interface ArtifactNoteCandidate {
  id: string
  accessKey: string
  contentConflict: boolean
}
export interface ArtifactSource {
  occurrenceId: string
  relativePath: string
  contentHash: string
  artifact: NormalizedDocumentArtifact
}
export interface ArtifactAssociationResult {
  artifacts: readonly DocumentArtifactRecord[]
  issues: readonly { source: string; code: ImportIssueCode; message: ImportIssueMessage; occurrenceId: string }[]
}

/** Relaciona por chave após inventariar todas as notas; conflito nunca escolhe uma nota arbitrária. */
export function associateDocumentArtifacts(
  batchId: string, receivedAt: string,
  notes: readonly ArtifactNoteCandidate[], sources: readonly ArtifactSource[],
): ArtifactAssociationResult {
  const byKey = new Map<string, ArtifactNoteCandidate[]>()
  for (const note of notes) byKey.set(note.accessKey, [...(byKey.get(note.accessKey) ?? []), note])
  const artifacts: DocumentArtifactRecord[] = []
  const issues: ArtifactAssociationResult['issues'][number][] = []
  for (const source of sources) {
    const candidates = byKey.get(source.artifact.accessKey) ?? []
    const embeddedMismatch = source.artifact.embeddedForAccessKey !== undefined
      && source.artifact.embeddedForAccessKey !== source.artifact.accessKey
    const association = embeddedMismatch || candidates.length === 0
      ? DocumentArtifactAssociationCode.ORPHAN
      : candidates.length > 1 || candidates.some((note) => note.contentConflict)
        ? DocumentArtifactAssociationCode.AMBIGUOUS : DocumentArtifactAssociationCode.ASSOCIATED
    const documentId = association === DocumentArtifactAssociationCode.ASSOCIATED ? candidates[0]?.id : undefined
    if (association !== DocumentArtifactAssociationCode.ASSOCIATED) {
      issues.push({ source: source.relativePath, occurrenceId: source.occurrenceId,
        code: embeddedMismatch ? ImportIssueCode.PROTOCOL_KEY_MISMATCH
          : association === DocumentArtifactAssociationCode.AMBIGUOUS
            ? ImportIssueCode.ARTIFACT_AMBIGUOUS_DOCUMENT : ImportIssueCode.ARTIFACT_ORPHAN,
        message: embeddedMismatch ? ImportIssueMessage.PROTOCOL_KEY_MISMATCH
          : association === DocumentArtifactAssociationCode.AMBIGUOUS
            ? ImportIssueMessage.ARTIFACT_AMBIGUOUS_DOCUMENT : ImportIssueMessage.ARTIFACT_ORPHAN })
    }
    if (source.artifact.responseMatches === false) {
      issues.push({ source: source.relativePath, occurrenceId: source.occurrenceId,
        code: ImportIssueCode.EVENT_RESPONSE_MISMATCH, message: ImportIssueMessage.EVENT_RESPONSE_MISMATCH })
    }
    artifacts.push({ id: randomUUID(), batchId, occurrenceId: source.occurrenceId,
      ...(documentId ? { documentId } : {}), association, contentHash: source.contentHash,
      normalized: source.artifact, createdAt: receivedAt })
  }
  return { artifacts, issues }
}
