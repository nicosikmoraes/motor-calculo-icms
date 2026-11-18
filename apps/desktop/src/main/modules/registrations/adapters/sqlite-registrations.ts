import { randomUUID } from 'node:crypto'
import {
  SqliteCompanyRepository, type SqliteDatabase, SqliteFiscalCatalogRepository,
  SqliteOrganizationRepository, SqliteRegistrationAuditRepository,
} from '@motor/database'
import { RegistrationUseCases } from '../application/registration-use-cases'

export function createRegistrationUseCases(connection: SqliteDatabase): RegistrationUseCases {
  return new RegistrationUseCases({
    transaction: (operation) => connection.transaction(operation),
    organizations: new SqliteOrganizationRepository(connection),
    companies: new SqliteCompanyRepository(connection),
    audit: new SqliteRegistrationAuditRepository(connection),
    catalog: new SqliteFiscalCatalogRepository(connection),
  }, randomUUID, () => new Date().toISOString())
}
