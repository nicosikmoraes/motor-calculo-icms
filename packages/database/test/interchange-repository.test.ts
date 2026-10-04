import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createIcmsPack, serializeIcmsPack, packStateFingerprint, planPackImport, type PackPayload } from '@motor/interchange'
import { CORE_MIGRATIONS, SqliteDatabase, runSqlMigrations, SqliteOrganizationRepository,
  SqliteInterchangeRepository, SqliteRegistrationAuditRepository, SqliteVersionedRuleRepository } from '../src'
const now = '2026-10-01T23:00:00.000Z'
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
function payload(): PackPayload {
  return { companies: [{ id: uuid(2), legalName: 'Empresa sintética', cnpj: '11222333000181', state: 'PR', active: true }],
    profiles: [{ id: uuid(3), companyId: uuid(2), name: 'Perfil de teste', validFrom: '2026-01-01', active: true }],
    products: [{ id: uuid(4), companyId: uuid(2), supplierCnpj: '11222333000181', productCode: '0001', profileId: uuid(3), active: true }],
    rules: [{ id: uuid(5), familyId: uuid(6), version: 1, status: 'APPROVED', name: 'Regra de teste',
      level: 'PRODUCT_COMPANY_EXCEPTION', priority: 0, validFrom: '2026-01-01', legalBasis: 'Fundamento sintético',
      conditions: { companyId: uuid(2), supplierProductId: uuid(4), fiscalProfileId: uuid(3), cst: '00' } }] }
}
const pack = (data = payload()) => createIcmsPack(data, { createdAt: now, appVersion: 'test' })
let database: SqliteDatabase, repository: SqliteInterchangeRepository
beforeEach(() => {
  database = new SqliteDatabase(':memory:')
  runSqlMigrations(database, CORE_MIGRATIONS, { appVersion: 'test' })
  new SqliteOrganizationRepository(database).createSingle({ id: uuid(1), name: 'Destino', active: true, createdAt: now, updatedAt: now })
  repository = new SqliteInterchangeRepository(database)
})
afterEach(() => database.close())
function importData(data = payload(), choices = {}) {
  const snapshot = repository.snapshot()
  return repository.importPack(serializeIcmsPack(pack(data)), packStateFingerprint(snapshot), choices, now)
}

