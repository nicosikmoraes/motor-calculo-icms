import { describe, expect, it } from 'vitest'
import type { ItemFiscalQuestion } from '@motor/contracts'
import { fiscalReviewErrors } from '../src/renderer/fiscal-review-validation'

const rate: ItemFiscalQuestion = { field: 'stInternalRate', label: 'Alíquota interna', inputType: 'decimal', suggestedValue: '19.5' }
describe('erros por campo na revisão fiscal', () => {
  it('identifica somente a alíquota ausente e informa o valor disponível no XML', () => {
    expect(fiscalReviewErrors([rate], { stInternalRate: '' })).toEqual({ stInternalRate: 'Informe a alíquota interna de ICMS. Valor lido do XML: 19,5%.' })
  })
  it('aceita vírgula decimal e exige somente as perguntas visíveis', () => {
    expect(fiscalReviewErrors([rate], { stInternalRate: '19,5' })).toEqual({})
    expect(fiscalReviewErrors([], {})).toEqual({})
  })
  it('mostra a incompatibilidade de 1% incluindo FECOP e rejeita percentuais inválidos', () => {
    expect(fiscalReviewErrors([rate], { stInternalRate: '1', fcpStApplicableConfirmed: 'true', stInternalRateIncludesFcp: 'true' }).stInternalRate).toContain('maior que 2%')
    expect(fiscalReviewErrors([rate], { stInternalRate: 'abc' }).stInternalRate).toContain('entre 0 e 100%')
    expect(fiscalReviewErrors([rate], { stInternalRate: '101' }).stInternalRate).toContain('entre 0 e 100%')
    expect(fiscalReviewErrors([{ field: 'stMvaPercent', label: 'MVA', inputType: 'decimal' }], { stMvaPercent: '0' })).toEqual({})
  })
})
