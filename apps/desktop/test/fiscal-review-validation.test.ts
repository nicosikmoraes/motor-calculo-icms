import { describe, expect, it } from 'vitest'
import type { ItemFiscalQuestion } from '@motor/contracts'
import { fiscalReviewErrors } from '../src/renderer/fiscal-review-validation'

const rate: ItemFiscalQuestion = { field: 'stInternalRate', label: 'Alíquota interna', inputType: 'decimal', suggestedValue: '19.5' }
describe('erros por campo na revisão fiscal', () => {
  it('trata confirmações recusadas como impedimentos, sem transformar Não em aprovação', () => {
    const fields = ['stApplicableConfirmed', 'stBuyerLiabilityConfirmed', 'stClassificationConfirmed', 'stSimpleDeductionConfirmed', 'entryBaseConfirmed'] as const
    const questions = fields.map(field => ({ field, label: field, options: [{ value: 'true', label: 'Sim' }, { value: 'false', label: 'Não' }] }))
    const selections = Object.fromEntries(fields.map(field => [field, 'false']))
    expect(Object.keys(fiscalReviewErrors(questions, selections))).toEqual([...fields])
    expect(selections.stBuyerLiabilityConfirmed).toBe('false')
    expect(fiscalReviewErrors(questions, Object.fromEntries(fields.map(field => [field, 'true'])))).toEqual({})
  })
  it('permite respostas Não que representam opções válidas, como alíquota sem FCP', () => {
    expect(fiscalReviewErrors([{ field: 'stInternalRateIncludesFcp', label: 'Inclui adicional?' }, { field: 'constructionCompany', label: 'Construção?' }, { field: 'fcpStApplicableConfirmed', label: 'Aplica FCP?' }], { stInternalRateIncludesFcp: 'false', constructionCompany: 'false', fcpStApplicableConfirmed: 'false' })).toEqual({})
  })
  it('mostra o conflito apontado pela regra tanto em respostas Sim quanto Não', () => {
    const question: ItemFiscalQuestion = { field: 'fcpStApplicableConfirmed', label: 'Incidência', blockedAnswer: { value: 'false', reason: 'Resposta em conflito com a regra consultada.' } }
    expect(fiscalReviewErrors([question], { fcpStApplicableConfirmed: 'false' }).fcpStApplicableConfirmed).toContain('conflito')
    expect(fiscalReviewErrors([question], { fcpStApplicableConfirmed: 'true' })).toEqual({})
    expect(fiscalReviewErrors([{ ...question, blockedAnswer: { value: 'true', reason: 'Não coberto.' } }], { fcpStApplicableConfirmed: 'true' }).fcpStApplicableConfirmed).toBe('Não coberto.')
  })
  it('identifica somente a alíquota ausente e informa o valor disponível no XML', () => {
    expect(fiscalReviewErrors([rate], { stInternalRate: '' })).toEqual({ stInternalRate: 'Informe a alíquota interna de ICMS. Valor lido do XML: 19,5%.' })
  })
  it('aceita vírgula decimal e exige somente as perguntas visíveis', () => {
    expect(fiscalReviewErrors([rate], { stInternalRate: '19,5' })).toEqual({})
    expect(fiscalReviewErrors([], {})).toEqual({})
  })
  it('valida base em reais separadamente de percentuais', () => {
    const base:ItemFiscalQuestion={field:'entryBaseAmount',label:'Base legal',inputType:'decimal',suggestedValue:'5043.60'}
    expect(fiscalReviewErrors([base],{entryBaseAmount:'10000,25'})).toEqual({})
    expect(fiscalReviewErrors([base],{entryBaseAmount:'0'})).toEqual({})
    expect(fiscalReviewErrors([base],{entryBaseAmount:'-1'}).entryBaseAmount).toContain('reais')
    expect(fiscalReviewErrors([base],{}).entryBaseAmount).toContain('5043,60 reais')
  })
  it('mostra a incompatibilidade de 1% incluindo FECOP e rejeita percentuais inválidos', () => {
    expect(fiscalReviewErrors([rate], { stInternalRate: '1', fcpStApplicableConfirmed: 'true', stInternalRateIncludesFcp: 'true' }).stInternalRate).toContain('maior que 2%')
    expect(fiscalReviewErrors([rate], { stInternalRate: 'abc' }).stInternalRate).toContain('entre 0 e 100%')
    expect(fiscalReviewErrors([rate], { stInternalRate: '101' }).stInternalRate).toContain('entre 0 e 100%')
    expect(fiscalReviewErrors([{ field: 'stMvaPercent', label: 'MVA', inputType: 'decimal' }], { stMvaPercent: '0' })).toEqual({})
  })
})
