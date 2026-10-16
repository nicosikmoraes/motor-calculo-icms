import { isCalculationEligibleCfop, calculationCfopExclusionReason } from '@motor/domain'
import { specificStSector } from '@motor/tax-engine'
import { buildBatchConsolidation, type ConsolidationDocument } from '@motor/reporting'
import { SqliteBatchRepository, SqliteCompanyRepository, SqliteOrganizationRepository, SqliteCalculationRepository, type SqliteDatabase } from '@motor/database'
import { documentFiscalBlock, readItemFiscalAnswers } from './item-fiscal-use-cases'
import { purchaseStScope } from './purchase-st-context'
import { conflictEvidence, effectiveProcessingDocument, selectionProblem } from './conflict-evidence'
import { documentaryState, readDocumentaryIndex, type DocumentaryIndex } from './documentary-evidence'
import { isAutomaticCalculation, isAutomaticXmlCalculation } from './automatic-xml-calculation'

/** Lê evidências persistidas da organização ativa; não executa cálculo fiscal. */
export function getBatchConsolidation(connection: SqliteDatabase, batchId: string, index?: DocumentaryIndex) {
  return buildBatchConsolidation(batchId, getBatchConsolidationDocuments(connection, batchId, undefined, index))
}

export function getBatchConsolidationDocuments(connection: SqliteDatabase, batchId: string, companyId?: string, evidence = readDocumentaryIndex(connection)): readonly (ConsolidationDocument & { contentHash: string; reviewReason?: string | undefined; resolvedContentHash?: string | undefined; preferredDocumentId?: string | undefined })[] {
  const organization = new SqliteOrganizationRepository(connection).findSingle()
  const batches = new SqliteBatchRepository(connection)
  const batch = batches.findById(batchId)
  if (!organization || !batch || batch.organizationId !== organization.id) throw new Error('Lote não encontrado.')
  const companies = new Map(new SqliteCompanyRepository(connection).listByOrganization(organization.id).map(company => [company.id, company]))
  const documents = batches.listNormalizedDocuments(batchId).filter(d => !companyId || d.companyId === companyId)
  const occurrences = batches.listOccurrences(batchId)
  const documentArtifacts = batches.listDocumentArtifacts(batchId)
  const fiscalBlocks = new Map(documents.map(document => [document.id, documentFiscalBlock(effectiveProcessingDocument(evidence, document), documentArtifacts)]))
  const calculations = new SqliteCalculationRepository(connection)
  const latestCalculations = new Map(documents.map(document => [document.id, calculations.latestByDocument(document.id)]))
  return documents.map(document => {
    const nfe = document.normalized
    const company = companies.get(document.companyId ?? '')
    const issuer = Boolean(company && company.cnpj === nfe.issuer.taxId)
    const recipient = Boolean(company && company.cnpj === nfe.recipient?.taxId)
    const occurrence = occurrences.find(entry => entry.id === document.occurrenceId)
    const run = latestCalculations.get(document.id)
    const authorized = documentArtifacts.some(artifact => artifact.documentId === document.id
      && artifact.association === 'ASSOCIATED' && artifact.normalized.kind === 'PROTOCOL'
      && artifact.normalized.accessKey === nfe.accessKey && artifact.normalized.environmentCode === nfe.environmentCode
      && artifact.normalized.responseMatches !== false && Boolean(artifact.normalized.protocolNumber)
      && ['100', '150'].includes(artifact.normalized.statusCode ?? ''))
    const lifecycle = documentaryState(evidence, document)
    const documentaryReason = lifecycle.reason
    const resolution = conflictEvidence(evidence, document)
    const chosenEligible = resolution?.selected && !selectionProblem(evidence, document)
    const copies = chosenEligible ? documents.filter(d => d.companyId === document.companyId && d.contentHash === document.contentHash && !selectionProblem(evidence, d))
      .sort((a, b) => (Number(b.id === resolution!.chosenDocumentId) - Number(a.id === resolution!.chosenDocumentId))
        || (evidence.occurrences.get(a.occurrenceId)?.order ?? 0) - (evidence.occurrences.get(b.occurrenceId)?.order ?? 0) || a.id.localeCompare(b.id)) : []
    const policyReason = copies[0] && copies[0].id !== document.id ? `Cópia da versão escolhida. Referência: documento ${copies[0].id}.`
      : chosenEligible ? undefined : !occurrence?.eligibleForTotalsByOccurrencePolicy ? 'Ocorrência duplicada, conflitante ou inelegível para totalização.' : undefined
    return {
      ...(resolution?.status === 'RESOLVED' ? { resolvedContentHash: resolution.chosenContentHash, preferredDocumentId: resolution.chosenDocumentId } : {}),
      batchId, contentHash: document.contentHash, documentId: document.id, accessKey: nfe.accessKey, documentNumber: nfe.number,
      companyId: company?.id, companyName: company?.legalName, issuedAt: nfe.issuedAt,
      perspective: issuer === recipient ? 'UNDETERMINED' : (issuer !== (nfe.operationDirection === '0')) ? 'SALES' : 'PURCHASES',
      environment: nfe.environmentCode === '1' || nfe.environmentCode === '2' ? nfe.environmentCode : 'UNKNOWN',
      authorization: authorized ? 'WITH_PROTOCOL' : 'UNVERIFIED',
      reviewReason: (document.pendingReason === 'OCORRENCIA_INELEGIVEL' ? undefined : fiscalBlocks.get(document.id)) ?? documentaryReason,
      exclusionReason: documentaryReason ?? fiscalBlocks.get(document.id) ?? policyReason,
      runId: run?.id, engineVersion: run?.engineVersion,
      items: nfe.items.map(item => {
        const memory = run?.items.find(saved => saved.itemNumber === item.itemNumber)?.memory
        if (!isCalculationEligibleCfop(item.cfop)) return { cfop: item.cfop, itemNumber: item.itemNumber,
          declaredIcms: item.declaredIcms?.amount, declaredIcmsSt: item.declaredIcms?.stAmount, declaredFcpSt: item.declaredIcms?.fcpStAmount,
          declaredFcpStBase: item.declaredIcms?.fcpStBaseAmount, declaredFcpStRate: item.declaredIcms?.fcpStRate, memory,
          exclusionReason: calculationCfopExclusionReason }
        if (memory?.status === 'CALCULATED' && !isAutomaticXmlCalculation(memory) && (memory.component ?? memory.result?.component) === 'ICMS_ST') {
          const answers = readItemFiscalAnswers(memory)
          const scope = purchaseStScope(nfe, item, answers, company?.cnpj)
          const regime = scope?.supplier.taxRegimeCode ?? (answers.stSupplierNormalConfirmed ? '3' : undefined)
          if (!scope || regime !== '3' || nfe.finalConsumerIndicator === '1' || scope.buyer.stateRegistrationIndicator === '9'
            || (item.declaredIcms?.cst !== undefined && !['00', '10'].includes(item.declaredIcms.cst))) {
            return { cfop: item.cfop, itemNumber: item.itemNumber, declaredIcms: item.declaredIcms?.amount, declaredIcmsSt: item.declaredIcms?.stAmount, declaredFcpSt: item.declaredIcms?.fcpStAmount,
            declaredFcpStBase: item.declaredIcms?.fcpStBaseAmount, declaredFcpStRate: item.declaredIcms?.fcpStRate,
              memory: { ...memory, status: 'UNSUPPORTED' as const,
                reason: 'A memória de ICMS-ST exige nova conferência da perspectiva da empresa, do regime ou do enquadramento. O resultado anterior está preservado para auditoria.' } }
          }
          if (specificStSector(item.ncm, item.cest, item.fuelAnpCode) && !memory.inputs.some(input => input.name === 'stSpecificMvaDecision')) return {
            cfop: item.cfop, itemNumber: item.itemNumber, declaredIcms: item.declaredIcms?.amount, declaredIcmsSt: item.declaredIcms?.stAmount,
            declaredFcpSt: item.declaredIcms?.fcpStAmount, declaredFcpStBase: item.declaredIcms?.fcpStBaseAmount, declaredFcpStRate: item.declaredIcms?.fcpStRate,
            memory: { ...memory, status: 'PENDING_RULE' as const, reason: 'A MVA de combustível ou veículo exige nova conferência das condições específicas. O resultado anterior está preservado para auditoria.' } }
          if (answers.fcpStApplicableConfirmed === undefined && !isAutomaticCalculation(memory)) return { cfop: item.cfop, itemNumber: item.itemNumber,
            declaredIcms: item.declaredIcms?.amount, declaredIcmsSt: item.declaredIcms?.stAmount, declaredFcpSt: item.declaredIcms?.fcpStAmount,
            declaredFcpStBase: item.declaredIcms?.fcpStBaseAmount, declaredFcpStRate: item.declaredIcms?.fcpStRate,
            memory: { ...memory, status: 'PENDING_DATA' as const, reason: 'Confirme a incidência de FCP-ST e revise a alíquota interna antes de totalizar. O resultado anterior está preservado para auditoria.' } }
        }
        return { cfop: item.cfop, itemNumber: item.itemNumber, declaredIcms: item.declaredIcms?.amount,
          declaredIcmsSt: item.declaredIcms?.stAmount, declaredFcpSt: item.declaredIcms?.fcpStAmount,
            declaredFcpStBase: item.declaredIcms?.fcpStBaseAmount, declaredFcpStRate: item.declaredIcms?.fcpStRate, memory }
      }),
    }
  })
}
