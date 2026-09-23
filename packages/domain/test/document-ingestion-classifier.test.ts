import { describe, expect, it } from 'vitest'
import { classifyDocumentIngestion, type NormalizedNfe } from '../src'

function document(overrides: Partial<NormalizedNfe> = {}): NormalizedNfe {
  return {
    kind: 'NFE',
    layoutVersion: '4.00',
    accessKey: '1'.repeat(44),
    model: '55',
    number: '1',
    series: '1',
    environmentCode: '1',
    issuer: { taxIdType: 'CNPJ', taxId: '11222333000181' },
    recipient: { taxIdType: 'CNPJ', taxId: '45723174000110' },
    items: [],
    declaredTotals: {},
    source: { format: 'NFE_XML_4_00', xmlPath: 'nfeProc/NFe' },
    ...overrides,
  }
}

describe('classificação da ingestão do documento', () => {
  it('aceita documento da empresa no ambiente confirmado e com ocorrência elegível', () => {
    expect(classifyDocumentIngestion(document(), '11.222.333/0001-81', '1', true)).toEqual({
      eligibleForProcessing: true,
      pendingReasons: [],
    })
  })

  it('aceita a empresa como emitente ou destinatária', () => {
    expect(classifyDocumentIngestion(document(), '45723174000110', '1', true).eligibleForProcessing)
      .toBe(true)
  })

  it('explica cumulativamente todas as causas de inelegibilidade', () => {
    expect(classifyDocumentIngestion(
      document({ environmentCode: '2' }),
      '04252011000110',
      '1',
      false,
    )).toEqual({
      eligibleForProcessing: false,
      pendingReasons: ['EMPRESA_DIVERGENTE', 'AMBIENTE_DIVERGENTE', 'OCORRENCIA_INELEGIVEL'],
    })
  })

  it('distingue ambiente ausente de ambiente divergente', () => {
    expect(classifyDocumentIngestion(
      document({ environmentCode: undefined }),
      '11222333000181',
      '1',
      true,
    ).pendingReasons).toEqual(['AMBIENTE_NAO_INFORMADO'])
  })
})
