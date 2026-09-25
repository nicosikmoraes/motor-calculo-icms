import initialPersistenceSql from '../migrations/0001_nucleo_persistencia.sql?raw'
import batchCancellationSql from '../migrations/0002_cancelamento_lote.sql?raw'
import ingestionDiagnosticsSql from '../migrations/0003_diagnosticos_ingestao.sql?raw'
import normalizedDocumentsSql from '../migrations/0004_documentos_itens_normalizados.sql?raw'
import ingestionEligibilitySql from '../migrations/0005_elegibilidade_ingestao.sql?raw'
import companyPerDocumentSql from '../migrations/0006_empresa_por_documento.sql?raw'
import supplierProfilesSql from '../migrations/0007_perfis_produtos_fornecedor.sql?raw'
import calculationRunsSql from '../migrations/0008_execucoes_calculo.sql?raw'
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
  createSqlMigration({
    version: 3,
    name: 'diagnosticos_ingestao',
    fileName: '0003_diagnosticos_ingestao.sql',
    sql: ingestionDiagnosticsSql,
  }),
  createSqlMigration({
    version: 4,
    name: 'documentos_itens_normalizados',
    fileName: '0004_documentos_itens_normalizados.sql',
    sql: normalizedDocumentsSql,
  }),
  createSqlMigration({
    version: 5,
    name: 'elegibilidade_ingestao',
    fileName: '0005_elegibilidade_ingestao.sql',
    sql: ingestionEligibilitySql,
  }),
  createSqlMigration({
    version: 6,
    name: 'empresa_por_documento',
    fileName: '0006_empresa_por_documento.sql',
    sql: companyPerDocumentSql,
  }),
  createSqlMigration({
    version: 7,
    name: 'perfis_produtos_fornecedor',
    fileName: '0007_perfis_produtos_fornecedor.sql',
    sql: supplierProfilesSql,
  }),
  createSqlMigration({
    version: 8,
    name: 'execucoes_calculo',
    fileName: '0008_execucoes_calculo.sql',
    sql: calculationRunsSql,
  }),
]
