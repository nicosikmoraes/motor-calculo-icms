import { describe, expect, it } from 'vitest'
import { PARANA_ST_MVA_CATALOG, selectParanaStMva } from '../src'
const perfume = { operationDate: '2026-04-01', ncm: '33030010', cest: '2000700' }
describe('consulta da MVA publicada pela Resolução SEFA 1245/2025', () => {
  it('encontra perfumes pela classificação conjunta e conserva a fonte e a vigência', () => {
    const selection = selectParanaStMva(perfume)
    expect(selection.status).toBe('FOUND')
    if (selection.status !== 'FOUND') throw new Error('Regra não encontrada')
    expect(selection.row).toMatchObject({ originalMvaPercent: '47.77', article: 12, item: '7' })
    expect(selection.catalog.validFrom).toBe('2026-04-01')
    expect(selection.catalog.sourceUrl).toContain('codAto=381258')
    expect(selection.catalog.rows).toHaveLength(144)
  })
  it('aceita o prefixo NCM legal e exige CEST, sem presumir a incidência pela descrição do XML', () => {
    const selection = selectParanaStMva({ ...perfume, ncm: '39269090', cest: '1002000' })
    expect(selection.status).toBe('FOUND')
    if (selection.status === 'FOUND') expect(selection.row.originalMvaPercent).toBe('77.03')
    expect(selectParanaStMva({ operationDate: perfume.operationDate, ncm: perfume.ncm }).status).toBe('MISSING_CLASSIFICATION')
    expect(selectParanaStMva({ ...perfume, ncm: '33051000' }).status).toBe('CLASSIFICATION_CONFLICT')
    expect(selectParanaStMva({ ...perfume, cest: '2103900' }).status).toBe('NO_MATCH')
  })
  it('não retroage a tabela de abril de 2026 nem a aplica após a data conferida', () => {
    expect(selectParanaStMva({ ...perfume, operationDate: '2026-03-31' }).status).toBe('OUTSIDE_COVERAGE')
    expect(selectParanaStMva({ ...perfume, operationDate: '2026-10-12' }).status).toBe('FOUND')
    expect(selectParanaStMva({ ...perfume, operationDate: '2026-10-13' }).status).toBe('OUTSIDE_COVERAGE')
    expect(selectParanaStMva({ ...perfume, operationDate: '2026-02-30' }).status).toBe('INVALID_DATE')
  })
  it('preserva pendência quando duas linhas poderiam ser usadas', () => {
    expect(selectParanaStMva(perfume, { ...PARANA_ST_MVA_CATALOG,
      rows: [...PARANA_ST_MVA_CATALOG.rows, { ...PARANA_ST_MVA_CATALOG.rows[6]!, id: 'conflict' }] }).status).toBe('AMBIGUOUS')
  })
})
