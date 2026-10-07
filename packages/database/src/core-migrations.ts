import initialPersistenceSql from '../migrations/0001_nucleo_persistencia.sql?raw'
import batchCancellationSql from '../migrations/0002_cancelamento_lote.sql?raw'
import ingestionDiagnosticsSql from '../migrations/0003_diagnosticos_ingestao.sql?raw'
import normalizedDocumentsSql from '../migrations/0004_documentos_itens_normalizados.sql?raw'
import ingestionEligibilitySql from '../migrations/0005_elegibilidade_ingestao.sql?raw'
import companyPerDocumentSql from '../migrations/0006_empresa_por_documento.sql?raw'
import supplierProfilesSql from '../migrations/0007_perfis_produtos_fornecedor.sql?raw'
import calculationRunsSql from '../migrations/0008_execucoes_calculo.sql?raw'
import historicalRuleAssessmentSql from '../migrations/0009_avaliacao_regras_historica.sql?raw'
import ruleAssessmentRunsSql from '../migrations/0010_execucoes_avaliacao_regras.sql?raw'
import registrationAuditSql from '../migrations/0011_auditoria_cadastros.sql?raw'
import registrationLifecycleSql from '../migrations/0012_ciclo_vida_cadastros.sql?raw'
import versionedFiscalRulesSql from '../migrations/0013_regras_fiscais_versionadas.sql?raw'
import documentArtifactsSql from '../migrations/0014_artefatos_documentais.sql?raw'
import fiscalAnswerDefinitionsSql from '../migrations/0015_definicoes_respostas_fiscais.sql?raw'
import conflictResolutionsSql from '../migrations/0017_resolucoes_conflitos.sql?raw'
import documentReviewsSql from '../migrations/0016_revisoes_documentais.sql?raw'
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
  createSqlMigration({
    version: 9,
    name: 'avaliacao_regras_historica',
    fileName: '0009_avaliacao_regras_historica.sql',
    sql: historicalRuleAssessmentSql,
  }),
  createSqlMigration({
    version: 10,
    name: 'execucoes_avaliacao_regras',
    fileName: '0010_execucoes_avaliacao_regras.sql',
    sql: ruleAssessmentRunsSql,
  }),
  createSqlMigration({
    version: 11,
    name: 'auditoria_cadastros',
    fileName: '0011_auditoria_cadastros.sql',
    sql: registrationAuditSql,
  }),
  createSqlMigration({
    version: 12, name: 'ciclo_vida_cadastros',
    fileName: '0012_ciclo_vida_cadastros.sql', sql: registrationLifecycleSql,
  }),
  createSqlMigration({
    version: 13, name: 'regras_fiscais_versionadas',
    fileName: '0013_regras_fiscais_versionadas.sql', sql: versionedFiscalRulesSql,
  }),
  createSqlMigration({
    version: 14, name: 'artefatos_documentais',
    fileName: '0014_artefatos_documentais.sql', sql: documentArtifactsSql,
  }),
  createSqlMigration({
    version: 15, name: 'definicoes_respostas_fiscais',
    fileName: '0015_definicoes_respostas_fiscais.sql', sql: fiscalAnswerDefinitionsSql,
  }),
  createSqlMigration({ version: 16, name: 'revisoes_documentais',
    fileName: '0016_revisoes_documentais.sql', sql: documentReviewsSql }),
  createSqlMigration({ version: 17, name: 'resolucoes_conflitos',
    fileName: '0017_resolucoes_conflitos.sql', sql: conflictResolutionsSql }),
]
