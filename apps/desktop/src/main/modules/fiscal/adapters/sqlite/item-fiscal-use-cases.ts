import { randomUUID } from 'node:crypto'
import { CALCULATION_INCOMPLETE_PREFIX, documentaryTaxReview, fiscalCalculationView, itemCalculationComponents, itemCalculationStatus,
  type ItemCalculationSummary, type ItemFiscalAnswers, type ItemFiscalContext, type SaveItemFiscalAnswersInput } from '@motor/contracts'
import { calculationCfopExclusionReason, isCalculationEligibleCfop, paranaInterstateEntryExclusionReason,
  type NormalizedNfe, type NormalizedNfeItem } from '@motor/domain'
import { SqliteBatchRepository, SqliteCalculationRepository, SqliteCompanyRepository, SqliteFiscalAnswerDefinitionRepository,
  SqliteOrganizationRepository, type FiscalAnswerDefinitionKey, type NormalizedFiscalDocumentRecord, type SqliteDatabase } from '@motor/database'
import type { CalculationMemory } from '@motor/tax-engine'

import { AUTOMATIC_CATALOG_VERSION, AUTOMATIC_XML_VERSION, automaticCalculationDescription, calculateAutomaticItem,
  calculateAutomaticXmlItem, isAutomaticCalculation, isAutomaticXmlCalculation } from '../../domain/automatic-xml-calculation'
import { allocatedDocument, positive } from '../../domain/document-charge-allocation'
import { purchaseReviewRequired, readItemFiscalAnswers, validateItemFiscalAnswers } from '../../domain/item-fiscal-answers'
import { buildItemFiscalContext, buildItemFiscalReviewContext, memorySnapshot } from '../../domain/item-fiscal-context'
import { classificationProductFamily } from '../../domain/product-classification-review'
import { purchaseDestinationAnswers } from '../../domain/purchase-destination-policy'
import { purchaseStScope } from '../../domain/purchase-st-context'
import { effectiveProcessingDocument } from './conflict-evidence'
import { documentFiscalBlock, documentaryState, readDocumentaryIndex } from './documentary-evidence'

const version = 'PR_FISCAL_11'

function assertCompletedCalculation(calculation: ItemCalculationSummary, input: SaveItemFiscalAnswersInput, itemNumber = input.itemNumber): void {
  if (!input.requireCalculated || itemCalculationStatus(calculation) === 'CALCULATED') return
  const reasons = [...new Set(itemCalculationComponents(calculation).filter(component => component.status !== 'CALCULATED' || component.reviewReason)
    .map(component => component.reviewReason ?? component.reason).filter(Boolean))]
  throw new Error(`${CALCULATION_INCOMPLETE_PREFIX} item ${itemNumber}. ${reasons.join(' ') || 'Há dados ou regras pendentes.'} Confira a revisão avançada ou use Guardar para revisão.`)
}

function target(database: SqliteDatabase, batchId: string, documentId: string, itemNumber: string) {
  const organization = new SqliteOrganizationRepository(database).findSingle()
  const batches = new SqliteBatchRepository(database)
  const batch = batches.findById(batchId)
  if (!organization || !batch || batch.organizationId !== organization.id) throw new Error('Lote não encontrado.')
  const document = batches.listNormalizedDocuments(batchId).find(entry => entry.id === documentId)
  const item = document?.normalized.items.find(entry => entry.itemNumber === itemNumber)
  if (!document || !item) throw new Error('Item não encontrado neste lote.')
  const evidence = readDocumentaryIndex(database)
  const documentary = documentaryState(evidence, document)
  const externalBlock = documentFiscalBlock(effectiveProcessingDocument(evidence, document), batches.listDocumentArtifacts(batchId))
    ?? (documentary.canceled ? documentary.reason : undefined)
    ?? (!isCalculationEligibleCfop(item.cfop) ? calculationCfopExclusionReason : undefined)
  return { document, item, externalBlock, batch, companyCnpj: analyzedCompanyCnpj(database, document) }
}

function analyzedCompanyCnpj(database: SqliteDatabase, document: NormalizedFiscalDocumentRecord): string | undefined {
  const company = document.companyId ? new SqliteCompanyRepository(database).findById(document.companyId) : undefined
  return company?.organizationId === new SqliteOrganizationRepository(database).findSingle()?.id ? company?.cnpj : undefined
}