describe('exportação e importação transacional de cadastros', () => {
  it('importa tudo na organização local, preserva IDs e registra proveniência na auditoria', () => {
    expect(importData()).toEqual({ created: 4, updated: 0, kept: 0 })
    expect(repository.exportPack('test', now).payload).toEqual(payload())
    const audit = new SqliteRegistrationAuditRepository(database).list()
    expect(audit).toHaveLength(3)
    expect(audit[0]?.changes.pacote?.after).toBe(pack().sha256)
    expect(new SqliteVersionedRuleRepository(database).get(uuid(5))).toMatchObject({ status: 'APPROVED', organizationId: uuid(1) })
    expect(new SqliteVersionedRuleRepository(database).listEvents(uuid(5))[0]?.changes.pacote?.after).toBe(pack().sha256)
  })
  it('reimportação idêntica não muda revisões nem duplica auditorias', () => {
    importData(); const fingerprint = packStateFingerprint(repository.snapshot())
    expect(importData()).toEqual({ created: 0, updated: 0, kept: 4 })
    expect(packStateFingerprint(repository.snapshot())).toBe(fingerprint)
    expect(new SqliteRegistrationAuditRepository(database).list()).toHaveLength(3)
  })
  it('exige escolha explícita e aplica apenas os conflitos escolhidos', () => {
    importData(); const data = payload()
    data.companies[0]!.legalName = 'Nome recebido'; data.profiles[0]!.name = 'Novo perfil'
    expect(() => importData(data)).toThrow(/Escolha/)
    expect(importData(data, { [`companies:${uuid(2)}`]: 'USE_PACKAGE', [`profiles:${uuid(3)}`]: 'KEEP_LOCAL' }))
      .toEqual({ created: 0, updated: 1, kept: 3 })
    expect(repository.snapshot().companies[0]?.legalName).toBe('Nome recebido')
    expect(repository.snapshot().profiles[0]?.name).toBe('Perfil de teste')
    expect(repository.snapshot().companies[0]?.revision).toBe(2)
  })
  it('remapeia empresas por CNPJ e produtos por identidade natural sem duplicar cadastros', () => {
    importData(); const data = payload()
    data.companies[0]!.id = uuid(12)
    data.profiles[0]!.companyId = uuid(12)
    data.products[0]!.companyId = uuid(12); data.products[0]!.id = uuid(14)
    data.rules[0]!.conditions = { companyId: uuid(12), supplierProductId: uuid(14), fiscalProfileId: uuid(3), cst: '00' }
    expect(importData(data)).toEqual({ created: 0, updated: 0, kept: 4 })
    expect(repository.snapshot().products[0]?.id).toBe(uuid(4))
    expect(repository.snapshot().companies).toHaveLength(1)
  })
  it('mantém regras imutáveis ou revogadas e não exporta versões anteriores de uma família revogada', () => {
    importData(); const rules = new SqliteVersionedRuleRepository(database)
    const data = payload(); data.rules[0]!.name = 'Tentativa de sobrescrita'
    expect(() => importData(data, { [`rules:${uuid(5)}`]: 'USE_PACKAGE' })).toThrow(/não pode/)
    expect(importData(data, { [`rules:${uuid(5)}`]: 'KEEP_LOCAL' }).updated).toBe(0)
    rules.revoke(uuid(5), 'Revogada localmente', now, 'teste')
    expect(importData(payload(), { [`rules:${uuid(5)}`]: 'KEEP_LOCAL' }).created).toBe(0)
    expect(repository.exportPack('test', now).payload.rules).toHaveLength(0)
  })
  it('importa nova versão sem alterar a anterior e exporta apenas a versão final mais recente', () => {
    importData(); const data = payload()
    data.rules[0]!.id = uuid(15); data.rules[0]!.version = 2; data.rules[0]!.name = 'Segunda versão'
    expect(importData(data).created).toBe(1)
    expect(repository.snapshot().rules).toHaveLength(2)
    const exported = repository.exportPack('test', now)
    expect(exported.payload.rules).toMatchObject([{ id: uuid(15), version: 2 }])
    new SqliteVersionedRuleRepository(database).revoke(uuid(15), 'Revogada', now, 'teste')
    expect(repository.exportPack('test', now).payload.rules).toHaveLength(0)
  })
  it('bloqueia confirmação obsoleta mesmo após revisão sem alteração de valores', () => {
    importData(); const fingerprint = packStateFingerprint(repository.snapshot())
    database.run('UPDATE empresas SET revisao = revisao + 1 WHERE id = ?', uuid(2))
    expect(() => repository.importPack(serializeIcmsPack(pack()), fingerprint, {}, now)).toThrow(/mudaram/)
    expect(new SqliteRegistrationAuditRepository(database).list()).toHaveLength(3)
  })
  it('desfaz cadastros, família e auditoria integralmente se a última escrita falhar', () => {
    database.exec(`CREATE TRIGGER simular_falha BEFORE INSERT ON eventos_auditoria_regras
      BEGIN SELECT RAISE(ABORT, 'Falha simulada na auditoria'); END;`)
    expect(() => importData()).toThrow(/Falha simulada/)
    expect(repository.snapshot()).toMatchObject({ companies: [], profiles: [], products: [], rules: [] })
    expect(new SqliteRegistrationAuditRepository(database).list()).toHaveLength(0)
    expect(database.get<{ total: number }>('SELECT count(*) AS total FROM familias_regras_fiscais')?.total).toBe(0)
  })
  it('mostra e bloqueia colisões de identidade antes de alterar qualquer cadastro', () => {
    importData(); const data = payload(); data.companies[0]!.cnpj = '11444777000161'
    const plan = planPackImport(pack(data), repository.snapshot())
    expect(plan.rows[0]).toMatchObject({ status: 'BLOCKED' })
    expect(() => importData(data)).toThrow(/colisões/)
    expect(repository.snapshot().companies[0]?.cnpj).toBe('11222333000181')
  })
  it('recusa escolhas extras, adulteração e dependências incompatíveis após resolução', () => {
    expect(() => importData(payload(), { qualquer: 'USE_PACKAGE' })).toThrow(/inválidas/)
    const json = JSON.stringify({ ...pack(), sha256: '0'.repeat(64) })
    expect(() => repository.importPack(json, packStateFingerprint(repository.snapshot()), {}, now)).toThrow()
    expect(repository.snapshot().companies).toHaveLength(0)
    importData(); const data = payload()
    data.profiles = [...data.profiles, { ...data.profiles[0]!, id: uuid(13), name: 'Outro perfil' }]
    data.products[0]!.profileId = uuid(13)
    data.rules[0]!.id = uuid(15); data.rules[0]!.version = 2
    data.rules[0]!.conditions = { companyId: uuid(2), supplierProductId: uuid(4), fiscalProfileId: uuid(13) }
    expect(() => importData(data, { [`products:${uuid(4)}`]: 'KEEP_LOCAL' })).toThrow(/vínculos incompatíveis/)
    expect(repository.snapshot().profiles).toHaveLength(1)
    expect(importData(data, { [`products:${uuid(4)}`]: 'USE_PACKAGE' })).toMatchObject({ created: 2, updated: 1 })
  })
})
