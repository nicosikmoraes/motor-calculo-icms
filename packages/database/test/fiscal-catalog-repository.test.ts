import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CORE_MIGRATIONS,
  SqliteCompanyRepository,
  SqliteDatabase,
  SqliteFiscalCatalogRepository,
  SqliteOrganizationRepository,
  runSqlMigrations,
} from '../src'

const organizationId = '00000000-0000-4000-8000-000000000001'
const companyId = '00000000-0000-4000-8000-000000000002'
const timestamp = '2026-09-21T18:00:00.000Z'
let database: SqliteDatabase
let catalog: SqliteFiscalCatalogRepository

beforeEach(() => {
  database = new SqliteDatabase(':memory:')
  runSqlMigrations(database, CORE_MIGRATIONS, { appVersion: 'test' })
  new SqliteOrganizationRepository(database).create({
    id: organizationId, name: 'Escritório teste', active: true,
    createdAt: timestamp, updatedAt: timestamp,
  })
  new SqliteCompanyRepository(database).create({
    id: companyId, organizationId, legalName: 'Empresa teste',
    cnpj: '11222333000181', state: 'PR', active: true,
    createdAt: timestamp, updatedAt: timestamp,
  })
  catalog = new SqliteFiscalCatalogRepository(database)
})

afterEach(() => database.close())

describe('catálogo fiscal cadastral', () => {
  it('persiste perfil com vigência e vincula produto por empresa, fornecedor e código', () => {
    const profile = catalog.createProfile({
      organizationId, companyId, name: 'Revenda', validFrom: '2026-01-01',
      validUntil: '2026-12-31',
    })
    expect(catalog.listProfiles(companyId)).toMatchObject([{ id: profile.id, name: 'Revenda' }])

    const first = catalog.upsertSupplierProduct({
      companyId, supplierCnpj: '11.222.333/0001-81', productCode: 'ABC-1',
      profileId: profile.id,
    })
    const second = catalog.upsertSupplierProduct({
      companyId, supplierCnpj: '11222333000181', productCode: 'ABC-1',
      profileId: profile.id,
    })
    expect(second.id).toBe(first.id)
    expect(catalog.listSupplierProducts(companyId)).toMatchObject([{
      supplierCnpj: '11222333000181', productCode: 'ABC-1', profileId: profile.id,
    }])
  })

  it('recusa vigência inválida e perfil de outra empresa', () => {
    expect(() => catalog.createProfile({
      organizationId, companyId, name: 'Inválido', validFrom: '2026-02-30',
    })).toThrow(/data válida/)
    expect(() => catalog.createProfile({
      organizationId, companyId, name: 'Invertido', validFrom: '2026-12-01',
      validUntil: '2026-01-01',
    })).toThrow(/anterior/)
    expect(() => catalog.upsertSupplierProduct({
      companyId, supplierCnpj: '11222333000181', productCode: 'ABC-1',
      profileId: '00000000-0000-4000-8000-000000000099',
    })).toThrow(/não pertence/)
  })
})
