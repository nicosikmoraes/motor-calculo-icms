import type { BatchConsolidation, ConsolidationCounts, ConsolidationEvidence, ConsolidationGroup } from '@motor/contracts'
import { addDecimals, roundMoney, compareDeclared, type CalculationMemory } from '@motor/tax-engine'

export interface ConsolidationDocument {
  documentId: string; accessKey: string; documentNumber: string
  companyId?: string | undefined; companyName?: string | undefined; issuedAt?: string | undefined
  perspective: ConsolidationGroup['perspective']; environment: ConsolidationGroup['environment']
  authorization: ConsolidationGroup['authorization']; exclusionReason?: string | undefined
  runId?: string | undefined; engineVersion?: string | undefined
  items: readonly { itemNumber: string; declaredIcms?: string | undefined; memory?: CalculationMemory | undefined }[]
}
const counts = (): ConsolidationCounts => ({ documents: 0, items: 0, calculated: 0, pending: 0, unsupported: 0,
  excluded: 0, declaredMissing: 0, declaredInvalid: 0, deferredMissing: 0, divergentItems: 0,
  withinToleranceItems: 0, comparableItems: 0 })
function money(value?: string): string | undefined {
  if (value === undefined || !/^\d+(?:\.\d{1,2})?$/.test(value)) return undefined
  try { return roundMoney(value) } catch { return undefined }
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
    const key = JSON.stringify([doc.companyId, period, doc.environment, doc.perspective, doc.authorization])
    let group = groups.get(key)
    if (!group) {
      group = { ...(doc.companyId ? { companyId: doc.companyId } : {}), ...(doc.companyName ? { companyName: doc.companyName } : {}), ...(period ? { period } : {}), environment: doc.environment,
        perspective: doc.perspective, authorization: doc.authorization, purchaseCredit: 'NOT_CALCULATED', counts: counts(),
        totals: { calculatedBase: '0.00', calculatedIcms: '0.00', declaredIcms: '0.00', deferredIcms: '0.00',
          comparedCalculatedIcms: '0.00', comparedDeclaredIcms: '0.00', difference: '0.00', absoluteDifferences: '0.00' } }
      groups.set(key, group)
    }
    group.counts.documents++
    const sum = (field: keyof ConsolidationGroup['totals'], amount: string) => { group!.totals[field] = roundMoney(addDecimals(group!.totals[field], amount)) }
    for (const item of doc.items) {
      group.counts.items++
      const memory = item.memory
      const entry: ConsolidationEvidence = { documentId: doc.documentId, accessKey: doc.accessKey, documentNumber: doc.documentNumber,
        itemNumber: item.itemNumber, ...(doc.companyId ? { companyId: doc.companyId } : {}), ...(period ? { period } : {}), environment: doc.environment,
        perspective: doc.perspective, authorization: doc.authorization, status: 'PENDING', reasons: [], ...(doc.runId ? { runId: doc.runId } : {}), ...(doc.engineVersion ? { engineVersion: doc.engineVersion } : {}) }
      if (exclusion) { entry.status = 'EXCLUDED'; entry.reasons = [exclusion]; group.counts.excluded++; evidence.push(entry); continue }
      const declared = money(item.declaredIcms)
      if (declared !== undefined) { entry.declaredIcms = declared; sum('declaredIcms', declared) }
      else if (item.declaredIcms === undefined) group.counts.declaredMissing++
      else group.counts.declaredInvalid++
      const base = money(memory?.result?.base), amount = money(memory?.result?.amount)
      if (memory?.status === 'CALCULATED' && base !== undefined && amount !== undefined) {
        entry.status = 'CALCULATED'; entry.calculatedIcms = amount; group.counts.calculated++
        sum('calculatedBase', base); sum('calculatedIcms', amount)
        const deferred = money(memory.deferredAmount ?? memory.steps.find(step => step.name === 'ICMS diferido')?.result)
        if (deferred !== undefined) { entry.deferredIcms = deferred; sum('deferredIcms', deferred) }
        else group.counts.deferredMissing++
        if (declared !== undefined) {
          entry.comparison = compareDeclared('ICMS', amount, declared)
          group.counts.comparableItems++
          sum('comparedCalculatedIcms', amount); sum('comparedDeclaredIcms', declared)
          const difference = entry.comparison.difference!
          sum('difference', difference); sum('absoluteDifferences', difference.replace(/^-/, ''))
          if (entry.comparison.status === 'DIFFERENT') group.counts.divergentItems++
          if (entry.comparison.status === 'WITHIN_TOLERANCE') group.counts.withinToleranceItems++
        }
      } else {
        entry.status = memory?.status === 'UNSUPPORTED' ? 'UNSUPPORTED' : 'PENDING'
        group.counts[entry.status === 'UNSUPPORTED' ? 'unsupported' : 'pending']++
        entry.reasons = [memory?.reason ?? (memory?.status === 'CALCULATED' ? 'Resultado monetário inválido ou incompleto.' : 'Cálculo ainda não salvo.')]
      }
      evidence.push(entry)
    }
  }
  const total = counts()
  for (const group of groups.values()) for (const field of Object.keys(total) as (keyof ConsolidationCounts)[]) total[field] += group.counts[field]
  return freeze(JSON.parse(JSON.stringify({ schemaVersion: 1, batchId, generatedAt, basis: 'LATEST_SAVED_CALCULATIONS',
    character: 'CONFERENCE_ONLY', groups: [...groups.values()].sort((a, b) => JSON.stringify([a.companyName, a.period, a.perspective, a.environment, a.authorization]).localeCompare(JSON.stringify([b.companyName, b.period, b.perspective, b.environment, b.authorization]))), evidence, counts: total })) as BatchConsolidation)
}
