import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CORE_MIGRATIONS, SqliteBatchRepository, SqliteCompanyRepository, SqliteDatabase,
  SqliteFiscalCatalogRepository, SqliteOrganizationRepository, SqliteRegistrationAuditRepository, runSqlMigrations,
} from '@motor/database'
import { AppErrorCode, RegistrationEntityCode, RegistrationOperationCode } from '@motor/domain'
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
    audit: new SqliteRegistrationAuditRepository(database),
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
    expect(cases.renameOrganization({ name: 'Novo nome', expectedRevision: organization.revision }).name).toBe('Novo nome')
  })

  it('audita criações e alterações com revisão e somente os campos modificados', () => {
    const organization = cases.createOrganization({ name: 'Escritório' })
    const company = cases.createCompany({ legalName: 'Empresa A', cnpj: '11.222.333/0001-81', state: 'PR' })
    const profile = cases.createFiscalProfile({ companyId: company.id, name: 'Perfil', validFrom: '2026-01-01' })
    cases.saveSupplierProduct({ companyId: company.id, supplierCnpj: company.cnpj,
      productCode: 'P1', profileId: profile.id })
    const renamed = cases.renameOrganization({ name: 'Escritório novo', expectedRevision: organization.revision })

    expect(renamed.revision).toBe(2)
    expect(cases.listAudit({ entity: RegistrationEntityCode.ORGANIZATION, entityId: organization.id })
      .map(({ operation, revision, changes }) => ({ operation, revision, changes }))).toEqual([
      { operation: RegistrationOperationCode.UPDATE, revision: 2,
        changes: { name: { before: 'Escritório', after: 'Escritório novo' } } },
      { operation: RegistrationOperationCode.CREATE, revision: 1,
        changes: { name: { before: null, after: 'Escritório' }, active: { before: null, after: true } } },
    ])
    expect(cases.listAudit()).toHaveLength(5)
    expect(cases.listAudit({ operation: RegistrationOperationCode.CREATE })).toHaveLength(4)
  })

  it('recusa revisão antiga e desfaz a alteração se a auditoria falhar', () => {
    const organization = cases.createOrganization({ name: 'Escritório' })
    cases.renameOrganization({ name: 'Primeira edição', expectedRevision: organization.revision })
    expect(() => cases.renameOrganization({ name: 'Edição antiga', expectedRevision: organization.revision }))
      .toThrowError(expect.objectContaining({ code: AppErrorCode.REGISTRATION_REVISION_CONFLICT }))
    expect(cases.listAudit()).toHaveLength(2)

    database.exec(`CREATE TRIGGER rejeitar_evento BEFORE INSERT ON eventos_auditoria_cadastro
      WHEN NEW.operacao = 'UPDATE' BEGIN SELECT RAISE(ABORT, 'falha audit'); END;`)
    expect(() => cases.renameOrganization({ name: 'Segunda edição', expectedRevision: 2 })).toThrow(/falha audit/)
    expect(cases.getWorkspace().organization).toMatchObject({ name: 'Primeira edição', revision: 2 })
    expect(cases.listAudit()).toHaveLength(2)
  })

  it('exige revisão para alterar vínculo existente e preserva evento anterior no conflito', () => {
    cases.createOrganization({ name: 'Escritório' })
    const company = cases.createCompany({ legalName: 'Empresa A', cnpj: '11.222.333/0001-81', state: 'PR' })
    const firstProfile = cases.createFiscalProfile({ companyId: company.id, name: 'Perfil A', validFrom: '2026-01-01' })
    const secondProfile = cases.createFiscalProfile({ companyId: company.id, name: 'Perfil B', validFrom: '2026-01-01' })
    const product = cases.saveSupplierProduct({ companyId: company.id, supplierCnpj: company.cnpj,
      productCode: 'P1', profileId: firstProfile.id })
    expect(() => cases.saveSupplierProduct({ companyId: company.id, supplierCnpj: company.cnpj,
      productCode: 'P1', profileId: secondProfile.id }))
      .toThrowError(expect.objectContaining({ code: AppErrorCode.INVALID_REGISTRATION_REVISION }))
    const updated = cases.saveSupplierProduct({ companyId: company.id, supplierCnpj: company.cnpj,
      productCode: 'P1', profileId: secondProfile.id, expectedRevision: product.revision })
    expect(updated.revision).toBe(2)
    expect(() => cases.saveSupplierProduct({ companyId: company.id, supplierCnpj: company.cnpj,
      productCode: 'P1', profileId: firstProfile.id, expectedRevision: product.revision }))
      .toThrowError(expect.objectContaining({ code: AppErrorCode.REGISTRATION_REVISION_CONFLICT }))
    expect(cases.listAudit({ entity: RegistrationEntityCode.SUPPLIER_PRODUCT, entityId: product.id }))
      .toMatchObject([{ operation: RegistrationOperationCode.UPDATE, revision: 2,
        changes: { profileId: { before: firstProfile.id, after: secondProfile.id } } },
      { operation: RegistrationOperationCode.CREATE, revision: 1 }])
  })

  it('edita, inativa e reativa empresa sem alterar CNPJ ou histórico', () => {
    cases.createOrganization({ name: 'Escritório' })
    const company = cases.createCompany({ legalName: 'Original', cnpj: '11.222.333/0001-81', state: 'PR' })
    const updated = cases.updateCompany({ id: company.id, expectedRevision: company.revision,
      legalName: 'Atualizada', tradeName: 'Fantasia', state: 'SP' })
    expect(updated).toMatchObject({ revision: 2, cnpj: company.cnpj, legalName: 'Atualizada', state: 'SP' })
    expect(() => cases.updateCompany({ id: company.id, expectedRevision: company.revision,
      legalName: 'Antiga', state: 'RJ' })).toThrowError(
        expect.objectContaining({ code: AppErrorCode.REGISTRATION_REVISION_CONFLICT }))
    const inactive = cases.inactivateCompany({ id: company.id, expectedRevision: updated.revision })
    expect(inactive).toMatchObject({ active: false, revision: 3 })
    expect(() => cases.createFiscalProfile({ companyId: company.id, name: 'Novo', validFrom: '2026-01-01' }))
      .toThrowError(expect.objectContaining({ code: AppErrorCode.ACTIVE_COMPANY_NOT_FOUND }))
    const restored = cases.reactivateCompany({ id: company.id, expectedRevision: inactive.revision })
    expect(restored).toMatchObject({ active: true, revision: 4 })
    expect(cases.listAudit({ entity: RegistrationEntityCode.COMPANY, entityId: company.id })
      .map((event) => event.operation)).toEqual([
        RegistrationOperationCode.REACTIVATE, RegistrationOperationCode.INACTIVATE,
        RegistrationOperationCode.UPDATE, RegistrationOperationCode.CREATE,
      ])
    expect(cases.listAudit({ entity: RegistrationEntityCode.COMPANY, entityId: company.id })[2]?.changes)
      .toEqual({ legalName: { before: 'Original', after: 'Atualizada' },
        tradeName: { before: null, after: 'Fantasia' }, state: { before: 'PR', after: 'SP' } })
  })

  it('mantém vínculo e histórico ao inativar perfil e produto, com reativação validada', () => {
    cases.createOrganization({ name: 'Escritório' })
    const company = cases.createCompany({ legalName: 'Empresa', cnpj: '11.222.333/0001-81', state: 'PR' })
    const profile = cases.createFiscalProfile({ companyId: company.id, name: 'Perfil A', validFrom: '2026-01-01' })
    const product = cases.saveSupplierProduct({ companyId: company.id, supplierCnpj: company.cnpj,
      productCode: 'P1', profileId: profile.id })
    const edited = cases.updateFiscalProfile({ id: profile.id, expectedRevision: profile.revision,
      name: 'Perfil B', validFrom: '2026-02-01', validUntil: '2026-12-31' })
    expect(edited).toMatchObject({ name: 'Perfil B', revision: 2 })
    expect(() => cases.updateFiscalProfile({ id: profile.id, expectedRevision: profile.revision,
      name: 'Obsoleto', validFrom: '2026-01-01' }))
      .toThrowError(expect.objectContaining({ code: AppErrorCode.REGISTRATION_REVISION_CONFLICT }))
    const inactiveProfile = cases.inactivateFiscalProfile({ id: profile.id, expectedRevision: edited.revision })
    expect(inactiveProfile).toMatchObject({ active: false, revision: 3 })
    expect(cases.listSupplierProducts(company.id)).toMatchObject([{ id: product.id, active: true }])
    expect(() => cases.saveSupplierProduct({ companyId: company.id, supplierCnpj: company.cnpj,
      productCode: 'P2', profileId: profile.id }))
      .toThrowError(expect.objectContaining({ code: AppErrorCode.PROFILE_COMPANY_MISMATCH }))
    const inactiveProduct = cases.inactivateSupplierProduct({ id: product.id, expectedRevision: product.revision })
    expect(inactiveProduct).toMatchObject({ active: false, revision: 2 })
    expect(() => cases.reactivateSupplierProduct({ id: product.id, expectedRevision: inactiveProduct.revision }))
      .toThrowError(expect.objectContaining({ code: AppErrorCode.PROFILE_COMPANY_MISMATCH }))
    const restoredProfile = cases.reactivateFiscalProfile({ id: profile.id, expectedRevision: inactiveProfile.revision })
    expect(restoredProfile).toMatchObject({ active: true, revision: 4 })
    const restoredProduct = cases.reactivateSupplierProduct({ id: product.id, expectedRevision: inactiveProduct.revision })
    expect(restoredProduct).toMatchObject({ active: true, revision: 3, profileId: profile.id })
    expect(cases.listAudit({ entity: RegistrationEntityCode.FISCAL_PROFILE, entityId: profile.id })).toHaveLength(4)
    expect(cases.listAudit({ entity: RegistrationEntityCode.SUPPLIER_PRODUCT, entityId: product.id })).toHaveLength(3)
  })

  it('recusa acesso ao catálogo de empresa ausente', () => {
    cases.createOrganization({ name: 'Escritório' })
    expect(() => cases.listFiscalProfiles('inexistente')).toThrowError(
      expect.objectContaining({ code: AppErrorCode.REGISTRATION_NOT_FOUND }),
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
