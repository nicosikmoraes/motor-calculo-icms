import { ipcMain } from 'electron'
import { getBatchConsolidation } from './batch-consolidation'
import { fiscalCalculationView, IPC_CHANNELS, type BatchDetail, type BatchListItem } from '@motor/contracts'
import { SqliteBatchRepository, SqliteCompanyRepository, SqliteFiscalCatalogRepository,
  SqliteOrganizationRepository, SqliteCalculationRepository, type SqliteDatabase } from '@motor/database'
import { AppError, AppErrorCode } from '@motor/domain'
import { classifyFiscalItem } from './fiscal-item-classification'
import { buildItemFiscalContext, documentFiscalBlock, readItemFiscalAnswers } from './item-fiscal-use-cases'
import { activeDatabase, requiredInputText } from './main-services'
import { conflictEvidence, effectiveProcessingDocument } from './conflict-evidence'
import { artifactSummary, documentaryState, readDocumentaryIndex, relatedEvents, type DocumentaryIndex } from './documentary-evidence'
import { paranaInterstateEntryExclusionReason, isCalculationEligibleCfop, calculationCfopExclusionReason } from '@motor/domain'
import { entryReviewFindings } from './entry-review-findings'
import { isAutomaticCalculation } from './automatic-xml-calculation'
import { queryDashboard } from './dashboard-query'

/** Lista os lotes da organização e monta detalhes para a interface. */
export function registerBatchQueryHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.GET_DASHBOARD, () => queryDashboard(activeDatabase()))
  ipcMain.handle(IPC_CHANNELS.LIST_BATCHES, (): readonly BatchListItem[] => {
    const connection = activeDatabase()
    const organization = new SqliteOrganizationRepository(connection).findSingle()
    if (!organization) return []
    const companies = new Map(
      new SqliteCompanyRepository(connection)
        .listByOrganization(organization.id)
        .map((company) => [company.id, company]),
    )
    const batches = new SqliteBatchRepository(connection)
    return batches.listByOrganization(organization.id).map((batch) => {
      const companyCount = batches.countCompaniesByBatch(batch.id)
      return {
        id: batch.id,
        status: batch.status,
        ...(batch.companyId ? { companyId: batch.companyId } : {}),
        ...(companyCount > 1
          ? { companyName: `${companyCount} empresas` }
          : (batch.companyId && companies.get(batch.companyId)
            ? { companyName: companies.get(batch.companyId)!.legalName }
            : {})),
        ...(batch.originalName ? { originalName: batch.originalName } : {}),
        receivedAt: batch.receivedAt,
        ...(batch.environmentCode ? { environmentCode: batch.environmentCode } : {}),
        totalFiles: batch.totalFiles,
        totalDocuments: batch.totalDocuments,
        totalPendencies: batch.totalPendencies,
      }
    })
  })
  // Reúne documentos, ocorrências e diagnósticos para uma tela de lote.
  ipcMain.handle(
    IPC_CHANNELS.GET_BATCH_DETAIL,
    (_event, rawBatchId: unknown, rawRunId: unknown): BatchDetail => {
      const batchId = requiredInputText(rawBatchId, 'Lote')
      const runId = rawRunId === undefined ? undefined : requiredInputText(rawRunId, 'Execução')
      const connection = activeDatabase()
      return queryBatchDetail(connection, batchId, runId)
    },
  )
}

