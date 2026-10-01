import { createHash } from 'node:crypto'
import type { PackPreviewRow, PackConflictChoice, PackEntity } from '@motor/contracts'
import { createIcmsPack, parseIcmsPack, serializeIcmsPack, type IcmsPack, type PackCompany,
  type PackProfile, type PackProduct, type PackRule } from './index'

export interface LocalPackRule extends Omit<PackRule, 'status' | 'legalBasis'> {
  revision: number
  status: 'DRAFT' | 'APPROVED' | 'REVOKED'
  legalBasis?: string
}
export interface LocalPackState {
  organizationId: string
  companies: readonly (PackCompany & { revision: number })[]
  profiles: readonly (PackProfile & { revision: number })[]
  products: readonly (PackProduct & { revision: number })[]
  rules: readonly LocalPackRule[]
}
export type PackWrite =
  | { entity: 'companies'; record: PackCompany; before?: PackCompany }
  | { entity: 'profiles'; record: PackProfile; before?: PackProfile }
  | { entity: 'products'; record: PackProduct; before?: PackProduct }
  | { entity: 'rules'; record: PackRule }
export interface PackImportPlan { rows: readonly PackPreviewRow[]; writes: readonly PackWrite[]; kept: number }
function stable(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']'
  if (value && typeof value === 'object') return '{' + Object.entries(value).filter(([, child]) => child !== undefined)
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => JSON.stringify(key) + ':' + stable(child)).join(',') + '}'
  return JSON.stringify(value)
}
export function packStateFingerprint(state: LocalPackState): string {
  const sorted = { organizationId: state.organizationId,
    ...Object.fromEntries((['companies', 'profiles', 'products', 'rules'] as const)
      .map((entity) => [entity, [...state[entity]].sort((a, b) => a.id.localeCompare(b.id))])) }
  return createHash('sha256').update(stable(sorted)).digest('hex')
}
function clean<T extends { revision?: number }>(record: T): Omit<T, 'revision'> {
  const { revision: _revision, ...rest } = record
  return rest
}
function compare(local: object, incoming: object): PackPreviewRow['differences'] {
  const a = local as Record<string, unknown>, b = incoming as Record<string, unknown>
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((key) => key !== 'id' && stable(a[key]) !== stable(b[key]))
    .map((field) => ({ field, local: display(a[field]), incoming: display(b[field]) }))
}
function display(value: unknown): string {
  if (value === undefined) return '—'
  if (typeof value === 'boolean') return value ? 'Ativo' : 'Inativo'
  if (typeof value === 'object') return stable(value)
  return String(value)
}

