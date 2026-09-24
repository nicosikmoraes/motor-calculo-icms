import { describe, expect, it } from 'vitest'
import type { CreateBatchInput, SelectedSource } from '@motor/contracts'
import { copyCreateBatchInput, copySelectedSources } from '../src/preload/serializable-inputs'

function reactiveProxy<T extends object>(value: T): T {
  return new Proxy(value, {})
}

describe('fronteira serializável do IPC', () => {
  it('remove proxies reativos das fontes antes de chamar o Electron', () => {
    const source = reactiveProxy<SelectedSource>({ path: '/tmp/documentos.zip', kind: 'ZIP' })
    const sources = reactiveProxy([source])

    const copied = copySelectedSources(sources)

    expect(copied).toEqual([{ path: '/tmp/documentos.zip', kind: 'ZIP' }])
    expect(copied).not.toBe(sources)
    expect(copied[0]).not.toBe(source)
    expect(() => structuredClone(copied)).not.toThrow()
  })

  it('copia todo o comando de criação do lote para um objeto clonável', () => {
    const input = reactiveProxy<CreateBatchInput>({
      operationId: 'job-1',
      totalEntries: 1,
      assignments: reactiveProxy([reactiveProxy({ source: '/tmp/documentos.zip#nota.xml', companyId: 'empresa-1' })]),
      environmentCode: '2',
      sources: reactiveProxy([
        reactiveProxy<SelectedSource>({ path: '/tmp/documentos.zip', kind: 'ZIP' }),
      ]),
    })

    const copied = copyCreateBatchInput(input)

    expect(copied).toEqual({
      operationId: 'job-1',
      totalEntries: 1,
      assignments: [{ source: '/tmp/documentos.zip#nota.xml', companyId: 'empresa-1' }],
      environmentCode: '2',
      sources: [{ path: '/tmp/documentos.zip', kind: 'ZIP' }],
    })
    expect(() => structuredClone(copied)).not.toThrow()
  })
})