function reuseKey(database: SqliteDatabase, document: NormalizedFiscalDocumentRecord, item: NormalizedNfeItem): FiscalAnswerDefinitionKey | undefined {
  // Regras de ICMS-ST e seus percentuais dependem da vigência legal da operação;
  // não reutilizar automaticamente MVA/alíquota em compras de períodos futuros.
  if (document.normalized.operationDirection !== '1') return undefined
  if (purchaseStScope(document.normalized, item, {}, analyzedCompanyCnpj(database, document))) return undefined
  const companyId = document.companyId
  const supplierCnpj = document.normalized.issuer.taxId
  const productCode = item.supplierProductCode?.trim()
  const company = companyId ? new SqliteCompanyRepository(database).findById(companyId) : undefined
  const recipient = document.normalized.recipient
  const recipientIdentified = recipient?.taxId && ((recipient.taxIdType === 'CNPJ' && /^\d{14}$/.test(recipient.taxId))
    || (recipient.taxIdType === 'CPF' && /^\d{11}$/.test(recipient.taxId)))
  if (!companyId || !company?.active || company.organizationId !== new SqliteOrganizationRepository(database).findSingle()?.id
    || !recipientIdentified
    || document.normalized.issuer.taxIdType !== 'CNPJ' || !supplierCnpj || !/^\d{14}$/.test(supplierCnpj) || !productCode) return undefined
  return { companyId, supplierCnpj, productCode }
}

/** Valores/quantidades variam entre notas; características fiscais devem permanecer iguais. */
function reuseFingerprint(nfe: NormalizedNfe, item: NormalizedNfeItem, description?: string): string {
  item = allocatedDocument(nfe).get(item.itemNumber)?.item ?? item
  const tax = item.declaredIcms
  return JSON.stringify([
    version, nfe.model, nfe.issuer.state, nfe.issuer.taxRegimeCode, nfe.recipient?.taxId,
    nfe.recipient?.taxIdType, nfe.recipient?.state, nfe.recipient?.stateRegistrationIndicator,
    nfe.operationDirection, nfe.purposeCode, nfe.finalConsumerIndicator, nfe.environmentCode,
    description ?? item.description, item.ncm, item.cest, item.cfop, item.commercialUnit, item.includedInDocumentTotal,
    tax?.group, tax?.originCode, tax?.cst, tax?.csosn, tax?.rate, tax?.baseMode, tax?.baseReductionPercent,
    tax?.stRate, tax?.fcpRate, tax?.fcpStRate,
    positive(item.ipiAmount), positive(item.discountAmount), positive(tax?.stBaseAmount), positive(tax?.stAmount),
    positive(tax?.fcpAmount), positive(tax?.fcpStAmount),
  ])
}

function reuseState(database: SqliteDatabase, document: NormalizedFiscalDocumentRecord, item: NormalizedNfeItem, receivedAt: string) {
  const key = reuseKey(database, document, item)
  const definition = key ? new SqliteFiscalAnswerDefinitionRepository(database).latest(key) : undefined
  if (!definition) return { key }
  const operationDate = document.normalized.issuedAt?.slice(0, 10)
  let matches = false
  try { matches = definition.contextJson === reuseFingerprint(document.normalized, item)
    && Boolean(operationDate && operationDate >= definition.sourceOperationDate && receivedAt >= definition.sourceReceivedAt) }
  catch { /* Dados inválidos continuam pendentes, sem aplicar definição anterior. */ }
  return { key, definition, matches }
}

function noteAnswerSharingAvailable(context: ItemFiscalContext): boolean {
  const { answers } = context
  // Base revisada, fundamento individual e regras setoriais exigem conferência do próprio produto.
  // As listas são candidatas para uma revisão futura; respostas pendentes não podem ser compartilhadas ao salvar.
  if (context.blockedReason || answers.purchasePaymentStatus !== undefined || answers.purchasePaymentReference !== undefined || context.stSpecificMva || answers.entryBaseAmount !== undefined
    || answers.entryMethod && answers.entryMethod !== 'ICMS_ST') return false
  return Boolean(context.commonScenario) || context.calculation.component === 'ICMS_ST'
}

