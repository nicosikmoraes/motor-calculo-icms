import { consolidationEvidenceDivergent, type BatchConsolidation, type ConsolidationCounts, type ConsolidationEvidence, type ConsolidationGroup } from '@motor/contracts'
import { addDecimals, roundMoney, compareDeclared, compareDecimals, type CalculationComponentMemory, type CalculationMemory } from '@motor/tax-engine'

export interface ConsolidationDocument {
  batchId?: string

  documentId: string; accessKey: string; documentNumber: string
  companyId?: string | undefined; companyName?: string | undefined; issuedAt?: string | undefined
  perspective: ConsolidationGroup['perspective']; environment: ConsolidationGroup['environment']
  authorization: ConsolidationGroup['authorization']; exclusionReason?: string | undefined
  runId?: string | undefined; engineVersion?: string | undefined
  items: readonly { itemNumber: string; cfop?: string | undefined; exclusionReason?: string | undefined; declaredIcms?: string | undefined; declaredIcmsSt?: string | undefined; declaredFcpSt?: string | undefined; declaredFcpStBase?: string | undefined; declaredFcpStRate?: string | undefined; memory?: CalculationMemory | undefined }[]
}
const counts = (): ConsolidationCounts => ({ documents: 0, items: 0, calculated: 0, pending: 0, unsupported: 0,
  excluded: 0, declaredMissing: 0, declaredInvalid: 0, deferredMissing: 0, divergentItems: 0,
  withinToleranceItems: 0, comparableItems: 0 })
