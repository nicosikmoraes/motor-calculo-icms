import { describe, expect, it } from 'vitest'
import { reactive } from 'vue'
import type { SelectedSource } from '@motor/contracts'
import { serializableSources } from '../src/renderer/serializable-sources'
import { desktopErrorMessage } from '../src/renderer/error-messages'

describe('mensagens de erro da ponte Electron', () => {
  it('identifica o conflito real de salvamento sem exibir o nome técnico do método', () => {
    const cause = new Error("Error invoking remote method 'batch:save-item-fiscal-answers': Error: As respostas foram alteradas em outra tela. Reabra as perguntas antes de salvar.")
    expect(desktopErrorMessage(cause, 'Falha ao salvar.')).toBe('As respostas foram alteradas em outra tela. Reabra as perguntas antes de salvar.')
    expect(desktopErrorMessage(new Error('Escolha uma resposta válida.'), 'Falha ao salvar.')).toBe('Escolha uma resposta válida.')
    expect(desktopErrorMessage(undefined, 'Falha ao salvar.')).toBe('Falha ao salvar.')
  })
})

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