/** Consulta compartilhada pela tela e pela exportação, com escopo da organização ativa. */
export function queryBatchDetail(connection: SqliteDatabase, batchId: string, runId?: string, evidence = readDocumentaryIndex(connection)): BatchDetail {
  const organization = new SqliteOrganizationRepository(connection).findSingle()
  const batches = new SqliteBatchRepository(connection)
  const batch = batches.findById(batchId)
  if (!organization || !batch || batch.organizationId !== organization.id) {
    throw new AppError(AppErrorCode.BATCH_NOT_FOUND)
  }
  const companies = new Map(new SqliteCompanyRepository(connection)
    .listByOrganization(organization.id).map((company) => [company.id, company]))
  // Regras fiscais vêm do registro histórico; a classificação cadastral usa o catálogo atual.
  const documents = batches.listNormalizedDocuments(batchId)
  const occurrences = batches.listOccurrences(batchId)
  const documentArtifacts = batches.listDocumentArtifacts(batchId)
  const relatedArtifacts = new Map(documentArtifacts.map(a => [a.id, a]))
  for (const document of documents) for (const event of relatedEvents(evidence, document)) relatedArtifacts.set(event.id, event)
  const fiscalBlocks = new Map(documents.map(document => [document.id, documentFiscalBlock(effectiveProcessingDocument(evidence, document), documentArtifacts)] as const))
  const calculations = new SqliteCalculationRepository(connection)
  const latestCalculations = new Map(documents.map((document) => [document.id, calculations.latestByDocument(document.id)] as const))
  const ruleAssessmentRuns = batches.listRuleAssessmentRuns(batchId)
  const selectedAssessments = runId ? batches.readRuleAssessmentsForRun(batchId, runId) : undefined
  const originalAssessment = documents.flatMap((document) => Object.values(document.ruleAssessments ?? {}))[0]
  const catalog = new SqliteFiscalCatalogRepository(connection)
  const assignedCompanyIds = [...new Set(documents.map((document) => document.companyId).filter((id): id is string => Boolean(id)))]
  const profilesByCompany = new Map(assignedCompanyIds.map((id) => [id, catalog.listProfiles(id)] as const))
  const productsByCompany = new Map(assignedCompanyIds.map((id) => [id, catalog.listSupplierProducts(id)] as const))
  const companyIds = new Set(documents.map((document) => document.companyId).filter(Boolean))
  const companyName = companyIds.size > 1
    ? `${companyIds.size} empresas`
    : (batch.companyId ? companies.get(batch.companyId)?.legalName : undefined)
  return {
    batch: {
      id: batch.id,
      status: batch.status,
      ...(batch.companyId ? { companyId: batch.companyId } : {}),
      ...(companyName ? { companyName } : {}),
      ...(companyIds.size === 1 && companies.get([...companyIds][0]!) ? { companyCnpj: companies.get([...companyIds][0]!)!.cnpj } : {}),
      ...(batch.originalName ? { originalName: batch.originalName } : {}),
      receivedAt: batch.receivedAt,
      ...(batch.environmentCode ? { environmentCode: batch.environmentCode } : {}),
      totalFiles: batch.totalFiles,
      totalDocuments: batch.totalDocuments,
      totalPendencies: batch.totalPendencies,
    },
    consolidation: getBatchConsolidation(connection, batchId, evidence),
    occurrences: occurrences.map((occurrence) => ({
      id: occurrence.id,
      originalName: occurrence.originalName,
      relativePath: occurrence.relativePath,
      kind: occurrence.detectedKind,
      origin: occurrence.origin,
      contentHash: occurrence.contentHash,
      sizeBytes: occurrence.sizeBytes,
      ...(occurrence.accessKey ? { accessKey: occurrence.accessKey } : {}),
      ingestionStatus: occurrence.ingestionStatus,
      repetition: occurrence.repetition,
      contentConflict: occurrence.contentConflict,
      eligibleForTotals: occurrence.eligibleForTotalsByOccurrencePolicy,
    })),
    diagnostics: batches.listDiagnostics(batchId).map((diagnostic) => ({
      id: diagnostic.id,
      source: diagnostic.source,
      code: diagnostic.code,
      message: diagnostic.message,
    })),
    artifacts: [...relatedArtifacts.values()].map(artifact => artifactSummary(evidence, artifact,
      documents.find(d => d.normalized.accessKey === artifact.normalized.accessKey && d.normalized.environmentCode === artifact.normalized.environmentCode))),
    ruleAssessmentRuns,
    ...(originalAssessment ? { originalAssessmentPack: { id: originalAssessment.packId, version: originalAssessment.packVersion } } : {}),
    documents: documents.map(({
      id, companyId, normalized, ruleAssessments, eligibleForProcessing, pendingReason,
    }) => ({
      id,
      ...(() => { const state = documentaryState(evidence, evidence.documents.get(id)!)
        return { documentaryStatus: state.status, ...(state.reason ? { documentaryReason: state.reason } : {}) } })(),
      ...(companyId ? { companyId } : {}),
      ...(companyId && companies.get(companyId) ? { companyName: companies.get(companyId)!.legalName } : {}),
      ...(companyId && companies.get(companyId) ? { companyCnpj: companies.get(companyId)!.cnpj } : {}),
      accessKey: normalized.accessKey,
      model: normalized.model,
      number: normalized.number,
      series: normalized.series,
      ...(normalized.issuedAt ? { issuedAt: normalized.issuedAt } : {}),
      ...(normalized.environmentCode ? { environmentCode: normalized.environmentCode } : {}),
      ...(() => { const document = effectiveProcessingDocument(evidence, evidence.documents.get(id)!)
        const resolution = conflictEvidence(evidence, document)
        return { eligibleForProcessing: document.eligibleForProcessing, ...(document.pendingReason ? { pendingReason: document.pendingReason } : {}),
          ...(resolution ? { conflictResolution: resolution } : {}) } })(),
      ...(normalized.issuer.name ? { issuerName: normalized.issuer.name } : {}),
      ...(normalized.issuer.taxId ? { issuerTaxId: normalized.issuer.taxId } : {}),
      ...(normalized.recipient?.name ? { recipientName: normalized.recipient.name } : {}),
      ...(normalized.recipient?.taxId ? { recipientTaxId: normalized.recipient.taxId } : {}),
      items: normalized.items.map((item) => {
        const selectedAssessment = selectedAssessments?.get(id)?.[item.itemNumber] ?? ruleAssessments?.[item.itemNumber]
        return {
          itemNumber: item.itemNumber,
          entryCalculationEligible: !paranaInterstateEntryExclusionReason(normalized, item.cfop, companies.get(companyId ?? '')?.cnpj),
          ...(paranaInterstateEntryExclusionReason(normalized, item.cfop, companies.get(companyId ?? '')?.cnpj) ? { entryCalculationExclusionReason: paranaInterstateEntryExclusionReason(normalized, item.cfop, companies.get(companyId ?? '')?.cnpj)! } : {}),
          ...(normalized.operationDirection === '1' && normalized.recipient?.state === 'PR' && normalized.issuer.state !== 'PR'
            && companies.get(companyId ?? '')?.cnpj === normalized.recipient?.taxId
            ? { entryReviewReasons: entryReviewFindings(normalized,item,readItemFiscalAnswers(latestCalculations.get(id)?.items.find(entry=>entry.itemNumber===item.itemNumber)?.memory)).findings.map(f => f.reason) } : {}),
          calculation: (() => {
            const run = latestCalculations.get(id)
            const rawSaved = run?.items.find((entry) => entry.itemNumber === item.itemNumber)
            const saved = rawSaved ? { ...rawSaved, memory: { ...fiscalCalculationView(rawSaved.memory), schemaVersion: 1 as const } } : undefined
            const calculation = buildItemFiscalContext(normalized, item, readItemFiscalAnswers(saved?.memory), saved?.memory, run?.id,
              fiscalBlocks.get(id), companies.get(companyId ?? '')?.cnpj).calculation
            // A situação documental controla os totais; a memória salva permanece visível para diagnóstico.
            return saved && run ? { ...saved.memory, runId: run.id, engineVersion: run.engineVersion,
              ...(!isAutomaticCalculation(saved.memory) && saved.memory.status !== 'CALCULATED' && calculation.status === saved.memory.status && calculation.reason
                ? { reason: calculation.reason } : {}),
              ...(saved.memory.status === 'CALCULATED' && readItemFiscalAnswers(saved.memory).entryMethod
                && (calculation.status !== 'CALCULATED' || calculation.reviewReason)
                ? { reviewReason: calculation.reviewReason ?? `${calculation.reason ?? 'Revise as condições da entrada.'} O resultado anterior está preservado para auditoria.`,
                    reviewStatus: calculation.reviewStatus ?? (calculation.status === 'CALCULATED' ? 'PENDING_RULE' as const : calculation.status) } : {}),
              ...(!isCalculationEligibleCfop(item.cfop) ? { reviewStatus: 'UNSUPPORTED' as const, reviewReason: `${calculationCfopExclusionReason} O resultado anterior está preservado para auditoria.` } : {}),
              ...(isCalculationEligibleCfop(item.cfop) && saved.memory.status === 'CALCULATED' && !isAutomaticCalculation(saved.memory) && (saved.memory.component ?? saved.memory.result?.component) === 'ICMS_ST' && (readItemFiscalAnswers(saved.memory).fcpStApplicableConfirmed === undefined || (calculation.inputs.some(input => input.name === 'stSpecificMvaDecision') && !saved.memory.inputs.some(input => input.name === 'stSpecificMvaDecision')))
                ? { reviewReason: `${calculation.reason ?? 'Confirme a incidência de FCP-ST e revise a alíquota interna.'} O cálculo anterior está preservado para auditoria.`,
                    reviewStatus: calculation.status === 'CALCULATED' ? 'PENDING_DATA' as const : calculation.status } : {}) } : calculation
          })(),
          ...(selectedAssessment ? { ruleAssessment: selectedAssessment } : {}),
          ...(runId && ruleAssessments?.[item.itemNumber]
            ? { originalRuleAssessment: ruleAssessments[item.itemNumber] } : {}),
          ...classifyFiscalItem(
            companyId, normalized.issuer.taxIdType === 'CNPJ' ? normalized.issuer.taxId : undefined,
            item.supplierProductCode, normalized.issuedAt,
            profilesByCompany.get(companyId ?? '') ?? [],
            productsByCompany.get(companyId ?? '') ?? [],
          ),
          ...(item.supplierProductCode ? { supplierProductCode: item.supplierProductCode } : {}),
          ...(item.description ? { description: item.description } : {}),
          ...(item.ncm ? { ncm: item.ncm } : {}),
          ...(item.cfop ? { cfop: item.cfop } : {}),
          ...(item.productAmount ? { productAmount: item.productAmount } : {}),
          ...(item.declaredIcms?.amount ? { declaredIcmsAmount: item.declaredIcms.amount } : {}),
          ...(item.declaredIcms?.stAmount !== undefined ? { declaredIcmsStAmount: item.declaredIcms.stAmount } : {}),
          ...(item.declaredIcms?.fcpStAmount !== undefined ? { declaredFcpStAmount: item.declaredIcms.fcpStAmount } : {}),
          ...(item.declaredIcms?.fcpStBaseAmount !== undefined ? { declaredFcpStBaseAmount: item.declaredIcms.fcpStBaseAmount } : {}),
          ...(item.declaredIcms?.fcpStRate !== undefined ? { declaredFcpStRate: item.declaredIcms.fcpStRate } : {}),
        }
      }),
    })),
  }
}
