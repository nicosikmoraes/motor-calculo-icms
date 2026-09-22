import initialPersistenceSql from '../migrations/0001_nucleo_persistencia.sql?raw'
import { createSqlMigration, type SqlMigration } from './migrations'

export const CORE_MIGRATIONS: readonly SqlMigration[] = [
  createSqlMigration({
    version: 1,
    name: 'nucleo_persistencia',
    fileName: '0001_nucleo_persistencia.sql',
    sql: initialPersistenceSql,
  }),
]
