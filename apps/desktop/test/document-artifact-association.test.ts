import { describe, expect, it } from 'vitest'
import type { NormalizedDocumentArtifact } from '@motor/domain'
import { associateDocumentArtifacts } from '../src/main/document-artifact-association'

const key = '1'.repeat(44)
const artifact: NormalizedDocumentArtifact = {
  kind: 'EVENT', envelope: 'PROC_EVENTO_NFE', version: '1.00', accessKey: key,
  eventType: '110111', sequence: '1', statusCode: '135', responseMatches: true,
}
const source = { occurrenceId: 'occ-event', relativePath: 'evento.xml', contentHash: 'a'.repeat(64), artifact }
const time = '2026-10-01T00:00:00.000Z'

describe('associação técnica de protocolos e eventos', () => {
  it('associa por chave, independentemente da ordem dos arquivos', () => {
    const note = { id: 'doc', accessKey: key, contentConflict: false }
    expect(associateDocumentArtifacts('batch', time, [note], [source]).artifacts)
      .toMatchObject([{ documentId: 'doc', association: 'ASSOCIATED' }])
  })
  it('mantém órfãos e não escolhe entre notas conflitantes', () => {
    expect(associateDocumentArtifacts('batch', time, [], [source])).toMatchObject({
      artifacts: [{ association: 'ORPHAN' }], issues: [{ code: 'ARTIFACT_ORPHAN' }],
    })
    expect(associateDocumentArtifacts('batch', time,
      [{ id: 'a', accessKey: key, contentConflict: false }, { id: 'b', accessKey: key, contentConflict: false }],
      [source])).toMatchObject({
      artifacts: [{ association: 'AMBIGUOUS' }], issues: [{ code: 'ARTIFACT_AMBIGUOUS_DOCUMENT' }],
    })
  })
  it('sinaliza protocolo embutido com chave diferente e retorno de evento divergente', () => {
    const note = { id: 'doc', accessKey: key, contentConflict: false }
    const protocol: NormalizedDocumentArtifact = { kind: 'PROTOCOL', envelope: 'NFE_PROC', version: '4.00',
      accessKey: key, embeddedForAccessKey: '2'.repeat(44), statusCode: '100' }
    const result = associateDocumentArtifacts('batch', time, [note], [
      { ...source, artifact: protocol }, { ...source, occurrenceId: 'occ-response', artifact: { ...artifact, responseMatches: false } },
    ])
    expect(result.artifacts.map(({ association }) => association)).toEqual(['ORPHAN', 'ASSOCIATED'])
    expect(result.issues.map(({ code }) => code)).toEqual(['PROTOCOL_KEY_MISMATCH', 'EVENT_RESPONSE_MISMATCH'])
  })
})
