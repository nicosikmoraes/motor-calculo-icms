import { createHash } from 'node:crypto'
import { BRAZILIAN_STATES, isValidCnpj, assertCanonicalUtcTimestamp } from '@motor/domain'
import { RULE_LEVELS } from '@motor/tax-engine'
import type { CompanySummary, FiscalProfileSummary, SupplierProductSummary, RuleDraftFields } from '@motor/contracts'

export type PackCompany = Omit<CompanySummary, 'revision'>
export type PackProfile = Omit<FiscalProfileSummary, 'revision'>
export type PackProduct = Omit<SupplierProductSummary, 'revision'>
export interface PackRule extends RuleDraftFields {
  id: string
  familyId: string
  version: number
  status: 'APPROVED'
  legalBasis: string
}
export interface PackPayload {
  companies: readonly PackCompany[]
  profiles: readonly PackProfile[]
  products: readonly PackProduct[]
  rules: readonly PackRule[]
}
const sections = ['companies', 'profiles', 'products', 'rules'] as const
export interface PackManifest {
  createdAt: string
  appVersion: string
  sections: Record<(typeof sections)[number], { count: number; sha256: string }>
}
export interface IcmsPack {
  format: 'ICMSPACK'
  schemaVersion: 1
  manifest: PackManifest
  payload: PackPayload
  sha256: string
}
export enum PackErrorCode {
  INVALID_JSON = 'INVALID_JSON', INVALID_SCHEMA = 'INVALID_SCHEMA',
  UNSUPPORTED_VERSION = 'UNSUPPORTED_VERSION', INVALID_REFERENCE = 'INVALID_REFERENCE',
  DUPLICATE = 'DUPLICATE', INTEGRITY = 'INTEGRITY', LIMIT = 'LIMIT',
}
export class PackValidationError extends Error {
  constructor(public readonly code: PackErrorCode, public readonly field: string) {
    super(`Pacote inválido: ${code} (${field}).`)
    this.name = 'PackValidationError'
  }
}
/** Limites defensivos deste codec inicial, sem representar meta de escala do produto. */
export const PACK_MAX_BYTES = 10 * 1024 * 1024
export const PACK_MAX_RECORDS_PER_SECTION = 10_000
function fail(code: PackErrorCode, field: string): never { throw new PackValidationError(code, field) }
function object(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(PackErrorCode.INVALID_SCHEMA, 'objeto')
  const record = value as Record<string, unknown>
  if (required.some((key) => !Object.hasOwn(record, key))
    || Object.keys(record).some((key) => !required.includes(key) && !optional.includes(key))) {
    fail(PackErrorCode.INVALID_SCHEMA, 'campos')
  }
  return record
}
function text(value: unknown, field: string, max = 200): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > max) fail(PackErrorCode.INVALID_SCHEMA, field)
}
function id(value: unknown): asserts value is string {
  text(value, 'id', 36)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) fail(PackErrorCode.INVALID_SCHEMA, 'id')
}
function integer(value: unknown, min: number): void {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min) fail(PackErrorCode.INVALID_SCHEMA, 'inteiro')
}
function cnpj(value: unknown): void {
  if (typeof value !== 'string' || !isValidCnpj(value)) fail(PackErrorCode.INVALID_SCHEMA, 'cnpj')
}
function date(value: unknown): asserts value is string {
  text(value, 'data', 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString().slice(0, 10) !== value) fail(PackErrorCode.INVALID_SCHEMA, 'data')
}
function validity(record: Record<string, unknown>): void {
  date(record.validFrom)
  if (record.validUntil !== undefined) {
    date(record.validUntil)
    if (record.validUntil < record.validFrom) fail(PackErrorCode.INVALID_SCHEMA, 'vigência')
  }
}
function active(record: Record<string, unknown>): void {
  if (typeof record.active !== 'boolean') fail(PackErrorCode.INVALID_SCHEMA, 'active')
}
function sha(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail(PackErrorCode.INVALID_SCHEMA, 'sha256')
}
/** Ordena chaves; arrays preservam sua ordem. Apenas valores JSON validados entram aqui. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value && typeof value === 'object') return '{' + Object.entries(value)
    .filter(([, child]) => child !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, child]) => JSON.stringify(key) + ':' + canonical(child)).join(',') + '}'
  return JSON.stringify(value)
}
function hash(value: unknown): string { return createHash('sha256').update(canonical(value), 'utf8').digest('hex') }
function distinct(values: readonly string[], field: string): void {
  if (new Set(values).size !== values.length) fail(PackErrorCode.DUPLICATE, field)
}
function validatePayload(input: unknown): PackPayload {
  const payload = object(input, sections)
  for (const section of sections) {
    const entries = payload[section]
    if (!Array.isArray(entries)) fail(PackErrorCode.INVALID_SCHEMA, section)
    if (entries.length > PACK_MAX_RECORDS_PER_SECTION) fail(PackErrorCode.LIMIT, section)
    for (const entry of entries) {
      const fields = section === 'companies' ? ['id', 'legalName', 'cnpj', 'state', 'active']
        : section === 'profiles' ? ['id', 'companyId', 'name', 'validFrom', 'active']
          : section === 'products' ? ['id', 'companyId', 'supplierCnpj', 'productCode', 'profileId', 'active']
            : ['id', 'familyId', 'version', 'status', 'name', 'level', 'priority', 'validFrom', 'legalBasis', 'conditions']
      const optional = section === 'companies' ? ['tradeName'] : section === 'profiles' ? ['validUntil']
        : section === 'rules' ? ['priorityReason', 'validUntil'] : []
      const record = object(entry, fields, optional)
      id(record.id)
      if (section !== 'rules') active(record)
      if (section === 'companies') {
        text(record.legalName, 'legalName'); cnpj(record.cnpj)
        if (record.tradeName !== undefined) text(record.tradeName, 'tradeName')
        if (!(BRAZILIAN_STATES as readonly unknown[]).includes(record.state)) fail(PackErrorCode.INVALID_SCHEMA, 'state')
      } else if (section === 'profiles') {
        id(record.companyId); text(record.name, 'name'); validity(record)
      } else if (section === 'products') {
        id(record.companyId); id(record.profileId); cnpj(record.supplierCnpj); text(record.productCode, 'productCode')
      } else {
        id(record.familyId); integer(record.version, 1); integer(record.priority, 0)
        text(record.name, 'name'); text(record.legalBasis, 'legalBasis', 10_000); validity(record)
        if (record.status !== 'APPROVED' || !(RULE_LEVELS as readonly unknown[]).includes(record.level)) fail(PackErrorCode.INVALID_SCHEMA, 'regra')
        if (record.priorityReason !== undefined) text(record.priorityReason, 'priorityReason', 10_000)
        if ((record.priority as number) > 0 && !record.priorityReason) fail(PackErrorCode.INVALID_SCHEMA, 'priorityReason')
        const conditions = object(record.conditions, [], ['companyId', 'supplierProductId', 'fiscalProfileId',
          'originState', 'destinationState', 'ncm', 'cest', 'cfop', 'operationType', 'issuerRegime',
          'cst', 'finalConsumer', 'purpose', 'merchandiseOrigin'])
        for (const [key, value] of Object.entries(conditions)) {
          text(value, key)
          if (['companyId', 'supplierProductId', 'fiscalProfileId'].includes(key)) id(value)
          const patterns: Record<string, RegExp> = { ncm: /^(?:[0-9]{8}|00)$/, cest: /^[0-9]{7}$/,
            cfop: /^[0-9]{4}$/, cst: /^[0-9]{2}$/, operationType: /^[01]$/, issuerRegime: /^[1-4]$/,
            finalConsumer: /^[01]$/, purpose: /^[1-4]$/, merchandiseOrigin: /^[0-8]$/ }
          if (patterns[key] && !patterns[key]!.test(value)) fail(PackErrorCode.INVALID_SCHEMA, key)
          if (['originState', 'destinationState'].includes(key)
            && !(BRAZILIAN_STATES as readonly string[]).includes(value)
            && !(key === 'destinationState' && value === 'EX')) fail(PackErrorCode.INVALID_SCHEMA, key)
        }
        const requiredByLevel: Record<string, readonly string[]> = {
          DEFAULT_OPERATION: ['operationType'], NCM: ['ncm'], NCM_CEST: ['ncm', 'cest'],
          FISCAL_PROFILE: ['fiscalProfileId'], COMPANY: ['companyId'], PRODUCT_COMPANY_EXCEPTION: ['companyId', 'supplierProductId'],
        }
        if (!requiredByLevel[record.level as string]?.every((key) => conditions[key])) fail(PackErrorCode.INVALID_SCHEMA, 'condições do nível')
      }
    }
    distinct(entries.map((entry: { id: string }) => entry.id), section)
  }
  const typed = payload as unknown as PackPayload
  distinct(typed.companies.map((entry) => entry.cnpj), 'cnpj da empresa')
  distinct(typed.rules.map((entry) => entry.familyId + ':' + entry.version), 'versão da regra')
  distinct(typed.products.map((entry) => JSON.stringify([entry.companyId, entry.supplierCnpj, entry.productCode])), 'vínculo do produto')
  const companies = new Set(typed.companies.map((entry) => entry.id))
  const profiles = new Map(typed.profiles.map((entry) => [entry.id, entry]))
  const products = new Map(typed.products.map((entry) => [entry.id, entry]))
  for (const profile of typed.profiles) if (!companies.has(profile.companyId)) fail(PackErrorCode.INVALID_REFERENCE, 'empresa do perfil')
  for (const product of typed.products) {
    if (!companies.has(product.companyId) || profiles.get(product.profileId)?.companyId !== product.companyId) fail(PackErrorCode.INVALID_REFERENCE, 'perfil do produto')
  }
  for (const rule of typed.rules) {
    const condition = rule.conditions
    if ((condition.companyId && !companies.has(condition.companyId))
      || (condition.fiscalProfileId && !profiles.has(condition.fiscalProfileId))
      || (condition.supplierProductId && !products.has(condition.supplierProductId))) fail(PackErrorCode.INVALID_REFERENCE, 'condição da regra')
    if (condition.companyId && ((condition.fiscalProfileId && profiles.get(condition.fiscalProfileId)?.companyId !== condition.companyId)
      || (condition.supplierProductId && products.get(condition.supplierProductId)?.companyId !== condition.companyId))) fail(PackErrorCode.INVALID_REFERENCE, 'empresa da regra')
    if (condition.supplierProductId && condition.fiscalProfileId
      && products.get(condition.supplierProductId)?.profileId !== condition.fiscalProfileId) fail(PackErrorCode.INVALID_REFERENCE, 'perfil da regra')
  }
  return typed
}
function validateMetadata(createdAt: unknown, appVersion: unknown): void {
  text(createdAt, 'createdAt'); text(appVersion, 'appVersion')
  try { assertCanonicalUtcTimestamp(createdAt) } catch { fail(PackErrorCode.INVALID_SCHEMA, 'createdAt') }
}

export function createIcmsPack(payload: PackPayload, metadata: { createdAt: string; appVersion: string }): IcmsPack {
  const validated = validatePayload(payload)
  validateMetadata(metadata.createdAt, metadata.appVersion)
  function sorted<T extends { id: string }>(entries: readonly T[]): T[] {
    return structuredClone([...entries]).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  }
  const snapshot: PackPayload = { companies: sorted(validated.companies), profiles: sorted(validated.profiles),
    products: sorted(validated.products), rules: sorted(validated.rules) }
  const manifest: PackManifest = { createdAt: metadata.createdAt, appVersion: metadata.appVersion, sections: Object.fromEntries(sections.map((section) =>
    [section, { count: snapshot[section].length, sha256: hash(snapshot[section]) }])) as PackManifest['sections'] }
  const unsigned = { format: 'ICMSPACK' as const, schemaVersion: 1 as const, manifest, payload: snapshot }
  const pack = { ...unsigned, sha256: hash(unsigned) }
  if (Buffer.byteLength(canonical(pack), 'utf8') > PACK_MAX_BYTES) fail(PackErrorCode.LIMIT, 'bytes')
  return pack
}

export function parseIcmsPack(json: string): IcmsPack {
  if (Buffer.byteLength(json, 'utf8') > PACK_MAX_BYTES) fail(PackErrorCode.LIMIT, 'bytes')
  let parsed: unknown
  try { parsed = JSON.parse(json) } catch { fail(PackErrorCode.INVALID_JSON, 'JSON') }
  const pack = object(parsed, ['format', 'schemaVersion', 'manifest', 'payload', 'sha256'])
  if (pack.format !== 'ICMSPACK') fail(PackErrorCode.INVALID_SCHEMA, 'format')
  if (pack.schemaVersion !== 1) fail(PackErrorCode.UNSUPPORTED_VERSION, 'schemaVersion')
  const manifest = object(pack.manifest, ['createdAt', 'appVersion', 'sections'])
  validateMetadata(manifest.createdAt, manifest.appVersion)
  const descriptors = object(manifest.sections, sections)
  const payload = validatePayload(pack.payload)
  for (const section of sections) {
    const descriptor = object(descriptors[section], ['count', 'sha256'])
    integer(descriptor.count, 0); sha(descriptor.sha256)
    if (descriptor.count !== payload[section].length || descriptor.sha256 !== hash(payload[section])) fail(PackErrorCode.INTEGRITY, section)
  }
  sha(pack.sha256)
  if (pack.sha256 !== hash({ format: pack.format, schemaVersion: pack.schemaVersion, manifest, payload })) fail(PackErrorCode.INTEGRITY, 'manifesto')
  return parsed as IcmsPack
}

export function serializeIcmsPack(pack: IcmsPack): string {
  const json = canonical(pack)
  parseIcmsPack(json)
  return json
}

export * from "./import-plan"