/** Compartilha o mesmo perfil fiscal dentro da nota, mesmo quando descrição e valores da linha variam. */
function matchingNoteItems(nfe: NormalizedNfe, item: NormalizedNfeItem,
  previous: readonly { itemNumber: string; memory: CalculationMemory }[] = [], externalBlock?: string, companyCnpj?: string,
  sourceAnswers?: ItemFiscalAnswers) {
  const allocated = allocatedDocument(nfe)
  const noteFingerprint = (candidate: NormalizedNfeItem) => {
    candidate = allocated.get(candidate.itemNumber)?.item ?? candidate
    const tax = candidate.declaredIcms
    return JSON.stringify([
      version, nfe.model, nfe.issuer.state, nfe.issuer.taxRegimeCode, nfe.recipient?.taxId,
      nfe.recipient?.taxIdType, nfe.recipient?.state, nfe.recipient?.stateRegistrationIndicator,
      nfe.operationDirection, nfe.purposeCode, nfe.finalConsumerIndicator, nfe.environmentCode,
      ...(purchaseStScope(nfe,item,{},companyCnpj)?.catalog.status !== 'FOUND' || sourceAnswers?.stCatalogRowId && sourceAnswers.stCatalogRowId !== 'XML' ? [classificationProductFamily(candidate)] : []),
      candidate.ncm, candidate.cest, candidate.cfop, candidate.includedInDocumentTotal, candidate.fuelAnpCode,
      tax?.group, tax?.originCode, tax?.cst, tax?.csosn, tax?.rate, tax?.baseMode, tax?.baseReductionPercent,
      tax?.stBaseMode, tax?.stMarginPercent, tax?.stBaseReductionPercent, tax?.stRate, tax?.fcpRate, tax?.fcpStRate,
    ])
  }
  const fingerprint = noteFingerprint(item)
  return nfe.items.filter(candidate => {
    if (!isCalculationEligibleCfop(candidate.cfop)) return false
    const memory = previous.find(entry => entry.itemNumber === candidate.itemNumber)?.memory
    if (candidate.itemNumber !== item.itemNumber && memory && itemCalculationStatus(memory) === 'CALCULATED') return false
    if (noteFingerprint(candidate) !== fingerprint) return false
    const answers = candidate.itemNumber === item.itemNumber && sourceAnswers ? sourceAnswers : readItemFiscalAnswers(memory)
    return noteAnswerSharingAvailable(buildItemFiscalContext(nfe, candidate, answers, undefined, undefined, externalBlock, companyCnpj))
  })
}

/** Identidade fiscal e período iguais; descrição/família estreita evita propagar por NCM isolado. */
function matchingBatchTargets(database: SqliteDatabase, batchId: string, source: NormalizedFiscalDocumentRecord, sourceItem: NormalizedNfeItem, answers: ItemFiscalAnswers) {
  const repository = new SqliteCalculationRepository(database)
  const fingerprint = (nfe: NormalizedNfe,item: NormalizedNfeItem) => {
    const family = classificationProductFamily(item)
    return JSON.stringify([nfe.issuedAt?.slice(0,7),nfe.issuer.taxId,reuseFingerprint(nfe,item,family),item.declaredIcms?.stBaseMode,item.declaredIcms?.stMarginPercent,item.declaredIcms?.stBaseReductionPercent])
  }
  const expected = fingerprint(source.normalized,sourceItem)
  const batches = new SqliteBatchRepository(database)
  const artifacts = batches.listDocumentArtifacts(batchId)
  const evidence = readDocumentaryIndex(database)
  const targets: {document: NormalizedFiscalDocumentRecord; item: NormalizedNfeItem; companyCnpj: string | undefined}[] = []
  for (const document of batches.listNormalizedDocuments(batchId)) {
    if (document.companyId !== source.companyId) continue
    const companyCnpj = analyzedCompanyCnpj(database,document)
    const block = documentFiscalBlock(effectiveProcessingDocument(evidence,document),artifacts) ?? (documentaryState(evidence,document).canceled ? 'Documento cancelado.' : undefined)
    if (block) continue
    const latest = repository.latestByDocument(document.id)
    for (const item of document.normalized.items) {
      const isSource = document.id === source.id && item.itemNumber === sourceItem.itemNumber
      const previous = latest?.items.find(entry=>entry.itemNumber === item.itemNumber)?.memory
      if (!isSource && previous && (itemCalculationStatus(previous)==='CALCULATED' || previous.inputs.some(i=>['answerRequestId','reuseDefinitionId'].includes(i.name)))) continue
      if (paranaInterstateEntryExclusionReason(document.normalized,item.cfop,companyCnpj)) continue
      try { if (fingerprint(document.normalized,item)!==expected) continue } catch { continue }
      const context = buildItemFiscalContext(document.normalized,item,answers,undefined,undefined,block,companyCnpj)
      if (noteAnswerSharingAvailable(context)) targets.push({document,item,companyCnpj})
    }
  }
  return targets
}

