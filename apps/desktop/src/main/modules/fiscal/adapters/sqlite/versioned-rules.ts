import { randomUUID } from 'node:crypto'
import { type SqliteDatabase, SqliteOrganizationRepository, SqliteVersionedRuleRepository } from '@motor/database'
import { VersionedRuleUseCases } from '../../application/versioned-rule-use-cases'

export function createVersionedRuleUseCases(connection: SqliteDatabase): VersionedRuleUseCases {
  return new VersionedRuleUseCases({
    transaction: (operation) => connection.transaction(operation),
    organizations: new SqliteOrganizationRepository(connection),
    rules: new SqliteVersionedRuleRepository(connection),
  }, randomUUID, () => new Date().toISOString())
}
