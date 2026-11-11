import { describe, expect, it } from 'vitest'
import type { ItemFiscalContext } from '@motor/contracts'
import { fiscalSaveFeedback } from '../src/renderer/fiscal-save-feedback'

const pending: ItemFiscalContext = { answers: {}, questions: [], xmlFacts: [], appliedBatchItems: 4,
  calculation: { status: 'PENDING_DATA', reason: 'Responsabilidade não confirmada.', inputs: [], steps: [] } }
describe('resultado da confirmação do cálculo', () => {
  it('não anuncia sucesso só porque as respostas foram aplicadas a quatro itens', () => {
    expect(fiscalSaveFeedback(pending)).toBe('Cálculo não concluído. Responsabilidade não confirmada.')
    expect(fiscalSaveFeedback(pending, true)).toBe('Guardado para revisão. Responsabilidade não confirmada.')
  })
  it('considera pendência de componente adicional antes de anunciar conclusão', () => {
    expect(fiscalSaveFeedback({ ...pending, calculation: { status: 'CALCULATED', inputs: [], steps: [], additionalComponents: [{ component: 'FCP_ST', status: 'PENDING_RULE', reason: 'Adicional em conflito.', inputs: [], steps: [] }] } })).toBe('Cálculo não concluído. Adicional em conflito.')
  })
  it('anuncia o grupo quando o cálculo está concluído', () => {
    expect(fiscalSaveFeedback({ ...pending, calculation: { status: 'CALCULATED', inputs: [], steps: [] } })).toContain('4 itens equivalentes do lote calculados')
  })
})