function saveBatchFiscalAnswers(database: SqliteDatabase,input: SaveItemFiscalAnswersInput): ItemFiscalContext {
  const {document,item,externalBlock,companyCnpj} = target(database,input.batchId,input.documentId,input.itemNumber)
  const answers = purchaseDestinationAnswers(document.normalized,validateItemFiscalAnswers(input.answers),companyCnpj)
  const repository = new SqliteCalculationRepository(database)
  const existing = repository.findByRequest(input.requestId,input.documentId)
  if (existing) {
    const memory = existing.items.find(entry=>entry.itemNumber===input.itemNumber)?.memory
    if (!memory || memory.inputs.find(entry=>entry.name==='answerReuseScope')?.value!=='MATCHING_BATCH_ITEMS'
      || memory.inputs.find(entry=>entry.name==='answerGroupSourceDocumentId')?.value!==input.documentId
      || memory.inputs.find(entry=>entry.name==='answerGroupSourceItemNumber')?.value!==input.itemNumber
      || existing.previousRunId!==input.expectedRunId || JSON.stringify(readItemFiscalAnswers(memory))!==JSON.stringify(answers)) throw new Error('Esta solicitação já foi usada com respostas diferentes.')
    assertCompletedCalculation(memory, input)
    return getItemFiscalContext(database,input.batchId,input.documentId,input.itemNumber)
  }
  if (repository.latestByDocument(input.documentId)?.id!==input.expectedRunId) throw new Error('As respostas foram alteradas em outra tela. Reabra as perguntas antes de salvar.')
  const context=buildItemFiscalContext(document.normalized,item,answers,undefined,undefined,externalBlock,companyCnpj)
  assertCompletedCalculation(context.calculation, input)
  if (!noteAnswerSharingAvailable(context)) throw new Error(context.blockedReason ?? 'Este tratamento exige revisão individual da base ou das condições do produto.')
  if (purchaseReviewRequired(answers)) throw new Error('Informações pendentes devem ser guardadas somente neste item. Confirme a compra antes de aplicar aos equivalentes.')
  const targets=matchingBatchTargets(database,input.batchId,document,item,answers)
  if (targets.length<2) throw new Error('Não há dois itens equivalentes disponíveis no lote. Salve somente neste item.')
  const documents=[...new Set(targets.map(entry=>entry.document.id))]
  const records=documents.map(documentId=>{
    const selected=targets.filter(entry=>entry.document.id===documentId)
    const current=selected[0]!
    const latest=repository.latestByDocument(documentId)
    return {requestId:input.requestId,batchId:input.batchId,documentId,engineVersion:version,...(latest ? {previousRunId:latest.id} : {}),
      items:current.document.normalized.items.map(entry=>{
        const affected=selected.find(target=>target.item.itemNumber===entry.itemNumber)
        if (!affected) return {itemNumber:entry.itemNumber,memory:latest?.items.find(saved=>saved.itemNumber===entry.itemNumber)?.memory ?? memorySnapshot(buildItemFiscalContext(current.document.normalized,entry,{},undefined,undefined,undefined,current.companyCnpj).calculation)}
        const calculation=buildItemFiscalContext(current.document.normalized,entry,answers,undefined,undefined,undefined,current.companyCnpj).calculation
        assertCompletedCalculation(calculation, input, entry.itemNumber)
        return {itemNumber:entry.itemNumber,memory:{...memorySnapshot(calculation),inputs:[...calculation.inputs,
          {name:'answerRequestId',value:input.requestId,source:'USER/current_item',treatment:'UNDECIDED' as const},
          {name:'answerReuseScope',value:'MATCHING_BATCH_ITEMS',source:'USER/current_item',treatment:'UNDECIDED' as const},
          {name:'answerGroupSourceDocumentId',value:input.documentId,source:'USER/current_item',treatment:'UNDECIDED' as const},
          {name:'answerGroupSourceItemNumber',value:input.itemNumber,source:'USER/current_item',treatment:'UNDECIDED' as const},
          {name:'answerAppliedBatchItems',value:String(targets.length),source:'USER/current_item',treatment:'UNDECIDED' as const}]}}
      })}
  })
  repository.saveMany(records)
  return getItemFiscalContext(database,input.batchId,input.documentId,input.itemNumber)
}

