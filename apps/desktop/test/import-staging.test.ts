import { access } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import type { NormalizedNfe } from '@motor/domain'
import { ImportStaging } from '../src/main/import-staging'

const note: NormalizedNfe = {
  kind: 'NFE', layoutVersion: '4.00', model: '55', accessKey: '1'.repeat(44),
  number: '1', series: '1', issuer: { taxIdType: 'CNPJ', taxId: '11222333000181' },
  items: [], declaredTotals: {}, source: { format: 'NFE_XML_4_00', xmlPath: 'NFe.infNFe' },
}

describe('estágio temporário da importação', () => {
  it('libera a nota da memória e remove o arquivo após a operação', async () => {
    const staging = await ImportStaging.create()
    let path = ''
    try {
      path = await staging.stage(note)
      expect(staging.read(path)).toEqual(note)
      const artifact = { kind: 'EVENT' as const, envelope: 'EVENTO' as const, version: '1.00',
        accessKey: '1'.repeat(44), eventType: '110110', sequence: '1' }
      expect(staging.readArtifact(await staging.stageArtifact(artifact))).toEqual(artifact)
      await expect(access(path)).resolves.toBeUndefined()
    } finally {
      await staging.dispose()
    }
    await expect(access(path)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
