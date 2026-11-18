import type { NormalizedNfeItem } from '@motor/domain'
import { paranaStMvaCandidates } from '@motor/tax-engine'

export const normalizedProductDescription = (value?: string) => (value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/[^A-Z0-9]+/g,' ').trim()
/** Família estreita para a revisão dos lábios; demais produtos exigem descrição idêntica. */
export function classificationProductFamily(item: NormalizedNfeItem): string {
  const description = normalizedProductDescription(item.description)
  if (item.ncm === '33041000' && /\b(GLOSS|BATOM|LIP)\b|BRILHO LABIAL/.test(description)) return 'MAKEUP_LIPS'
  return description
}
export function classificationCandidates(date: string | undefined, item: NormalizedNfeItem) {
  return paranaStMvaCandidates(date,item.ncm).map(row=>({...row,suggested:row.cest==='2000900' && classificationProductFamily(item)==='MAKEUP_LIPS'}))
    .sort((a,b)=>Number(b.suggested)-Number(a.suggested))
}