export function getItemFiscalContext(database: SqliteDatabase, batchId: string, documentId: string, itemNumber: string): ItemFiscalContext {
  const { document, item, externalBlock, batch, companyCnpj } = target(database, batchId, documentId, itemNumber)
  const run = new SqliteCalculationRepository(database).latestByDocument(documentId)
  const rawSaved = run?.items.find(entry => entry.itemNumber === itemNumber)?.memory
  const saved = rawSaved ? { ...fiscalCalculationView(rawSaved), schemaVersion: 1 as const } : undefined
  const state = reuseState(database, document, item, batch.receivedAt)
  const context = buildItemFiscalReviewContext(document.normalized, item, saved, run?.id, externalBlock, companyCnpj)
  const matching = noteAnswerSharingAvailable(context) ? matchingNoteItems(document.normalized, item, run?.items, externalBlock, companyCnpj, context.answers) : []
  const batchMatching = noteAnswerSharingAvailable(context) ? matchingBatchTargets(database,batchId,document,item,context.answers).map(entry=>({documentId:entry.document.id,documentNumber:entry.document.normalized.number ?? '',itemNumber:entry.item.itemNumber,...(entry.item.description ? {description:entry.item.description} : {})})) : []
  const batchMatchingContext = batchMatching.length > 1 ? { matchingBatchItems:batchMatching } : {}
  const appliedBatch = saved?.inputs.find(entry=>entry.name==='answerAppliedBatchItems')?.value
  const matchingContext = matching.length > 1 ? { matchingNoteItems: matching.map(entry => ({ itemNumber: entry.itemNumber,
    ...(entry.description ? { description: entry.description } : {}), ...(entry.supplierProductCode ? { productCode: entry.supplierProductCode } : {}) })) } : {}
  if (saved && run && isAutomaticCalculation(saved) && !externalBlock && !paranaInterstateEntryExclusionReason(document.normalized,item.cfop,companyCnpj)) {
    const { blockedReason, ...available } = context
    const { purchaseReviewCompany, ...automaticContext } = available
    return { ...(document.normalized.purposeCode === '4' ? automaticContext : available),
      ...(saved.status === 'UNSUPPORTED' && document.normalized.purposeCode === '4' ? { blockedReason: saved.reason } : {}), automaticCalculationNotice: automaticCalculationDescription(saved),
      ...(blockedReason ? { manualReviewBlockedReason: blockedReason } : {}),
      ...matchingContext, ...batchMatchingContext, reuseAvailable: false, calculation: { ...saved, runId: run.id, engineVersion: run.engineVersion } }
  }
  const reused = saved?.inputs.find(entry => entry.name === 'reuseDefinitionId')?.value
  const appliedItems = saved?.inputs.find(entry => entry.name === 'answerAppliedItemNumbers')?.value
  return { ...context, reuseAvailable: context.calculation.component !== 'ICMS_ST' && context.calculation.result?.component !== 'ICMS_ST' && Boolean(state.key), ...(state.definition ? { definitionId: state.definition.id } : {}),
    ...matchingContext, ...batchMatchingContext, ...(appliedBatch ? {appliedBatchItems:Number(appliedBatch)} : {}),
    ...(appliedItems ? { appliedItemNumbers: JSON.parse(appliedItems) as string[] } : {}),
    ...(saved && run ? { calculation: { ...context.calculation, engineVersion: run.engineVersion } } : {}),
    ...(reused ? { reuseNotice: 'Respostas reaproveitadas de uma definição anterior para esta empresa e produto do fornecedor.' }
      : state.definition && !state.matches ? { reuseNotice: 'A operação difere da definição anterior ou tem data anterior. Confira e responda novamente.' } : {}),
  }
}

