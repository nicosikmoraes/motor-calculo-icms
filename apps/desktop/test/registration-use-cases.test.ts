import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CORE_MIGRATIONS, SqliteCompanyRepository, SqliteDatabase,
  SqliteFiscalCatalogRepository, SqliteOrganizationRepository, runSqlMigrations,
} from '@motor/database'
import { AppErrorCode } from '@motor/domain'
import { RegistrationUseCases } from '../src/main/registration-use-cases'

const timestamp = '2026-09-29T01:00:00.000Z'
let database: SqliteDatabase
let cases: RegistrationUseCases
let nextId: number

beforeEach(() => {
  database = new SqliteDatabase(':memory:')
  runSqlMigrations(database, CORE_MIGRATIONS, { appVersion: 'test' })
  nextId = 1
  cases = new RegistrationUseCases({
    organizations: new SqliteOrganizationRepository(database),
    companies: new SqliteCompanyRepository(database),
    catalog: new SqliteFiscalCatalogRepository(database),
  }, () => `00000000-0000-4000-8000-${(nextId++).toString(16).padStart(12, '0')}`, () => timestamp)
})

afterEach(() => database.close())

describe('casos de uso de cadastros', () => {
  it('coordena organização, empresa, perfil e vínculo de produto', () => {
    const organization = cases.createOrganization({ name: '  Escritório  ' })
    const company = cases.createCompany({
      legalName: 'Empresa A', cnpj: '11.222.333/0001-81', state: 'pr',
    })
    const profile = cases.createFiscalProfile({
      companyId: company.id, name: 'Revenda', validFrom: '2026-01-01',
    })
    const product = cases.saveSupplierProduct({
      companyId: company.id, supplierCnpj: '11.222.333/0001-81',
      productCode: 'P1', profileId: profile.id,
    })

    expect(cases.getWorkspace()).toMatchObject({
      organization: { id: organization.id, name: 'Escritório' },
      companies: [{ id: company.id, cnpj: '11222333000181', state: 'PR' }],
    })
    expect(cases.listFiscalProfiles(company.id)).toMatchObject([{ id: profile.id }])
    expect(cases.listSupplierProducts(company.id)).toMatchObject([{ id: product.id }])
    expect(cases.renameOrganization({ name: 'Novo nome' }).name).toBe('Novo nome')
  })

  it('recusa acesso ao catálogo de empresa ausente', () => {
    cases.createOrganization({ name: 'Escritório' })
    expect(() => cases.listFiscalProfiles('inexistente')).toThrowError(
      expect.objectContaining({ code: AppErrorCode.ACTIVE_COMPANY_NOT_FOUND }),
    )
  })
})
