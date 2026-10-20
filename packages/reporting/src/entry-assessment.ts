import { itemCalculationComponents, type ConsolidationEvidence, type ItemComponentCalculationSummary } from '@motor/contracts'
import { addDecimals, roundMoney } from '@motor/tax-engine'
import type { ReportData, ReportItem } from './report-data'

export interface EntryAssessmentRow {
  documentId: string; number: string; issuedAt?: string | undefined; ncm?: string | undefined; interstateRate?: string | undefined
  method: 'RATE_DIFFERENCE' | 'ICMS_ST'; amount: string; base: string; interstateAmount?: string; internalRate: string; internalAmount?: string; fcpAmount?: string
  itemNumbers: string[]; environment: string; authorization: string
}
export interface EntryAssessmentIssue { number: string; itemNumber: string; ncm?: string | undefined; reason: string }
const input = (memory: ItemComponentCalculationSummary, name: string) => memory.inputs.find(i => i.name === name)?.value
function entryMethod(item: ReportItem): string | undefined {
  try { return JSON.parse(input(item.calculation, 'fiscalAnswers') ?? '{}').entryMethod } catch { return undefined }
}

/** Somente obrigações de entrada confirmadas; ICMS próprio/retido do fornecedor não é débito novo. */
export function buildEntryAssessment(report: ReportData) {
  const documents = new Map(report.documents.map(d => [d.id, d]))
  const evidence = new Map<string, ConsolidationEvidence>()
  for (const e of report.consolidation?.evidence ?? []) evidence.set(JSON.stringify([e.documentId, e.itemNumber, e.component ?? 'ICMS']), e)
  const groups = new Map<string, EntryAssessmentRow>()
  const issues: EntryAssessmentIssue[] = []
  const noDebit: EntryAssessmentIssue[] = []
  for (const item of report.items) {
    const doc = documents.get(item.documentId)
    if (!doc || !item.cfop?.startsWith('6') || !doc.companyCnpj || doc.recipientTaxId !== doc.companyCnpj || doc.issuerTaxId === doc.companyCnpj) continue
    const method = entryMethod(item)
    if (method === 'NO_DEBIT') {
      const entry = evidence.get(JSON.stringify([item.documentId, item.itemNumber, 'ICMS_ENTRY']))
      const memory = item.calculation
      let confirmed = false
      try { confirmed = JSON.parse(input(memory, 'fiscalAnswers') ?? '{}').entryNoDebitConfirmed === true } catch { /* Mantém pendente. */ }
      const reason = memory.rule?.legalBasis.trim()
      if (confirmed && reason && memory.rule?.id === 'PR_ENTRY_NO_NEW_DEBIT' && memory.status === 'CALCULATED' && memory.result?.amount === '0.00'
        && entry?.status === 'CALCULATED' && entry.calculatedIcms === '0.00' && entry.environment === '1' && entry.authorization === 'WITH_PROTOCOL') {
        noDebit.push({ number: doc.number, itemNumber: item.itemNumber, ncm: item.ncm, reason }); continue
      }
      issues.push({ number: doc.number, itemNumber: item.itemNumber, ncm: item.ncm, reason: entry?.reasons.join(' ') || 'A ausência de novo débito exige confirmação, fundamento salvo e documento elegível em produção com protocolo.' }); continue
    }
    if (!['RATE_DIFFERENCE', 'ICMS_ST'].includes(method ?? '')) {
      issues.push({ number: doc.number, itemNumber: item.itemNumber, ncm: item.ncm, reason: item.entryReviewReasons?.length
        ? item.entryReviewReasons.join(' ') : 'Defina e confirme a obrigação do adquirente: antecipação sem ST ou ICMS-ST da entrada.' }); continue
    }
    const component = method === 'RATE_DIFFERENCE' ? 'ICMS_ENTRY' : 'ICMS_ST'
    const memory = itemCalculationComponents(item.calculation).find(m => (m.component ?? m.result?.component) === component)
    const entry = evidence.get(JSON.stringify([item.documentId, item.itemNumber, component]))
    const fcp = itemCalculationComponents(item.calculation).find(m => m.component === 'FCP_ST')
    const fcpEntry = evidence.get(JSON.stringify([item.documentId, item.itemNumber, 'FCP_ST']))
    if (!memory?.result || memory.status !== 'CALCULATED' || entry?.status !== 'CALCULATED' || entry.calculatedIcms !== memory.result.amount || memory.reviewReason
      || (method === 'ICMS_ST' && fcp && (fcp.status !== 'CALCULATED' || fcp.reviewReason))
      || (fcp && fcpEntry?.status !== 'CALCULATED')
      || entry.environment !== '1' || entry.authorization !== 'WITH_PROTOCOL') {
      issues.push({ number: doc.number, itemNumber: item.itemNumber, ncm: item.ncm,
        reason: entry?.reasons.join(' ') || memory?.reviewReason || memory?.reason || fcp?.reason || 'A obrigação exige cálculo salvo, ambiente de produção e protocolo associado.' }); continue
    }
    const rate = method === 'RATE_DIFFERENCE' ? input(memory, 'interstateRate') : input(memory, 'ownOperationRate')
    const key = JSON.stringify([doc.id, method, item.ncm, rate, memory.result.rate])
    const group: EntryAssessmentRow = groups.get(key) ?? { documentId: doc.id, number: doc.number, issuedAt: doc.issuedAt, ncm: item.ncm,
      interstateRate: rate, method: method as EntryAssessmentRow['method'], amount: '0.00', base: '0.00', internalRate: memory.result.rate,
      itemNumbers: [], environment: entry.environment, authorization: entry.authorization }
    group.amount = addDecimals(group.amount, component === 'ICMS_ENTRY' ? entry.exactCalculatedIcms ?? memory.result.amount : memory.result.amount)
    group.base = roundMoney(addDecimals(group.base, memory.result.base))
    if (method === 'ICMS_ST' && fcp?.result) group.fcpAmount = roundMoney(addDecimals(group.fcpAmount ?? '0', fcp.result.amount))
    if (method === 'RATE_DIFFERENCE') {
      const own = memory.steps.find(s => s.name === 'ICMS interestadual da entrada')?.result
      const internal = memory.steps.find(s => s.name === 'ICMS interno da entrada')?.result
      if (own !== undefined) group.interstateAmount = addDecimals(group.interstateAmount ?? '0', own)
      if (internal !== undefined) group.internalAmount = addDecimals(group.internalAmount ?? '0', internal)
    }
    group.itemNumbers.push(item.itemNumber); groups.set(key, group)
  }
  const rows = [...groups.values()].sort((a,b) => (a.issuedAt ?? '').localeCompare(b.issuedAt ?? '') || a.number.localeCompare(b.number,undefined,{numeric:true}) || (a.ncm ?? '').localeCompare(b.ncm ?? '') || (a.interstateRate ?? '').localeCompare(b.interstateRate ?? ''))
  const difal = rows.filter(r => r.method === 'RATE_DIFFERENCE'), st = rows.filter(r => r.method === 'ICMS_ST')
  const subtotal = (selected: EntryAssessmentRow[]) => selected.length ? roundMoney(addDecimals(...selected.map(r => r.amount))) : undefined
  const differenceTotal = subtotal(difal), stTotal = subtotal(st)
  const fcpTotal = st.some(r => r.fcpAmount !== undefined) ? roundMoney(addDecimals(...st.map(r => r.fcpAmount ?? '0'))) : undefined
  return { difal, st, issues, noDebit, differenceTotal, stTotal, fcpTotal,
    total: !issues.length && (rows.length || noDebit.length) ? roundMoney(addDecimals(differenceTotal ?? '0', stTotal ?? '0', fcpTotal ?? '0')) : undefined,
    partial: issues.length > 0 }
}
