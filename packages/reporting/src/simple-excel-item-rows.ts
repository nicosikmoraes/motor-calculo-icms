import { documentaryTaxReview, itemCalculationComponents, type ConsolidationEvidence, type TaxComponent } from '@motor/contracts'
import { addDecimals, roundMoney } from '@motor/tax-engine'
import type { ReportData } from './report-data'

type Value = string | undefined
const key = (documentId: string, item: string) => JSON.stringify([documentId, item])
const names: Record<TaxComponent, string> = { ICMS: 'ICMS próprio', ICMS_ST: 'ICMS-ST', ICMS_ENTRY: 'Antecipação', FCP_ST: 'FCP-ST' }
const status = (entry?: ConsolidationEvidence) => entry?.status === 'EXCLUDED' ? 'Excluído'
  : entry?.status === 'UNSUPPORTED' ? 'Fora do escopo' : 'Pendente'

/** Uma linha por produto; o imposto próprio do fornecedor não é somado à ST/antecipação. */
export function buildSimpleExcelItemRows(report: ReportData): { rows: Value[][]; total?: Value[] } {
  const documents = new Map(report.documents.map(d => [d.id, d]))
  const items = new Set(report.items.map(i => key(i.documentId, i.itemNumber)))
  if (items.size !== report.items.length) throw new Error('Produto repetido no modelo do relatório.')
  const evidence = new Map<string, Map<TaxComponent, ConsolidationEvidence>>()
  for (const entry of report.consolidation?.evidence ?? []) {
    const id = key(entry.documentId, entry.itemNumber), component = entry.component ?? 'ICMS'
    if (!items.has(id) || !documents.has(entry.documentId)) throw new Error('Evidência referencia item ou documento ausente.')
    const components = evidence.get(id) ?? new Map<TaxComponent, ConsolidationEvidence>()
    if (components.has(component)) throw new Error('Componente repetido para o mesmo produto no relatório.')
    components.set(component, entry); evidence.set(id, components)
  }
  let declaredTotal = '0.00', icmsTotal = '0.00', fcpTotal = '0.00', partial = false
  const rows = report.items.map(item => {
    const document = documents.get(item.documentId)
    if (!document) throw new Error('Produto referencia documento ausente.')
    const entries = evidence.get(key(item.documentId, item.itemNumber))
    const entry = entries?.get('ICMS_ENTRY') ?? entries?.get('ICMS_ST') ?? entries?.get('ICMS')
    const documentary = entry?.status !== 'EXCLUDED' ? documentaryTaxReview(item.calculation) : undefined
    const entryEstimate = entry?.status !== 'EXCLUDED' && item.calculation.inputs.some(input=>input.name==='calculationPurpose'&&input.value==='INTERSTATE_ENTRY_ST_ESTIMATE')
    const component = entry?.component ?? 'ICMS'
    const memories = itemCalculationComponents(item.calculation)
    const memory = memories.find(m => (m.component ?? m.result?.component ?? 'ICMS') === component)
    const fcp = entries?.get('FCP_ST'), fcpMemory = memories.find(m => m.component === 'FCP_ST')
    const amount = !documentary && entry?.status === 'CALCULATED' && !memory?.reviewReason ? entry.calculatedIcms : undefined
    const fcpAmount = amount !== undefined && fcp?.status === 'CALCULATED' && !fcpMemory?.reviewReason ? fcp.calculatedIcms
      : !fcp && amount !== undefined && !fcpMemory && (!item.declaredFcpStAmount || item.declaredFcpStAmount === '0.00' || item.declaredFcpStAmount === '0') ? '0.00' : undefined
    const automaticXml = memory?.inputs.some(input => input.name === 'automaticXmlCalculation')
    let type = documentary ? documentary.title + ' — sem apuração' : entryEstimate && amount !== undefined ? 'ICMS-ST de entrada — estimativa por MVA' : amount !== undefined ? memory?.rule?.id === 'PR_CONSUMER_DIFAL_REVIEWED' ? 'DIFAL de uso/ativo' : automaticXml ? 'Conferência do XML' : names[component] : memory?.reviewReason ? 'Revisar' : status(entry)
    if (amount !== undefined && fcpAmount === undefined) type += ` — FCP ${status(fcp).toLowerCase()}`
    if (amount !== undefined && entry?.authorization === 'UNVERIFIED') type += ' (provisório)'
    if (entry?.environment === '2') type += ' (homologação)'
    if (amount === undefined || fcpAmount === undefined) partial = true
    if (item.declaredIcmsAmount !== undefined && /^\d+(?:\.\d{1,2})?$/.test(item.declaredIcmsAmount)) declaredTotal = addDecimals(declaredTotal, item.declaredIcmsAmount)
    else if (item.declaredIcmsAmount !== undefined) partial = true
    if (amount !== undefined) icmsTotal = addDecimals(icmsTotal, amount)
    if (fcpAmount !== undefined) fcpTotal = addDecimals(fcpTotal, fcpAmount)
    if (documentary?.reported.retainedStAmount !== undefined) type += ' · ST anterior informada: R$ ' + documentary.reported.retainedStAmount.replace('.', ',')
    if (documentary?.reported.retainedFcpStAmount !== undefined) type += ' · FCP anterior: R$ ' + documentary.reported.retainedFcpStAmount.replace('.', ',')
    return [document.number, item.itemNumber, item.description, item.declaredIcmsAmount ?? 'Sem destaque',
      documentary ? 'Não apurado' : amount ?? (memory?.reviewReason ? 'Revisar' : status(entry)), documentary ? 'Não apurado' : fcpAmount ?? (fcpMemory?.reviewReason ? 'Revisar' : status(fcp ?? entry)), type]
  })
  return { rows, ...(rows.length ? { total: [undefined, undefined, partial ? 'TOTAL PARCIAL' : 'TOTAL', roundMoney(declaredTotal), roundMoney(icmsTotal), roundMoney(fcpTotal), undefined] } : {}) }
}