export function saveItemFiscalAnswers(database: SqliteDatabase, input: SaveItemFiscalAnswersInput): ItemFiscalContext {
  if (input.calculationMode === 'XML' || input.calculationMode === 'AUTOMATIC') return saveItemXmlCalculation(database, input)
  if (input.reuseScope === 'MATCHING_BATCH_ITEMS') return saveBatchFiscalAnswers(database,input)
  const validatedAnswers = validateItemFiscalAnswers(input.answers)
  const scope = input.reuseScope ?? 'CURRENT_ITEM'
  if (!['CURRENT_ITEM', 'MATCHING_NOTE_ITEMS', 'FUTURE_NOTES'].includes(scope)) throw new Error('Escolha um alcance válido para as respostas.')
  const { document, item, externalBlock, batch, companyCnpj } = target(database, input.batchId, input.documentId, input.itemNumber)
  const answers = purchaseDestinationAnswers(document.normalized, validatedAnswers, companyCnpj)
  const repository = new SqliteCalculationRepository(database)
  const existing = repository.findByRequest(input.requestId, input.documentId)
  if (existing) {
    const saved = existing.items.find(entry => entry.itemNumber === input.itemNumber)?.memory
    if (!saved || isAutomaticCalculation(saved) || existing.previousRunId !== input.expectedRunId || JSON.stringify(readItemFiscalAnswers(saved)) !== JSON.stringify(answers)
      || saved.inputs.find(entry => entry.name === 'answerRequestId')?.value !== input.requestId
      || (saved.inputs.find(entry => entry.name === 'answerReuseScope')?.value ?? 'CURRENT_ITEM') !== scope
      || (scope === 'MATCHING_NOTE_ITEMS' && saved.inputs.find(entry => entry.name === 'answerGroupSourceItemNumber')?.value !== input.itemNumber)
      || (saved.inputs.find(entry => entry.name === 'definitionAtSave')?.value ?? '') !== (input.expectedDefinitionId ?? '')) throw new Error('Esta solicitação já foi usada com respostas diferentes.')
    assertCompletedCalculation(saved, input)
    return getItemFiscalContext(database, input.batchId, input.documentId, input.itemNumber)
  }
  const latest = repository.latestByDocument(input.documentId)
  if (latest?.id !== input.expectedRunId) throw new Error('As respostas foram alteradas em outra tela. Reabra as perguntas antes de salvar.')
  if (!isCalculationEligibleCfop(item.cfop)) {
    throw new Error(calculationCfopExclusionReason)
  }
  const context = buildItemFiscalContext(document.normalized, item, answers, undefined, undefined, externalBlock, companyCnpj)
  if (context.blockedReason) throw new Error(context.blockedReason)
  assertCompletedCalculation(context.calculation, input)
  const key = reuseKey(database, document, item)
  if (scope === 'FUTURE_NOTES' && (!key || context.calculation.status !== 'CALCULATED' || context.calculation.component === 'ICMS_ST' || context.calculation.component === 'ICMS_ENTRY')) {
    throw new Error('Para reutilizar nas próximas notas, identifique a empresa e o produto do fornecedor e conclua este cálculo. Você pode salvar respostas parciais somente neste item.')
  }
  const affected = scope === 'MATCHING_NOTE_ITEMS'
    ? matchingNoteItems(document.normalized, item, latest?.items, externalBlock, companyCnpj, answers) : [item]
  if (scope === 'MATCHING_NOTE_ITEMS' && (!noteAnswerSharingAvailable(context) || purchaseReviewRequired(answers))) {
    throw new Error('Este tratamento exige revisão individual da base, da classificação ou das condições do produto. Escolha Somente neste item para salvar.')
  }
  if (scope === 'MATCHING_NOTE_ITEMS' && affected.length < 2) {
    throw new Error('Para aplicar aos itens compatíveis desta nota, confira se há pelo menos dois itens com o mesmo contexto fiscal ainda sem cálculo. Você pode salvar só neste item.')
  }
  const updated = new Map<string, CalculationMemory>()
  for (const entry of affected) {
    const previousAnswers = readItemFiscalAnswers(latest?.items.find(saved => saved.itemNumber === entry.itemNumber)?.memory)
    const itemAnswers = entry.itemNumber === input.itemNumber ? answers : { ...previousAnswers, ...answers }
    const calculation = entry.itemNumber === input.itemNumber ? context.calculation
      : buildItemFiscalContext(document.normalized, entry, itemAnswers, undefined, undefined, externalBlock, companyCnpj).calculation
    assertCompletedCalculation(calculation, input, entry.itemNumber)
    updated.set(entry.itemNumber, { ...memorySnapshot(calculation), inputs: [
      ...calculation.inputs,
      { name: 'answerRequestId', value: input.requestId, source: 'USER/current_item', treatment: 'UNDECIDED' },
      { name: 'answerReuseScope', value: scope, source: 'USER/current_item', treatment: 'UNDECIDED' },
      { name: 'definitionAtSave', value: input.expectedDefinitionId ?? '', source: 'USER/current_item', treatment: 'UNDECIDED' },
      ...(scope === 'MATCHING_NOTE_ITEMS' ? [
        { name: 'answerGroupSourceItemNumber', value: input.itemNumber, source: 'USER/current_item', treatment: 'UNDECIDED' as const },
        { name: 'answerAppliedItemNumbers', value: JSON.stringify(affected.map(entry => entry.itemNumber)), source: 'USER/current_item', treatment: 'UNDECIDED' as const },
      ] : []),
    ] })
  }
  repository.save({
    requestId: input.requestId, batchId: input.batchId, documentId: input.documentId,
    ...(latest ? { previousRunId: latest.id } : {}), engineVersion: version,
    items: document.normalized.items.map(entry => ({ itemNumber: entry.itemNumber,
      memory: updated.get(entry.itemNumber) ?? latest?.items.find(saved => saved.itemNumber === entry.itemNumber)?.memory
        ?? memorySnapshot(buildItemFiscalContext(document.normalized, entry, {}, undefined, undefined, externalBlock, companyCnpj).calculation),
    })),
  }, scope === 'FUTURE_NOTES' ? run => {
    const definitions = new SqliteFiscalAnswerDefinitionRepository(database)
    if (definitions.latest(key!)?.id !== input.expectedDefinitionId) throw new Error('A definição para próximas notas mudou em outra tela. Reabra as perguntas antes de salvar.')
    definitions.append({ ...key!, id: randomUUID(), contextJson: reuseFingerprint(document.normalized, item),
      answersJson: JSON.stringify(answers), sourceRunId: run.id, sourceReceivedAt: batch.receivedAt,
      sourceOperationDate: document.normalized.issuedAt!.slice(0, 10), createdAt: run.createdAt })
  } : undefined)
  return getItemFiscalContext(database, input.batchId, input.documentId, input.itemNumber)
}

