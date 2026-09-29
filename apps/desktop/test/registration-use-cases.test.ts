import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CORE_MIGRATIONS, SqliteBatchRepository, SqliteCompanyRepository, SqliteDatabase,
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
    transaction: (operation) => database.transaction(operation),
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

  it('propõe grupo de XML elegível e cria perfil com vínculos apenas após confirmação', () => {
    const organization = cases.createOrganization({ name: 'Escritório' })
    const company = cases.createCompany({
      legalName: 'Empresa A', cnpj: '11.222.333/0001-81', state: 'PR',
    })
    const batchId = '00000000-0000-4000-8000-000000000010'
    const occurrenceId = '00000000-0000-4000-8000-000000000011'
    const documentId = '00000000-0000-4000-8000-000000000012'
    new SqliteBatchRepository(database).createWithOccurrences(
      {
        id: batchId, organizationId: organization.id, companyId: company.id,
        status: 'RECEBIDO', receivedAt: timestamp,
        createdAt: timestamp, updatedAt: timestamp,
      },
      [{
        id: occurrenceId, batchId, originalName: 'nota.xml', relativePath: 'nota.xml',
        detectedKind: 'XML', origin: 'SELECTED_FILE', contentHash: 'a'.repeat(64),
        sizeBytes: 100, order: 1, accessKey: '1'.repeat(44), ingestionStatus: 'PROCESSADA',
        repetition: 'ORIGINAL', contentConflict: 'SEM_CONFLITO',
        eligibleForTotalsByOccurrencePolicy: true, receivedAt: timestamp,
      }],
      [],
      [{
        id: documentId, batchId, companyId: company.id, occurrenceId,
        contentHash: 'a'.repeat(64), eligibleForProcessing: true, createdAt: timestamp,
        normalized: {
          kind: 'NFE', layoutVersion: '4.00', model: '55', accessKey: '1'.repeat(44),
          number: '1', series: '1', issuedAt: '2026-02-10T12:00:00.000Z',
          issuer: { taxId: '11222333000181', taxIdType: 'CNPJ', state: 'PR' },
          items: [{ itemNumber: '1', supplierProductCode: 'P1', description: 'Produto',
            ncm: '12345678', cest: '1234567', declaredIcms: { originCode: '0' },
            source: { format: 'NFE_XML_4_00', xmlPath: 'item' } }],
          declaredTotals: {}, source: { format: 'NFE_XML_4_00', xmlPath: 'NFe' },
        },
      }],
    )
    const suggestions = cases.listFiscalProfileSuggestions(company.id)
    expect(suggestions).toMatchObject([{
      name: 'NCM 12345678 · CEST 1234567 · origem 0',
      validFrom: '2026-02-10', products: [{ productCode: 'P1' }],
    }])
    expect(cases.listFiscalProfiles(company.id)).toEqual([])
    const result = cases.createSuggestedFiscalProfile({
      companyId: company.id, suggestionKey: suggestions[0]!.key,
    })
    expect(result.linkedProducts).toBe(1)
    expect(cases.listSupplierProducts(company.id)).toMatchObject([{
      productCode: 'P1', profileId: result.profile.id,
    }])
    expect(cases.listFiscalProfileSuggestions(company.id)).toEqual([])
    expect(() => cases.createSuggestedFiscalProfile({
      companyId: company.id, suggestionKey: suggestions[0]!.key,
    })).toThrowError(expect.objectContaining({ code: AppErrorCode.PROFILE_SUGGESTION_STALE }))
  })
})
