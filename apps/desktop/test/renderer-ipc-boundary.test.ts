import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import type { SelectedSource } from '@motor/contracts'
import { serializableSources } from '../src/renderer/serializable-sources'

describe('fontes enviadas da tela ao contextBridge', () => {
  it('transforma a lista reativa do Vue em dados clonáveis antes da chamada', () => {
    const selected = reactive<SelectedSource[]>([
      { path: '/tmp/documento.zip', kind: 'ZIP' },
      { path: '/tmp/nota.xml', kind: 'XML' },
    ])

    expect(() => structuredClone(selected)).toThrow()

    const copied = serializableSources(selected)
    expect(structuredClone(copied)).toEqual([
      { path: '/tmp/documento.zip', kind: 'ZIP' },
      { path: '/tmp/nota.xml', kind: 'XML' },
    ])
  })
})