function saveItemXmlCalculation(database: SqliteDatabase, input: SaveItemFiscalAnswersInput): ItemFiscalContext {
  if (Object.keys(validateItemFiscalAnswers(input.answers)).length || input.reuseScope && input.reuseScope !== 'CURRENT_ITEM') throw new Error('O cálculo pelo XML usa somente os dados desta nota.')
  const { document, item, externalBlock, companyCnpj } = target(database, input.batchId, input.documentId, input.itemNumber)
  if (externalBlock) throw new Error(externalBlock)
  const scopeBlock = paranaInterstateEntryExclusionReason(document.normalized,item.cfop,companyCnpj)
  if (scopeBlock) throw new Error(scopeBlock)
  const repository = new SqliteCalculationRepository(database)
  const existing = repository.findByRequest(input.requestId, input.documentId)
  if (existing) {
    const saved = existing.items.find(entry => entry.itemNumber === input.itemNumber)?.memory
    if (!saved || !isAutomaticCalculation(saved) || existing.previousRunId !== input.expectedRunId
      || (saved.inputs.find(entry => entry.name === 'answerCalculationMode')?.value ?? 'XML') !== input.calculationMode
      || saved.inputs.find(entry => entry.name === 'answerRequestId')?.value !== input.requestId) throw new Error('Esta solicitação já foi usada com respostas diferentes.')
    assertCompletedCalculation(saved, input)
    return getItemFiscalContext(database, input.batchId, input.documentId, input.itemNumber)
  }
  const latest = repository.latestByDocument(input.documentId)
  if (latest?.id !== input.expectedRunId) throw new Error('As respostas foram alteradas em outra tela. Reabra as perguntas antes de salvar.')
  const allocated = allocatedDocument(document.normalized).get(item.itemNumber)!
  const calculation = input.calculationMode === 'AUTOMATIC' ? calculateAutomaticItem(document.normalized, allocated.item, companyCnpj)
    : calculateAutomaticXmlItem(document.normalized, allocated.item)
  if (!calculation) throw new Error('Os dados do XML não permitem calcular automaticamente este item.')
  assertCompletedCalculation(calculation, input)
  repository.save({ requestId: input.requestId, batchId: input.batchId, documentId: input.documentId,
    ...(latest ? { previousRunId: latest.id } : {}), engineVersion: isAutomaticXmlCalculation(calculation) ? AUTOMATIC_XML_VERSION : AUTOMATIC_CATALOG_VERSION,
    items: document.normalized.items.map(entry => ({ itemNumber: entry.itemNumber,
      memory: entry.itemNumber === item.itemNumber ? { ...calculation, steps: [...allocated.steps, ...calculation.steps], inputs: [...calculation.inputs,
        { name: 'answerRequestId', value: input.requestId, source: 'USER/REQUEST_AUTOMATIC_CALCULATION', treatment: 'UNDECIDED' },
        { name: 'answerCalculationMode', value: input.calculationMode!, source: 'USER/REQUEST_AUTOMATIC_CALCULATION', treatment: 'UNDECIDED' }] }
        : latest?.items.find(saved => saved.itemNumber === entry.itemNumber)?.memory
          ?? memorySnapshot(buildItemFiscalContext(document.normalized, entry, {}, undefined, undefined, externalBlock, companyCnpj).calculation),
    })) })
  return getItemFiscalContext(database, input.batchId, input.documentId, input.itemNumber)
}

/** Chamado ao abrir a análise: grava a aplicação uma vez, antes de mostrar resultados. */
export function applyReusableFiscalAnswers(database: SqliteDatabase, batchId: string): number {
  const organization = new SqliteOrganizationRepository(database).findSingle()
  const batches = new SqliteBatchRepository(database)
  const batch = batches.findById(batchId)
  if (!organization || !batch || batch.organizationId !== organization.id) throw new Error('Lote não encontrado.')
  const artifacts = batches.listDocumentArtifacts(batchId)
  const evidence = readDocumentaryIndex(database)
  const repository = new SqliteCalculationRepository(database)
  let applied = 0
  for (const document of batches.listNormalizedDocuments(batchId)) {
    const companyCnpj = analyzedCompanyCnpj(database, document)
    const documentary = documentaryState(evidence, document)
    const block = documentFiscalBlock(effectiveProcessingDocument(evidence, document), artifacts) ?? (documentary.canceled ? documentary.reason : undefined)
    if (block) continue
    if (document.normalized.items.every(item => paranaInterstateEntryExclusionReason(document.normalized,item.cfop,companyCnpj))) continue
    const latest = repository.latestByDocument(document.id)
    let changed = 0
    const items = document.normalized.items.map(item => {
      const previous = latest?.items.find(entry => entry.itemNumber === item.itemNumber)?.memory
      // Respostas manuais, inclusive parciais, e cálculos já gravados não são sobrescritos.
      if (previous?.inputs.some(entry => ['answerRequestId', 'reuseDefinitionId'].includes(entry.name)) || previous?.status === 'CALCULATED') {
        return { itemNumber: item.itemNumber, memory: previous }
      }
      const state = reuseState(database, document, item, batch.receivedAt)
      const answers = isCalculationEligibleCfop(item.cfop) && state.matches && state.definition ? validateItemFiscalAnswers(JSON.parse(state.definition.answersJson)) : {}
      const context = buildItemFiscalContext(document.normalized, item, answers, undefined, undefined, block, companyCnpj)
      if (!isCalculationEligibleCfop(item.cfop) || !state.matches || !state.definition || context.calculation.status !== 'CALCULATED') return {
        itemNumber: item.itemNumber, memory: previous ?? memorySnapshot(buildItemFiscalContext(document.normalized, item, {}, undefined, undefined, block, companyCnpj).calculation),
      }
      changed++
      const id = state.definition.id
      const memory: CalculationMemory = { ...memorySnapshot(context.calculation), inputs: [
        ...context.calculation.inputs.map(entry => entry.source === 'USER/current_item' ? { ...entry, source: `REUSED_DEFINITION/${id}` } : entry),
        { name: 'reuseDefinitionId', value: id, source: 'REUSED_DEFINITION', treatment: 'UNDECIDED' },
        { name: 'reuseSourceRunId', value: state.definition.sourceRunId, source: 'REUSED_DEFINITION', treatment: 'UNDECIDED' },
      ] }
      return { itemNumber: item.itemNumber, memory }
    })
    if (changed) {
      repository.save({ requestId: `reuse:${document.id}:${latest?.id ?? 'initial'}`, batchId, documentId: document.id,
        ...(latest ? { previousRunId: latest.id } : {}), engineVersion: version, items })
      applied += changed
    }
  }
  return applied + applyAutomaticXmlCalculations(database, batchId)
}

