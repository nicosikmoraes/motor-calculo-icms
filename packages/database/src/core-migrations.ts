import initialPersistenceSql from '../migrations/0001_nucleo_persistencia.sql?raw'
import batchCancellationSql from '../migrations/0002_cancelamento_lote.sql?raw'
import { createSqlMigration, type SqlMigration } from './migrations'

export const CORE_MIGRATIONS: readonly SqlMigration[] = [
  createSqlMigration({
    version: 1,
    name: 'nucleo_persistencia',
    fileName: '0001_nucleo_persistencia.sql',
    sql: initialPersistenceSql,
  }),
  createSqlMigration({
    version: 2,
    name: 'cancelamento_lote',
    fileName: '0002_cancelamento_lote.sql',
    sql: batchCancellationSql,
  }),
]