/** Reconcilia identidades sem mutar origem ou destino; a persistência usa somente writes. */
export function planPackImport(packInput: IcmsPack, local: LocalPackState,
  choices?: Readonly<Record<string, PackConflictChoice>>): PackImportPlan {
  const pack = parseIcmsPack(serializeIcmsPack(packInput))
  const rows: PackPreviewRow[] = [], writes: PackWrite[] = []
  const companyIds = new Map<string, string>(), profileIds = new Map<string, string>(), productIds = new Map<string, string>()
  const localCompaniesById = new Map(local.companies.map((item) => [item.id, item]))
  const localCompaniesByCnpj = new Map(local.companies.map((item) => [item.cnpj, item]))
  const localProfilesById = new Map(local.profiles.map((item) => [item.id, item]))
  const productIdentity = (item: { companyId: string; supplierCnpj: string; productCode: string }): string =>
    JSON.stringify([item.companyId, item.supplierCnpj, item.productCode])
  const localProductsById = new Map(local.products.map((item) => [item.id, item]))
  const localProductsByIdentity = new Map(local.products.map((item) => [productIdentity(item), item]))
  const localRulesById = new Map(local.rules.map((item) => [item.id, item]))
  const localRulesByVersion = new Map(local.rules.map((item) => [item.familyId + ':' + item.version, item]))
  const names = new Map<string, string>()
  for (const item of [...local.companies, ...pack.payload.companies]) names.set(item.id, `${item.legalName} · ${item.cnpj}`)
  for (const item of [...local.profiles, ...pack.payload.profiles]) names.set(item.id, item.name)
  for (const item of [...local.products, ...pack.payload.products]) names.set(item.id, `${item.productCode} · ${item.supplierCnpj}`)
  const conditionLabels: Record<string, string> = { companyId: 'Empresa', supplierProductId: 'Produto', fiscalProfileId: 'Perfil fiscal',
    originState: 'UF de origem', destinationState: 'UF de destino', ncm: 'NCM', cest: 'CEST', cfop: 'CFOP', operationType: 'Direção',
    issuerRegime: 'CRT', cst: 'CST', finalConsumer: 'Consumidor final', purpose: 'Finalidade', merchandiseOrigin: 'Origem da mercadoria' }
  function describe(value: unknown, field: string): string {
    if (typeof value === 'string' && ['companyId', 'profileId', 'supplierProductId', 'fiscalProfileId'].includes(field)) return names.get(value) ?? value
    if (field === 'conditions' && value && typeof value === 'object') return Object.entries(value)
      .map(([key, child]) => `${conditionLabels[key] ?? key}: ${describe(child, key)}`).join('; ')
    if (field === 'status') return ({ APPROVED: 'Aprovada para seleção', REVOKED: 'Revogada', DRAFT: 'Rascunho' } as Record<string, string>)[String(value)] ?? display(value)
    if (field === 'level') return ({ DEFAULT_OPERATION: 'Operação padrão', NCM: 'NCM', NCM_CEST: 'NCM e CEST',
      FISCAL_PROFILE: 'Perfil fiscal', COMPANY: 'Empresa', PRODUCT_COMPANY_EXCEPTION: 'Exceção de produto e empresa' } as Record<string, string>)[String(value)] ?? display(value)
    return display(value)
  }
  let kept = 0
  function row(entity: PackEntity, incoming: { id: string }, label: string, before?: object, blocked?: string,
    immutable = false): boolean {
    const differences = compare(before ?? {}, incoming).map((difference) => ({ ...difference,
      local: describe((before as Record<string, unknown> | undefined)?.[difference.field], difference.field),
      incoming: describe((incoming as unknown as Record<string, unknown>)[difference.field], difference.field) }))
    const status = blocked ? 'BLOCKED' : !before ? 'NEW' : differences.length ? 'CONFLICT' : 'SAME'
    const key = entity + ':' + incoming.id
    const preview: PackPreviewRow = { key, entity, label, status,
      canUsePackage: status === 'CONFLICT' && !immutable,
      differences, ...(blocked ? { reason: blocked } : immutable && status === 'CONFLICT'
        ? { reason: 'Versão local preservada: regras publicadas, revogadas e rascunhos existentes não são substituídos pelo pacote.' } : {}) }
    rows.push(preview)
    if (status === 'BLOCKED') return false
    if (status === 'NEW') return true
    if (status === 'SAME') { kept++; return false }
    if (choices === undefined) { kept++; return false }
    const choice = choices[key]
    if (choice !== 'KEEP_LOCAL' && choice !== 'USE_PACKAGE') throw new Error('Escolha uma resolução para cada conflito.')
    if (choice === 'USE_PACKAGE' && !preview.canUsePackage) throw new Error('Esta versão de regra local não pode ser substituída.')
    if (choice === 'KEEP_LOCAL') { kept++; return false }
    return true
  }
  for (const incoming of pack.payload.companies) {
    const byId = localCompaniesById.get(incoming.id)
    const match = localCompaniesByCnpj.get(incoming.cnpj)
    const before = match ? clean(match) : undefined
    const blocked = byId && byId.cnpj !== incoming.cnpj ? 'O ID já pertence a uma empresa com outro CNPJ.' : undefined
    const record = { ...incoming, id: match?.id ?? incoming.id }
    companyIds.set(incoming.id, record.id)
    names.set(record.id, `${incoming.legalName} · ${incoming.cnpj}`)
    if (row('companies', incoming, `${incoming.legalName} · ${incoming.cnpj}`, before, blocked)) writes.push({ entity: 'companies', record, ...(before ? { before } : {}) })
  }
  for (const incoming of pack.payload.profiles) {
    const record = { ...incoming, companyId: companyIds.get(incoming.companyId)! }
    const match = localProfilesById.get(incoming.id)
    const before = match ? clean(match) : undefined
    profileIds.set(incoming.id, record.id)
    const blocked = match && match.companyId !== record.companyId ? 'O perfil local pertence a outra empresa.' : undefined
    if (row('profiles', record, incoming.name, before, blocked)) writes.push({ entity: 'profiles', record, ...(before ? { before } : {}) })
  }
  for (const incoming of pack.payload.products) {
    const remapped = { ...incoming, companyId: companyIds.get(incoming.companyId)!, profileId: profileIds.get(incoming.profileId)! }
    const byId = localProductsById.get(incoming.id)
    const match = localProductsByIdentity.get(productIdentity(remapped))
    const before = match ? clean(match) : undefined
    const blocked = byId && byId.id !== match?.id ? 'O ID local já representa outro vínculo de produto.' : undefined
    const record = { ...remapped, id: match?.id ?? incoming.id }
    productIds.set(incoming.id, record.id)
    names.set(record.id, `${incoming.productCode} · ${incoming.supplierCnpj}`)
    if (row('products', remapped, `${incoming.productCode} · ${incoming.supplierCnpj}`, before, blocked)) writes.push({ entity: 'products', record, ...(before ? { before } : {}) })
  }
  for (const incoming of pack.payload.rules) {
    const conditions = { ...incoming.conditions }
    if (conditions.companyId) conditions.companyId = companyIds.get(conditions.companyId)!
    if (conditions.fiscalProfileId) conditions.fiscalProfileId = profileIds.get(conditions.fiscalProfileId)!
    if (conditions.supplierProductId) conditions.supplierProductId = productIds.get(conditions.supplierProductId)!
    const record = { ...incoming, conditions }
    const match = localRulesById.get(incoming.id)
      ?? localRulesByVersion.get(incoming.familyId + ':' + incoming.version)
    if (row('rules', record, `${incoming.name} · v${incoming.version}`, match ? clean(match) : undefined, undefined, true)) {
      writes.push({ entity: 'rules', record })
    }
  }
  if (choices !== undefined) {
    const conflictKeys = new Set(rows.filter((entry) => entry.status === 'CONFLICT').map((entry) => entry.key))
    if (!choices || typeof choices !== 'object' || Array.isArray(choices)
      || Object.keys(choices).some((key) => !conflictKeys.has(key))) {
      throw new Error('Resoluções de conflito inválidas.')
    }
    if (rows.some((entry) => entry.status === 'BLOCKED')) throw new Error('Há colisões de identidade. Corrija o pacote antes de importar.')
    // Valida a combinação efetiva depois das escolhas, incluindo vínculos mantidos localmente.
    function merged<T extends { id: string }>(entity: PackEntity, entries: readonly T[]): T[] {
      const result = new Map(entries.map((entry) => [entry.id, clean(entry as T & { revision?: number }) as T]))
      for (const write of writes) if (write.entity === entity) result.set(write.record.id, write.record as unknown as T)
      return [...result.values()]
    }
    try {
      createIcmsPack({ companies: merged('companies', local.companies), profiles: merged('profiles', local.profiles),
        products: merged('products', local.products), rules: writes.filter((write) => write.entity === 'rules').map((write) => write.record) },
      { createdAt: pack.manifest.createdAt, appVersion: pack.manifest.appVersion })
    } catch { throw new Error('As escolhas deixaram vínculos incompatíveis. Revise os perfis e produtos em conflito.') }
  }
  return { rows, writes, kept }
}