function money(value?: string): string | undefined {
  if (value === undefined || !/^\d+(?:\.\d{1,2})?$/.test(value)) return undefined
  try { return roundMoney(value) } catch { return undefined }
}
function zeroFcpDeclaration(item: ConsolidationDocument['items'][number]): boolean {
  try { return money(item.declaredFcpSt ?? '0') === '0.00' && money(item.declaredFcpStBase ?? '0') === '0.00'
    && compareDecimals(item.declaredFcpStRate ?? '0', '0') === 0 } catch { return false }
}
/** O mês civil do XML é preservado, inclusive nos limites de fuso horário. */
export function fiscalPeriod(value?: string): string | undefined {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/)
  if (!match) return undefined
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3])
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return undefined
  return `${match[1]}-${match[2]}`
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) }
  return value
}
/** Consolidação de conferência: usa exclusivamente as memórias persistidas, sem apurar crédito. */
export function buildBatchConsolidation(batchId: string, documents: readonly ConsolidationDocument[], generatedAt = new Date().toISOString()): BatchConsolidation {
  const physical: { item: ConsolidationDocument['items'][number]; entries: ConsolidationEvidence[] }[] = []
  const groupDocuments = new Map<string, Set<string>>()
  const groups = new Map<string, ConsolidationGroup>(), evidence: ConsolidationEvidence[] = []
  const duplicates = new Map<string, number>()
  for (const doc of documents) {
    const key = JSON.stringify([doc.companyId, doc.environment, doc.accessKey])
    if (!doc.exclusionReason && doc.accessKey) duplicates.set(key, (duplicates.get(key) ?? 0) + 1)
  }
  for (const doc of documents) {
    const period = fiscalPeriod(doc.issuedAt)
    const duplicate = (duplicates.get(JSON.stringify([doc.companyId, doc.environment, doc.accessKey])) ?? 0) > 1
    const exclusion = doc.exclusionReason ?? (duplicate ? 'Chave repetida: revisar as ocorrências antes de totalizar.' : undefined)
      ?? (!doc.companyId ? 'Empresa não identificada.' : !period ? 'Data de emissão ausente ou inválida.'
        : doc.perspective === 'UNDETERMINED' ? 'Empresa não identificada como emitente ou destinatária exclusiva.'
          : doc.environment === 'UNKNOWN' ? 'Ambiente não identificado.' : undefined)
    for (const item of doc.items) {
      const componentEvidence: ConsolidationEvidence[] = []
      physical.push({ item, entries: componentEvidence })
      const components: (CalculationComponentMemory | undefined)[] = [item.memory, ...(item.memory?.additionalComponents ?? [])]
      if ([item.declaredFcpSt, item.declaredFcpStBase, item.declaredFcpStRate].some(value => value !== undefined)
        && !(zeroFcpDeclaration(item) && item.memory?.inputs.some(input => input.name === 'fcpStApplicableConfirmed' && input.value === 'false'))
        && !components.some(memory => memory?.component === 'FCP_ST')) components.push({
        schemaVersion: 1, component: 'FCP_ST', status: 'PENDING_DATA', inputs: [], steps: [], reason: 'FCP-ST declarado no XML exige conferência própria.',
        declared: { ...(item.declaredFcpSt !== undefined ? { amount: item.declaredFcpSt } : {}),
          ...(item.declaredFcpStBase !== undefined ? { base: item.declaredFcpStBase } : {}),
          ...(item.declaredFcpStRate !== undefined ? { rate: item.declaredFcpStRate } : {}) } })
      for (const memory of components) {
        const component = memory?.component ?? memory?.result?.component ?? (item.declaredIcmsSt !== undefined ? 'ICMS_ST' : 'ICMS')
        const key = JSON.stringify([doc.companyId, period, doc.environment, doc.perspective, doc.authorization, component])
        let group = groups.get(key)
        if (!group) {
          group = { component, ...(doc.companyId ? { companyId: doc.companyId } : {}), ...(doc.companyName ? { companyName: doc.companyName } : {}), ...(period ? { period } : {}), environment: doc.environment,
            perspective: doc.perspective, authorization: doc.authorization, purchaseCredit: 'NOT_CALCULATED', counts: counts(),
            totals: { calculatedBase: '0.00', calculatedIcms: '0.00', declaredIcms: '0.00', deferredIcms: '0.00',
              comparedCalculatedIcms: '0.00', comparedDeclaredIcms: '0.00', difference: '0.00', absoluteDifferences: '0.00' } }
          groups.set(key, group); groupDocuments.set(key, new Set())
        }
        const seen = groupDocuments.get(key)!
        if (!seen.has(doc.documentId)) { group.counts.documents++; seen.add(doc.documentId) }
        group.counts.items++
        const sum = (field: keyof ConsolidationGroup['totals'], amount: string) => { group!.totals[field] = roundMoney(addDecimals(group!.totals[field], amount)) }
        const entry: ConsolidationEvidence = { component, documentId: doc.documentId, ...(doc.batchId ? { batchId: doc.batchId } : {}), accessKey: doc.accessKey, documentNumber: doc.documentNumber,
          itemNumber: item.itemNumber, ...(doc.companyId ? { companyId: doc.companyId } : {}), ...(period ? { period } : {}), environment: doc.environment,
          perspective: doc.perspective, authorization: doc.authorization, status: 'PENDING', reasons: [], ...(doc.runId ? { runId: doc.runId } : {}), ...(doc.engineVersion ? { engineVersion: doc.engineVersion } : {}) }
        if (exclusion || item.exclusionReason) { entry.status = 'EXCLUDED'; entry.reasons = [exclusion ?? item.exclusionReason!]; group.counts.excluded++; evidence.push(entry); componentEvidence.push(entry); continue }
        const originalDeclared = component === 'FCP_ST' ? item.declaredFcpSt : component === 'ICMS_ST' ? item.declaredIcmsSt : item.declaredIcms
        const declared = money(originalDeclared)
        if (declared !== undefined) { entry.declaredIcms = declared; sum('declaredIcms', declared) }
        else if (originalDeclared === undefined) group.counts.declaredMissing++
        else group.counts.declaredInvalid++
        const base = money(memory?.result?.base), amount = money(memory?.result?.amount)
        if (memory?.status === 'CALCULATED' && (component !== 'FCP_ST' || item.memory?.status === 'CALCULATED') && base !== undefined && amount !== undefined) {
          entry.status = 'CALCULATED';
          if (memory.comparisons) entry.comparisons = memory.comparisons
          entry.calculatedIcms = amount; group.counts.calculated++
          sum('calculatedBase', base); sum('calculatedIcms', amount)
          const deferred = money(memory.deferredAmount ?? memory.steps.find(step => step.name === 'ICMS diferido')?.result)
          if (deferred !== undefined) { entry.deferredIcms = deferred; sum('deferredIcms', deferred) }
          else if (component === 'ICMS') group.counts.deferredMissing++
          if (declared !== undefined) {
            entry.comparison = compareDeclared(component, amount, declared)
            group.counts.comparableItems++
            sum('comparedCalculatedIcms', amount); sum('comparedDeclaredIcms', declared)
            const difference = entry.comparison.difference!
            sum('difference', difference); sum('absoluteDifferences', difference.replace(/^-/, ''))
            if (entry.comparison.status === 'WITHIN_TOLERANCE') group.counts.withinToleranceItems++
          }
          if (consolidationEvidenceDivergent(entry)) group.counts.divergentItems++
        } else {
          entry.status = memory?.status === 'UNSUPPORTED' ? 'UNSUPPORTED' : 'PENDING'
          group.counts[entry.status === 'UNSUPPORTED' ? 'unsupported' : 'pending']++
          entry.reasons = [component === 'FCP_ST' && memory?.status === 'CALCULATED' && item.memory?.status !== 'CALCULATED' ? 'A base de ICMS-ST exige nova conferência antes de totalizar o FCP-ST.' : memory?.reason ?? (memory?.status === 'CALCULATED' ? 'Resultado monetário inválido ou incompleto.' : 'Cálculo ainda não salvo.')]
        }
        evidence.push(entry); componentEvidence.push(entry)
      }
    }
  }
  // Contagens globais representam itens físicos; grupos representam componentes tributários.
  const total = counts()
  for (const { item: originals, entries } of physical) {
    total.items++
    if (entries.every(e => e.status === 'EXCLUDED')) total.excluded++
    else if (entries.some(e => e.status === 'UNSUPPORTED')) total.unsupported++
    else if (entries.some(e => e.status !== 'CALCULATED')) total.pending++
    else total.calculated++
    const eligible = entries.filter(e => e.status !== 'EXCLUDED')
    if (eligible.some(e => e.declaredIcms === undefined)) {
      if (eligible.some(e => e.declaredIcms === undefined && (e.component === 'FCP_ST' ? originals?.declaredFcpSt : e.component === 'ICMS_ST' ? originals?.declaredIcmsSt : originals?.declaredIcms) !== undefined)) total.declaredInvalid++
      if (eligible.some(e => e.declaredIcms === undefined && (e.component === 'FCP_ST' ? originals?.declaredFcpSt : e.component === 'ICMS_ST' ? originals?.declaredIcmsSt : originals?.declaredIcms) === undefined)) total.declaredMissing++
    }
    if (eligible.some(e => e.status === 'CALCULATED' && e.component === 'ICMS' && e.deferredIcms === undefined)) total.deferredMissing++
    if (eligible.some(e => e.comparison)) total.comparableItems++
    if (eligible.some(e => consolidationEvidenceDivergent(e))) total.divergentItems++
    if (eligible.some(e => e.comparison?.status === 'WITHIN_TOLERANCE')) total.withinToleranceItems++
  }
  total.documents = documents.length
  return freeze(JSON.parse(JSON.stringify({ schemaVersion: 1, batchId, generatedAt, basis: 'LATEST_SAVED_CALCULATIONS',
    character: 'CONFERENCE_ONLY', groups: [...groups.values()].sort((a, b) => JSON.stringify([a.companyName, a.period, a.perspective, a.environment, a.authorization, a.component]).localeCompare(JSON.stringify([b.companyName, b.period, b.perspective, b.environment, b.authorization, b.component]))), evidence, counts: total })) as BatchConsolidation)
}
