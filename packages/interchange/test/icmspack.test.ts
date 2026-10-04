import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createIcmsPack, parseIcmsPack, serializeIcmsPack, PackErrorCode, PACK_MAX_BYTES,
  PACK_MAX_RECORDS_PER_SECTION, type PackPayload } from '../src/index'

const ids = Array.from({ length: 6 }, (_, n) => `00000000-0000-4000-8000-${String(n + 1).padStart(12, '0')}`)
const metadata = { createdAt: '2026-10-01T23:00:00.000Z', appVersion: '0.1.0' }
function fixture(): PackPayload {
  return { companies: [{ id: ids[0]!, legalName: 'Empresa sintética', cnpj: '11222333000181', state: 'PR', active: true }],
    profiles: [{ id: ids[1]!, companyId: ids[0]!, name: 'Perfil', validFrom: '2026-01-01', active: true }],
    products: [{ id: ids[2]!, companyId: ids[0]!, supplierCnpj: '11222333000181', productCode: '0001', profileId: ids[1]!, active: true }],
    rules: [{ id: ids[3]!, familyId: ids[4]!, version: 1, status: 'APPROVED', name: 'Regra local',
      level: 'PRODUCT_COMPANY_EXCEPTION', priority: 0, validFrom: '2026-01-01', legalBasis: 'Fundamento de teste',
      conditions: { companyId: ids[0]!, supplierProductId: ids[2]!, ncm: '01012100', cst: '00' } }] }
}
function reject(input: unknown, code: PackErrorCode): void {
  expect(() => parseIcmsPack(JSON.stringify(input))).toThrowError(expect.objectContaining({ code }))
}

describe('manifesto e validação icmspack v1', () => {
  it('faz ida e volta sem perder códigos e verifica contagens e hashes SHA-256', () => {
    const pack = createIcmsPack(fixture(), metadata)
    const json = serializeIcmsPack(pack)
    expect(parseIcmsPack(json)).toEqual(pack)
    expect(pack.manifest.sections.companies.count).toBe(1)
    const company = pack.payload.companies[0]!
    const expected = JSON.stringify({ active: company.active, cnpj: company.cnpj, id: company.id,
      legalName: company.legalName, state: company.state })
    expect(pack.manifest.sections.companies.sha256).toBe(createHash('sha256').update(`[${expected}]`).digest('hex'))
    expect(pack.payload.rules[0]?.conditions.ncm).toBe('01012100')
    expect(pack.payload.products[0]?.productCode).toBe('0001')
  })
  it('produz bytes estáveis para ordem diferente de registros e propriedades', () => {
    const source = fixture()
    const second = { ...source.companies[0]!, id: ids[5]!, cnpj: '11444777000161' }
    const a = { ...source, companies: [source.companies[0]!, second] }
    const b = { ...source, companies: [second, source.companies[0]!] }
    expect(serializeIcmsPack(createIcmsPack(a, metadata))).toBe(serializeIcmsPack(createIcmsPack(b, metadata)))
    expect(a.companies[0]?.id).toBe(ids[0])
    expect(createIcmsPack(a, metadata).payload.companies[0]).not.toBe(a.companies[0])
  })
  it('recusa corrupção de dados, contagem e metadados', () => {
    const original = createIcmsPack(fixture(), metadata)
    const data = structuredClone(original); (data.payload.companies[0]!).legalName = 'Outra'
    reject(data, PackErrorCode.INTEGRITY)
    const count = structuredClone(original); count.manifest.sections.products.count++
    reject(count, PackErrorCode.INTEGRITY)
    const meta = structuredClone(original); meta.manifest.appVersion = 'outra'
    reject(meta, PackErrorCode.INTEGRITY)
  })
  it('recusa JSON inválido, formato ou versão incompatível e campos desconhecidos', () => {
    expect(() => parseIcmsPack('{')).toThrowError(expect.objectContaining({ code: PackErrorCode.INVALID_JSON }))
    const pack = createIcmsPack(fixture(), metadata)
    reject({ ...pack, schemaVersion: 2 }, PackErrorCode.UNSUPPORTED_VERSION)
    reject({ ...pack, format: 'SQLITE' }, PackErrorCode.INVALID_SCHEMA)
    reject({ ...pack, credentials: 'segredo' }, PackErrorCode.INVALID_SCHEMA)
    reject({ ...pack, payload: { ...pack.payload, xmls: [] } }, PackErrorCode.INVALID_SCHEMA)
    reject({ ...pack, payload: { ...pack.payload, companies: [{ ...pack.payload.companies[0], logs: [] }] } }, PackErrorCode.INVALID_SCHEMA)
  })
  it('recusa cadastros inválidos, duplicação e rascunhos', () => {
    const source = fixture()
    expect(() => createIcmsPack({ ...source, companies: [...source.companies, ...source.companies] }, metadata))
      .toThrowError(expect.objectContaining({ code: PackErrorCode.DUPLICATE }))
    expect(() => createIcmsPack({ ...source, companies: [{ ...source.companies[0]!, cnpj: '00000000000000' }] }, metadata)).toThrow()
    expect(() => createIcmsPack({ ...source, profiles: [{ ...source.profiles[0]!, validFrom: '2026-02-30' }] }, metadata)).toThrow()
    expect(() => createIcmsPack({ ...source, rules: [{ ...source.rules[0]!, status: 'DRAFT' as 'APPROVED' }] }, metadata)).toThrow()
    expect(() => createIcmsPack({ ...source, rules: [{ ...source.rules[0]!, conditions: { companyId: ids[0]!, supplierProductId: ids[2]!, cfop: 'texto' } }] }, metadata)).toThrow()
  })
  it('recusa referências ausentes e vínculos de empresas diferentes', () => {
    const source = fixture()
    expect(() => createIcmsPack({ ...source, companies: [] }, metadata))
      .toThrowError(expect.objectContaining({ code: PackErrorCode.INVALID_REFERENCE }))
    expect(() => createIcmsPack({ ...source, products: [] }, metadata))
      .toThrowError(expect.objectContaining({ code: PackErrorCode.INVALID_REFERENCE }))
    const companies = [...source.companies, { ...source.companies[0]!, id: ids[5]!, cnpj: '11444777000161' }]
    expect(() => createIcmsPack({ ...source, companies, profiles: [{ ...source.profiles[0]!, companyId: ids[5]! }] }, metadata))
      .toThrowError(expect.objectContaining({ code: PackErrorCode.INVALID_REFERENCE }))
  })
  it('aceita pacote vazio e cadastros inativos sem reativá-los', () => {
    expect(parseIcmsPack(serializeIcmsPack(createIcmsPack({ companies: [], profiles: [], products: [], rules: [] }, metadata))).manifest.sections.rules.count).toBe(0)
    const source = fixture(); source.companies[0]!.active = false
    expect(createIcmsPack(source, metadata).payload.companies[0]?.active).toBe(false)
  })
  it('recusa conteúdo acima dos limites e datas não canônicas', () => {
    expect(() => parseIcmsPack(' '.repeat(PACK_MAX_BYTES + 1)))
      .toThrowError(expect.objectContaining({ code: PackErrorCode.LIMIT }))
    const source = fixture()
    expect(() => createIcmsPack({ ...source, companies: Array(PACK_MAX_RECORDS_PER_SECTION + 1).fill(source.companies[0]) }, metadata))
      .toThrowError(expect.objectContaining({ code: PackErrorCode.LIMIT }))
    expect(() => createIcmsPack(source, { ...metadata, createdAt: '2026-10-01' })).toThrow()
  })
})