/** Calcula o que está documentado no XML e preserva qualquer revisão manual anterior. */
export function applyAutomaticXmlCalculations(database: SqliteDatabase, batchId: string): number {
  const batches = new SqliteBatchRepository(database)
  const batch = batches.findById(batchId)
  if (!batch || batch.organizationId !== new SqliteOrganizationRepository(database).findSingle()?.id) throw new Error('Lote não encontrado.')
  const repository = new SqliteCalculationRepository(database)
  const evidence = readDocumentaryIndex(database)
  let calculated = 0
  for (const document of batches.listNormalizedDocuments(batchId)) {
    const companyCnpj = analyzedCompanyCnpj(database, document)
    if (!companyCnpj || ![document.normalized.issuer.taxId, document.normalized.recipient?.taxId].includes(companyCnpj)) continue
    const block = documentFiscalBlock(effectiveProcessingDocument(evidence, document), batches.listDocumentArtifacts(batchId))
      ?? (documentaryState(evidence, document).canceled ? 'Documento cancelado.' : undefined)
    if (block) continue
    if (document.normalized.items.every(item => paranaInterstateEntryExclusionReason(document.normalized,item.cfop,companyCnpj))) continue
    const latest = repository.latestByDocument(document.id)
    let changed = false
    let allocations: ReturnType<typeof allocatedDocument>
    try { allocations = allocatedDocument(document.normalized) } catch { continue }
    const items = document.normalized.items.map(item => {
      const previous = latest?.items.find(entry => entry.itemNumber === item.itemNumber)?.memory
      if (previous && (!isAutomaticCalculation(previous) && (previous.status === 'CALCULATED'
        || previous.inputs.some(input => ['answerRequestId', 'reuseDefinitionId'].includes(input.name)))
        || previous.inputs.some(input => input.name === 'answerCalculationMode') && !(documentaryTaxReview(previous) && previous.result))) return { itemNumber: item.itemNumber, memory: previous }
      const allocated = allocations.get(item.itemNumber)!
      const memory = calculateAutomaticItem(document.normalized, allocated.item, companyCnpj)
      if (previous && isAutomaticCalculation(previous) && memory
        && previous.inputs.find(input => ['automaticXmlCalculation', 'automaticCatalogCalculation'].includes(input.name))?.value
          === memory.inputs.find(input => ['automaticXmlCalculation', 'automaticCatalogCalculation'].includes(input.name))?.value) return { itemNumber: item.itemNumber, memory: previous }
      if (memory) {
        changed = true
        if (memory.status === 'CALCULATED' && !memory.additionalComponents?.some(component => component.status !== 'CALCULATED')) calculated++
        return { itemNumber: item.itemNumber, memory: { ...memory,
          steps: [...allocated.steps, ...memory.steps], inputs: memory.inputs.map(input =>
            allocated.steps.some(step => step.inputs.field === input.name) ? { ...input, source: 'ALLOCATION/document_total' } : input) } }
      }
      return { itemNumber: item.itemNumber, memory: previous ?? memorySnapshot(buildItemFiscalContext(document.normalized, item, {}, undefined, undefined, block, companyCnpj).calculation) }
    })
    if (changed) repository.save({ requestId: `auto:${document.id}:${latest?.id ?? 'initial'}:${AUTOMATIC_XML_VERSION}`,
      batchId, documentId: document.id, ...(latest ? { previousRunId: latest.id } : {}), engineVersion: AUTOMATIC_CATALOG_VERSION, items })
  }
  return calculated
}
