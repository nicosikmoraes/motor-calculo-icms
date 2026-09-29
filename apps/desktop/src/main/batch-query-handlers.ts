import { ipcMain } from 'electron'
import { IPC_CHANNELS, type BatchDetail, type BatchListItem } from '@motor/contracts'
import { SqliteBatchRepository, SqliteCompanyRepository, SqliteFiscalCatalogRepository,
  SqliteOrganizationRepository, SqliteCalculationRepository } from '@motor/database'
import { AppError, AppErrorCode } from '@motor/domain'
import { pendingCalculation } from '@motor/tax-engine'
import { classifyFiscalItem } from './fiscal-item-classification'
import { activeDatabase, requiredInputText } from './main-services'

/** Lista os lotes da organização e monta detalhes para a interface. */
export function registerBatchQueryHandlers(): void {
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
          ...(batch.originalName ? { originalName: batch.originalName } : {}),
          receivedAt: batch.receivedAt,
          ...(batch.environmentCode ? { environmentCode: batch.environmentCode } : {}),
          totalFiles: batch.totalFiles,
          totalDocuments: batch.totalDocuments,
          totalPendencies: batch.totalPendencies,
        },
        occurrences: batches.listOccurrences(batchId).map((occurrence) => ({
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
        ruleAssessmentRuns,
        ...(originalAssessment ? { originalAssessmentPack: { id: originalAssessment.packId, version: originalAssessment.packVersion } } : {}),
        documents: documents.map(({
          id, companyId, normalized, ruleAssessments, eligibleForProcessing, pendingReason,
        }) => ({
          id,
          ...(companyId ? { companyId } : {}),
          ...(companyId && companies.get(companyId) ? { companyName: companies.get(companyId)!.legalName } : {}),
          accessKey: normalized.accessKey,
          model: normalized.model,
          number: normalized.number,
          series: normalized.series,
          ...(normalized.issuedAt ? { issuedAt: normalized.issuedAt } : {}),
          ...(normalized.environmentCode ? { environmentCode: normalized.environmentCode } : {}),
          eligibleForProcessing,
          ...(pendingReason ? { pendingReason } : {}),
          ...(normalized.issuer.name ? { issuerName: normalized.issuer.name } : {}),
          ...(normalized.issuer.taxId ? { issuerTaxId: normalized.issuer.taxId } : {}),
          ...(normalized.recipient?.name ? { recipientName: normalized.recipient.name } : {}),
          ...(normalized.recipient?.taxId ? { recipientTaxId: normalized.recipient.taxId } : {}),
          items: normalized.items.map((item) => {
            const selectedAssessment = selectedAssessments?.get(id)?.[item.itemNumber] ?? ruleAssessments?.[item.itemNumber]
            return {
              itemNumber: item.itemNumber,
              calculation: (() => {
                const run = latestCalculations.get(id)
                const saved = run?.items.find((entry) => entry.itemNumber === item.itemNumber)
                if (saved) return { ...saved.memory, runId: run!.id, engineVersion: run!.engineVersion }
                return pendingCalculation(
                  'PENDING_RULE',
                  'A composição da base, as exceções e o arredondamento ainda aguardam homologação fiscal.',
                  [
                    ...(item.productAmount ? [{ name: 'valorProduto', value: item.productAmount, source: 'XML/item', treatment: 'UNDECIDED' as const }] : []),
                    ...(item.freightAmount ? [{ name: 'frete', value: item.freightAmount, source: 'XML/item', treatment: 'UNDECIDED' as const }] : []),
                    ...(item.insuranceAmount ? [{ name: 'seguro', value: item.insuranceAmount, source: 'XML/item', treatment: 'UNDECIDED' as const }] : []),
                    ...(item.discountAmount ? [{ name: 'desconto', value: item.discountAmount, source: 'XML/item', treatment: 'UNDECIDED' as const }] : []),
                    ...(item.otherAmount ? [{ name: 'outrasDespesas', value: item.otherAmount, source: 'XML/item', treatment: 'UNDECIDED' as const }] : []),
                    ...(item.ipiAmount ? [{ name: 'IPI', value: item.ipiAmount, source: 'XML/item', treatment: 'UNDECIDED' as const }] : []),
                  ],
                  {
                    ...(item.declaredIcms?.baseAmount ? { base: item.declaredIcms.baseAmount } : {}),
                    ...(item.declaredIcms?.rate ? { rate: item.declaredIcms.rate } : {}),
                    ...(item.declaredIcms?.amount ? { amount: item.declaredIcms.amount } : {}),
                  },
                )
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
            }
          }),
        })),
      }
    },
  )
}
