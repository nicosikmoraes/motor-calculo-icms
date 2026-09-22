import { describe, expect, it } from 'vitest'
import {
  classifyDocumentOccurrences,
  type DocumentOccurrenceIdentity,
} from '../src'

const keyA = '1'.repeat(44)
const keyB = '2'.repeat(44)
const hashA = 'a'.repeat(64)
const hashB = 'b'.repeat(64)
const hashC = 'c'.repeat(64)

function occurrence(
  values: Partial<DocumentOccurrenceIdentity> & Pick<DocumentOccurrenceIdentity, 'occurrenceId'>,
): DocumentOccurrenceIdentity {
  return {
    batchId: 'lote-1',
    order: 1,
    accessKey: keyA,
    contentHash: hashA,
    ...values,
  }
}

describe('classificação de ocorrências de documentos', () => {
  it('mantém notas de chaves diferentes como originais elegíveis', () => {
    const result = classifyDocumentOccurrences([
      occurrence({ occurrenceId: 'oc-1' }),
      occurrence({ occurrenceId: 'oc-2', order: 2, accessKey: keyB, contentHash: hashB }),
    ])

    expect(result).toEqual([
      expect.objectContaining({
        occurrenceId: 'oc-1',
        repetition: 'ORIGINAL',
        contentConflict: 'SEM_CONFLITO',
        eligibleForTotalsByOccurrencePolicy: true,
      }),
      expect.objectContaining({
        occurrenceId: 'oc-2',
        repetition: 'ORIGINAL',
        contentConflict: 'SEM_CONFLITO',
        eligibleForTotalsByOccurrencePolicy: true,
      }),
    ])
  })

  it('marca como repetida a ocorrência posterior com mesma chave e hash', () => {
    const result = classifyDocumentOccurrences([
      occurrence({ occurrenceId: 'copia', order: 2 }),
      occurrence({ occurrenceId: 'original', order: 1 }),
    ])

    expect(result).toEqual([
      expect.objectContaining({
        occurrenceId: 'original',
        repetition: 'ORIGINAL',
        eligibleForTotalsByOccurrencePolicy: true,
      }),
      expect.objectContaining({
        occurrenceId: 'copia',
        repetition: 'REPETIDA',
        originalOccurrenceId: 'original',
        eligibleForTotalsByOccurrencePolicy: false,
        exclusionReason: 'REPETIDA',
      }),
    ])
  })

  it('exclui dos totais todas as ocorrências da chave com conteúdos conflitantes', () => {
    const result = classifyDocumentOccurrences([
      occurrence({ occurrenceId: 'conteudo-a', contentHash: hashA }),
      occurrence({ occurrenceId: 'conteudo-b', order: 2, contentHash: hashB }),
    ])

    expect(result).toEqual([
      expect.objectContaining({
        occurrenceId: 'conteudo-a',
        repetition: 'ORIGINAL',
        contentConflict: 'CONFLITO_CONTEUDO',
        eligibleForTotalsByOccurrencePolicy: false,
        exclusionReason: 'CONFLITO_CONTEUDO',
      }),
      expect.objectContaining({
        occurrenceId: 'conteudo-b',
        repetition: 'ORIGINAL',
        contentConflict: 'CONFLITO_CONTEUDO',
        eligibleForTotalsByOccurrencePolicy: false,
        exclusionReason: 'CONFLITO_CONTEUDO',
      }),
    ])
  })

  it('preserva repetições dentro de cada conteúdo de uma chave conflitante', () => {
    const result = classifyDocumentOccurrences([
      occurrence({ occurrenceId: 'a-2', order: 2, contentHash: hashA }),
      occurrence({ occurrenceId: 'b-2', order: 4, contentHash: hashB }),
      occurrence({ occurrenceId: 'a-1', order: 1, contentHash: hashA }),
      occurrence({ occurrenceId: 'b-1', order: 3, contentHash: hashB }),
    ])

    expect(result.map(({ occurrenceId, repetition, originalOccurrenceId, contentConflict }) => ({
      occurrenceId,
      repetition,
      originalOccurrenceId,
      contentConflict,
    }))).toEqual([
      { occurrenceId: 'a-1', repetition: 'ORIGINAL', contentConflict: 'CONFLITO_CONTEUDO' },
      {
        occurrenceId: 'a-2',
        repetition: 'REPETIDA',
        originalOccurrenceId: 'a-1',
        contentConflict: 'CONFLITO_CONTEUDO',
      },
      { occurrenceId: 'b-1', repetition: 'ORIGINAL', contentConflict: 'CONFLITO_CONTEUDO' },
      {
        occurrenceId: 'b-2',
        repetition: 'REPETIDA',
        originalOccurrenceId: 'b-1',
        contentConflict: 'CONFLITO_CONTEUDO',
      },
    ])
    expect(result.every(({ eligibleForTotalsByOccurrencePolicy }) => !eligibleForTotalsByOccurrencePolicy)).toBe(true)
  })

  it('trata a mesma chave em lotes diferentes como novas ocorrências originais', () => {
    const result = classifyDocumentOccurrences([
      occurrence({ occurrenceId: 'lote-2-nota', batchId: 'lote-2' }),
      occurrence({ occurrenceId: 'lote-1-nota', batchId: 'lote-1' }),
    ])

    expect(result.map(({ batchId, repetition, eligibleForTotalsByOccurrencePolicy }) => ({
      batchId,
      repetition,
      eligibleForTotalsByOccurrencePolicy,
    }))).toEqual([
      { batchId: 'lote-1', repetition: 'ORIGINAL', eligibleForTotalsByOccurrencePolicy: true },
      { batchId: 'lote-2', repetition: 'ORIGINAL', eligibleForTotalsByOccurrencePolicy: true },
    ])
  })

  it('não infere identidade fiscal quando a chave está ausente', () => {
    const result = classifyDocumentOccurrences([
      occurrence({ occurrenceId: 'sem-chave-1', accessKey: undefined }),
      occurrence({ occurrenceId: 'sem-chave-2', order: 2, accessKey: undefined }),
    ])

    expect(result).toEqual([
      expect.objectContaining({
        occurrenceId: 'sem-chave-1',
        repetition: 'NAO_CLASSIFICAVEL',
        contentConflict: 'NAO_CLASSIFICAVEL',
        eligibleForTotalsByOccurrencePolicy: false,
        exclusionReason: 'CHAVE_ACESSO_AUSENTE',
      }),
      expect.objectContaining({
        occurrenceId: 'sem-chave-2',
        repetition: 'NAO_CLASSIFICAVEL',
        contentConflict: 'NAO_CLASSIFICAVEL',
        eligibleForTotalsByOccurrencePolicy: false,
      }),
    ])
  })

  it('produz resultado determinístico independentemente da ordem de entrada', () => {
    const input = [
      occurrence({ occurrenceId: 'terceira', order: 3, contentHash: hashC }),
      occurrence({ occurrenceId: 'primeira', order: 1, contentHash: hashA }),
      occurrence({ occurrenceId: 'segunda', order: 2, contentHash: hashA }),
    ]

    expect(classifyDocumentOccurrences([...input].reverse())).toEqual(
      classifyDocumentOccurrences(input),
    )
  })

  it('recusa identidade duplicada e hash que não seja SHA-256', () => {
    expect(() =>
      classifyDocumentOccurrences([
        occurrence({ occurrenceId: 'repetido' }),
        occurrence({ occurrenceId: 'repetido', order: 2 }),
      ]),
    ).toThrow(/occurrenceId repetido/)

    expect(() =>
      classifyDocumentOccurrences([
        occurrence({ occurrenceId: 'hash-invalido', contentHash: 'abc' }),
      ]),
    ).toThrow(/SHA-256/)
  })
})
