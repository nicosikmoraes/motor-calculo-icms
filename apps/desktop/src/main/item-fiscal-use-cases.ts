import { documentaryTaxReview, fiscalCalculationView, itemCalculationStatus, type ItemCalculationSummary, type ItemFiscalAnswers, type ItemFiscalContext, type ItemFiscalQuestion, type SaveItemFiscalAnswersInput } from '@motor/contracts'
import { paranaInterstateEntryExclusionReason, isCalculationEligibleCfop, calculationCfopExclusionReason, type NormalizedNfe, type NormalizedNfeItem } from '@motor/domain'
import { SqliteBatchRepository, SqliteCalculationRepository, SqliteOrganizationRepository, type SqliteDatabase,
  type NormalizedFiscalDocumentRecord, type DocumentArtifactRecord, SqliteFiscalAnswerDefinitionRepository,
  type FiscalAnswerDefinitionKey, SqliteCompanyRepository } from '@motor/database'
import { randomUUID } from 'node:crypto'
import { effectiveProcessingDocument } from './conflict-evidence'
import { documentaryState, readDocumentaryIndex } from './documentary-evidence'
import { addDecimals, subtractDecimals, allocateProportionally, compareDeclared, calculateParanaCommonIcms,
  compareDecimals, decimalText, pendingCalculation, specificStSector, type CalculationMemory } from '@motor/tax-engine'

import { buildPurchaseStContext, purchaseStScope } from './purchase-st-context'
import { buildEntryNoDebitContext, buildEntryRateContext, entryRateDifferenceAvailable, entryRateQuestions } from './entry-rate-context'
import { classificationProductFamily } from './product-classification-review'
import { buildConsumerDifalContext } from './consumer-difal-context'
import { entryReviewFindings } from './entry-review-findings'
import { purchaseDestinationAnswers, RESALE_DEFAULT_NOTICE } from './purchase-destination-policy'
import { AUTOMATIC_XML_VERSION, AUTOMATIC_CATALOG_VERSION, automaticCalculationDescription, calculateAutomaticItem, calculateAutomaticXmlItem, isAutomaticCalculation, isAutomaticXmlCalculation } from './automatic-xml-calculation'

const answersInputName = 'fiscalAnswers'
const version = 'PR_FISCAL_10'
const boolFields = ['recipientIsIcmsTaxpayer', 'constructionCompany', 'petroleumOrFuel', 'ordinaryTaxTreatmentConfirmed', 'stApplicableConfirmed', 'stSupplierNormalConfirmed', 'fcpStApplicableConfirmed', 'stInternalRateIncludesFcp', 'stSpecificRuleConfirmed', 'stFuelArt50OperationBaseConfirmed', 'stFuelMonophaseConfirmed', 'stVehicleNewForResaleConfirmed', 'stVehicleMvaFallbackConfirmed', 'stVehicleImportedConfirmed', 'stVehicleImportPriceFloorConfirmed'] as const
const decimalFields = ['stMvaPercent', 'stInternalRate', 'stOwnOperationRate', 'stSpecificEffectiveRate', 'entryInternalRate', 'entryInterstateRate'] as const
const enums = {
  entryMethod: ['RATE_DIFFERENCE', 'ICMS_ST', 'NO_DEBIT', 'CONSUMER_DIFAL'],
  stMvaMode: ['MANUAL_APPLIED', 'CATALOG_ORIGINAL', 'CATALOG_IMPORT_4', 'CATALOG_INTERSTATE', 'SPECIFIC_RULE'],
  stFuelCategory: ['PETROLEUM_NONINCIDENCE', 'SHALE_OIL', 'OTHER'],
  destination: ['RESALE', 'INDUSTRIALIZATION', 'FIXED_ASSET', 'OWN_USE'],
  destinationBasis: ['ASSUMED_RESALE', 'CONFIRMED'],
  discountTreatment: ['UNCONDITIONAL', 'CONDITIONAL'], ipiTreatment: ['INCLUDED', 'EXCLUDED'],
} as const

/** A ponte aceita somente respostas; valores fiscais e identidade vêm do banco. */
export function validateItemFiscalAnswers(raw: unknown): ItemFiscalAnswers {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Respostas fiscais inválidas.')
  const source = raw as Record<string, unknown>
  const result: Record<string, unknown> = {}
  for (const key of Object.keys(source).sort()) {
    const value = source[key]
    if (value === undefined) continue
    if (key === 'entryBaseAmount') {
      if (typeof value !== 'string') throw new Error('Informe uma base de antecipação válida em reais.')
      let normalized: string
      try { normalized = decimalText(value) } catch { throw new Error('Informe uma base de antecipação válida em reais.') }
      if (compareDecimals(normalized, '0') < 0) throw new Error('A base de antecipação não pode ser negativa.')
      result[key] = normalized; continue
    }
    if (key === 'entryNoDebitReason' || key === 'stClassificationReason' || key === 'destinationReviewReason') {
      if (typeof value !== 'string' || !value.trim() || value.trim().length > 1000) throw new Error('Informe uma justificativa de até 1000 caracteres para a decisão fiscal.')
      result[key] = value.trim(); continue
    }
    if (key === 'stCatalogRowId') {
      if (typeof value !== 'string' || !/^[A-Za-z0-9_.:/-]{1,150}$/.test(value)) throw new Error('Selecione uma referência válida do catálogo.')
      result[key] = value; continue
    }
    if ((boolFields as readonly string[]).includes(key) || ['entryApplicationConfirmed', 'entryBaseConfirmed', 'entryNoDebitConfirmed', 'stBuyerLiabilityConfirmed', 'stMvaFallbackConfirmed', 'stSimpleDeductionConfirmed', 'stClassificationConfirmed'].includes(key)) {
      if (typeof value !== 'boolean') throw new Error('Escolha uma resposta válida.')
    } else if ((decimalFields as readonly string[]).includes(key)) {
      if (typeof value !== 'string') throw new Error('Informe um percentual válido.')
      let normalized: string
      try { normalized = decimalText(value) } catch { throw new Error('Informe um percentual válido.') }
      if (compareDecimals(normalized, '0') < 0 || compareDecimals(normalized, key === 'stMvaPercent' ? '1000' : '100') > 0) {
        throw new Error('O percentual está fora do limite permitido.')
      }
      result[key] = normalized
      continue
    } else if (Object.hasOwn(enums, key)) {
      if (typeof value !== 'string' || !(enums[key as keyof typeof enums] as readonly string[]).includes(value)) throw new Error('Escolha uma resposta válida.')
    } else throw new Error('Campo fiscal não permitido.')
    result[key] = value
  }
  if (result.destinationBasis === 'ASSUMED_RESALE' && result.destination !== 'RESALE') throw new Error('A premissa de revenda exige destinação RESALE.')
  return result as ItemFiscalAnswers
}

export function readItemFiscalAnswers(memory?: CalculationMemory): ItemFiscalAnswers {
  const text = memory?.inputs.find(entry => entry.name === answersInputName)?.value
  return text ? validateItemFiscalAnswers(JSON.parse(text)) : {}
}

function declared(item: NormalizedNfeItem, component: 'ICMS' | 'ICMS_ST' = 'ICMS'): NonNullable<CalculationMemory['declared']> {
  if (component === 'ICMS_ST') return {
    ...(item.declaredIcms?.stBaseAmount !== undefined ? { base: item.declaredIcms.stBaseAmount } : {}),
    ...(item.declaredIcms?.stRate !== undefined ? { rate: item.declaredIcms.stRate } : {}),
    ...(item.declaredIcms?.stAmount !== undefined ? { amount: item.declaredIcms.stAmount } : {}),
  }
  return {
    ...(item.declaredIcms?.baseAmount !== undefined ? { base: item.declaredIcms.baseAmount } : {}),
    ...(item.declaredIcms?.rate !== undefined ? { rate: item.declaredIcms.rate } : {}),
    ...(item.declaredIcms?.amount !== undefined ? { amount: item.declaredIcms.amount } : {}),
  }
}

const yesNo = [{ value: 'true', label: 'Sim' }, { value: 'false', label: 'Não' }]

function positive(value?: string): boolean { return value !== undefined && compareDecimals(value, '0') > 0 }

const allocatedFields = ['freightAmount', 'insuranceAmount', 'discountAmount', 'otherAmount'] as const
const allocationLabels = { freightAmount: 'Frete', insuranceAmount: 'Seguro', discountAmount: 'Desconto', otherAmount: 'Outras despesas' }
// Documentos normalizados são fotografias imutáveis; cache evita ratear novamente por item.
const allocationCache = new WeakMap<NormalizedNfe, Map<string, { item: NormalizedNfeItem; steps: CalculationMemory['steps'] }>>()
function allocatedDocument(nfe: NormalizedNfe) {
  const cached = allocationCache.get(nfe)
  if (cached) return cached
  const included = nfe.items.filter(item => item.includedInDocumentTotal !== false)
  if (included.length !== nfe.items.length && allocatedFields.some(field => positive(nfe.declaredTotals[field]))) {
    throw new Error('A nota contém itens excluídos do total. Confira a composição dos encargos antes do rateio.')
  }
  const result = new Map(nfe.items.map(item => [item.itemNumber, { item: { ...item }, steps: [] as CalculationMemory['steps'] }]))
  for (const field of allocatedFields) {
    const values = allocateProportionally(nfe.declaredTotals[field], included.map(item => ({ itemNumber: item.itemNumber,
      ...(item.productAmount !== undefined ? { productAmount: item.productAmount } : {}),
      ...(item[field] !== undefined ? { declaredAmount: item[field] } : {}),
    })))
    const balance = values.some(value => value.source === 'ALLOCATED')
      ? subtractDecimals(nfe.declaredTotals[field]!, addDecimals(...included.map(item => item[field] ?? '0'))) : '0'
    const weightTotal = values.some(value => value.source === 'ALLOCATED')
      ? addDecimals(...included.filter(item => item[field] === undefined).map(item => item.productAmount!)) : '0'
    for (const value of values) {
      const entry = result.get(value.itemNumber)!
      entry.item[field] = value.amount
      if (value.source === 'ALLOCATED') entry.steps = [...entry.steps, {
        name: `Rateio de ${allocationLabels[field]}`, operation: 'saldo do total proporcional ao valor dos produtos sem distribuição; maiores restos; desempate pelo número do item',
        inputs: { total: nfe.declaredTotals[field]!, productAmount: entry.item.productAmount!, allocatedAmount: value.amount,
          field, balance, weightTotal, method: 'LARGEST_REMAINDER_CENTS' }, result: value.amount, rounding: { scale: 2, mode: 'LARGEST_REMAINDER' },
      }]
    }
  }
  // IPI é tributo específico por produto: divergência não autoriza rateá-lo como despesa.
  if (nfe.declaredTotals.ipiAmount !== undefined && compareDecimals(nfe.declaredTotals.ipiAmount,
    addDecimals(...included.map(item => item.ipiAmount ?? '0'))) !== 0) throw new Error('O IPI total não reconcilia com os itens; revise o tributo antes do cálculo.')
  allocationCache.set(nfe, result)
  return result
}

function memorySnapshot(calculation: ItemCalculationSummary): CalculationMemory {
  const { additionalComponents, reviewReason: _review, reviewStatus: _reviewStatus, ...primary } = calculation
  return { ...primary, schemaVersion: 1,
    ...(additionalComponents ? { additionalComponents: additionalComponents.map(component => ({ ...component, schemaVersion: 1 as const })) } : {}) }
}

/** Registra respostas, rateio e a origem dos valores sem alterar o documento normalizado. */
function finishContext(context: ItemFiscalContext, originalItem: NormalizedNfeItem, answers: ItemFiscalAnswers,
  allocationSteps: CalculationMemory['steps'], saved?: CalculationMemory, runId?: string): ItemFiscalContext {
  const answerFields: Record<string, keyof ItemFiscalAnswers> = {
    appliedMvaPercent: 'stMvaPercent', internalRate: 'stInternalRate', ownOperationRate: 'stOwnOperationRate',
    applicationConfirmed: 'stApplicableConfirmed', mvaMode: 'stMvaMode', supplierRegime: 'stSupplierNormalConfirmed',
    simpleDeductionConfirmed: 'stSimpleDeductionConfirmed',
    ...(context.calculation.component === 'ICMS_ENTRY' ? { baseAmount: 'entryBaseAmount' as const, internalRate: 'entryInternalRate' as const,
      applicationConfirmed: 'entryApplicationConfirmed' as const, baseConfirmed: 'entryBaseConfirmed' as const } : {}),
  }
  const memory: CalculationMemory = { ...memorySnapshot(context.calculation),
    steps: [...allocationSteps, ...context.calculation.steps], inputs: [
      ...(context.calculation.component === 'ICMS_ENTRY' && originalItem.declaredIcms?.baseAmount !== undefined
        ? [{ name: 'xmlOwnBaseAmount', value: originalItem.declaredIcms.baseAmount, source: 'XML/item', treatment: 'UNDECIDED' as const }] : []),
      ...context.calculation.inputs.map(entry => {
        if (context.calculation.component === 'ICMS_ENTRY' && entry.name === 'baseAmount' && answers.entryBaseAmount !== undefined) return { ...entry, source: 'USER/current_item' }
        if (entry.name === 'destination' && answers.destinationBasis === 'ASSUMED_RESALE') return { ...entry, source: 'USER_POLICY/DEFAULT_RESALE' }
        if (entry.source.startsWith('CATALOG/') || entry.source.startsWith('DERIVED/') || entry.source.startsWith('RULE/') || entry.source.startsWith('XML/')) return entry
        const amountField = ['productAmount', ...allocatedFields, 'ipiAmount'] as const
        const field = amountField.find(field => field === entry.name)
        const answer = answerFields[entry.name] ?? entry.name
        return { ...entry, source: entry.source === 'ITEM_VALUES'
          ? allocationSteps.some(step => step.inputs.field === entry.name) ? 'ALLOCATION/document_total'
            : field && originalItem[field] === undefined ? 'LAYOUT_ABSENT' : 'XML/item'
          : Object.hasOwn(answers, answer) ? 'USER/current_item' : 'XML/document' }
      }),
      { name: answersInputName, value: JSON.stringify(answers), source: 'USER/current_item', treatment: 'UNDECIDED' },
      ...(answers.destinationBasis === 'ASSUMED_RESALE' ? [{ name: 'destinationAssumption', value: JSON.stringify({ destination: 'RESALE', basis: 'USER_POLICY', notice: RESALE_DEFAULT_NOTICE }),
        source: 'USER_POLICY/DEFAULT_RESALE', treatment: 'UNDECIDED' as const }] : []),
    ],
  }
  if (memory.result && memory.component !== 'ICMS_ENTRY') memory.comparisons = [compareDeclared('BASE', memory.result.base, memory.declared?.base),
    ...(memory.result.component === 'ICMS_ST' ? [compareDeclared('RATE', memory.result.rate, memory.declared?.rate, '0')] : []),
    compareDeclared(memory.result.component === 'ICMS_ST' ? 'ICMS_ST' : 'ICMS', memory.result.amount, memory.declared?.amount)]
  return { ...context, ...(answers.destinationBasis === 'ASSUMED_RESALE' ? { destinationAssumption: RESALE_DEFAULT_NOTICE } : {}), ...(runId ? { runId } : {}),
    calculation: saved && !context.blockedReason
      && !(context.stSpecificMva && !saved.inputs.some(input => input.name === 'stSpecificMvaDecision'))
      && !((saved.component ?? saved.result?.component) === 'ICMS_ST' && readItemFiscalAnswers(saved).fcpStApplicableConfirmed === undefined) ? { ...saved,
        ...(saved.status === 'CALCULATED' && answers.entryMethod === 'ICMS_ST' && memory.status !== 'CALCULATED'
          ? { reviewReason: `${memory.reason ?? 'Revise as condições da entrada.'} O resultado anterior está preservado para auditoria.`, reviewStatus: memory.status } : {}),
        ...(saved.status !== 'CALCULATED' && memory.status === saved.status && memory.reason ? { reason: memory.reason } : {}),
        ...(runId ? { runId } : {}) } : memory }
}

function reviewXmlData(nfe: NormalizedNfe, item: NormalizedNfeItem): NonNullable<ItemFiscalContext['xmlData']> {
  const money = (value?: string) => {
    if (value === undefined) return 'Não informado'
    const [integer, fraction = ''] = value.split('.')
    return `R$ ${integer!.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${fraction.padEnd(2, '0')}`
  }
  return [
    { label: 'NCM', value: item.ncm ?? 'Não informado' },
    { label: 'CFOP', value: item.cfop ?? 'Não informado' },
    { label: 'CST / CSOSN', value: item.declaredIcms?.cst ?? item.declaredIcms?.csosn ?? 'Não informado' },
    { label: 'CEST', value: item.cest ?? 'Não informado' },
    { label: 'Origem e destino', value: `${nfe.issuer.state ?? 'Não informado'} / ${nfe.recipient?.state ?? 'Não informado'}` },
    { label: 'Regime do emitente', value: nfe.issuer.taxRegimeCode === '3' ? 'Regime normal (CRT 3)' : nfe.issuer.taxRegimeCode ?? 'Não informado' },
    { label: 'Valor do produto', value: money(item.productAmount) },
    { label: 'ICMS declarado', value: money(item.declaredIcms?.amount) },
    { label: 'Alíquota declarada', value: item.declaredIcms?.rate ? `${item.declaredIcms.rate.replace('.', ',')}%` : 'Não informada' },
    { label: 'Consumidor final', value: nfe.finalConsumerIndicator === '1' ? 'Sim, conforme XML' : nfe.finalConsumerIndicator === '0' ? 'Não, conforme XML' : 'Não informado' },
  ]
}

/** A perspectiva da empresa e os dados fiscais selecionam o componente a conferir. */
export function buildItemFiscalContext(nfe: NormalizedNfe, item: NormalizedNfeItem,
  answers: ItemFiscalAnswers = {}, saved?: CalculationMemory, runId?: string, externalBlock?: string,
  companyCnpj?: string): ItemFiscalContext {
  answers = purchaseDestinationAnswers(nfe, answers, companyCnpj)
  const originalItem = item
  const xmlData = reviewXmlData(nfe, item)
  let block = externalBlock ?? (companyCnpj ? paranaInterstateEntryExclusionReason(nfe,item.cfop,companyCnpj) : undefined) ?? (!isCalculationEligibleCfop(item.cfop) ? calculationCfopExclusionReason : undefined)
  const entryAvailable = !block && entryRateDifferenceAvailable(nfe, companyCnpj)
  if (answers.entryMethod === 'RATE_DIFFERENCE' || answers.entryMethod === 'NO_DEBIT' || answers.entryMethod === 'CONSUMER_DIFAL') {
    const entryBlock = block ?? (!entryAvailable ? 'A empresa e a operação não correspondem à aquisição interestadual destinada ao Paraná.' : undefined)
    const context = answers.entryMethod === 'CONSUMER_DIFAL' ? buildConsumerDifalContext(nfe,item,answers,companyCnpj,entryBlock) : answers.entryMethod === 'NO_DEBIT' ? buildEntryNoDebitContext(item, answers, entryBlock) : buildEntryRateContext(nfe, item, answers, entryBlock)
    const scope = purchaseStScope(nfe, item, answers, companyCnpj)
    if (scope) context.questions = [...context.questions, ...buildPurchaseStContext(nfe, item, answers, scope, block).questions]
    context.xmlFacts = [...context.xmlFacts, ...entryReviewFindings(nfe,item,answers).findings.map(f => f.reason)]
    return finishContext({ ...context, entryRateDifferenceAvailable: entryAvailable, xmlData }, originalItem, answers, [], saved, runId)
  }
  let purchaseReviewCompany: ItemFiscalContext['purchaseReviewCompany']
  const buyerForReview = nfe.operationDirection === '0' ? nfe.issuer : nfe.recipient
  const supplierForReview = nfe.operationDirection === '0' ? nfe.recipient : nfe.issuer
  if (!externalBlock && companyCnpj && companyCnpj === supplierForReview?.taxId && buyerForReview?.state === 'PR' && buyerForReview.taxId) purchaseReviewCompany = {cnpj:buyerForReview.taxId,...(buyerForReview.name?{name:buyerForReview.name}:{})}
  let allocationSteps: CalculationMemory['steps'] = []
  try {
    const allocated = allocatedDocument(nfe).get(item.itemNumber)
    if (allocated) { item = { ...allocated.item, ...item }; allocationSteps = allocated.steps }
    const scope = purchaseStScope(nfe, item, answers, companyCnpj)
    if (scope) {
      const context = buildPurchaseStContext(nfe, item, answers, scope, block)
      if (entryAvailable) {
        context.entryRateDifferenceAvailable = true
        context.questions = [...entryRateQuestions(item), ...context.questions]
        context.xmlFacts = [...context.xmlFacts, ...entryReviewFindings(nfe,item,answers).findings.map(f => f.reason)]
      }
      return finishContext({ ...context, xmlData }, originalItem, answers, allocationSteps, saved, runId)
    }
    // A mesma nota pode pertencer ao fornecedor ou ao comprador. A escolha da
    // empresa define a perspectiva; nunca a substituímos para liberar um cálculo.
    const purchase = companyCnpj && !block ? purchaseStScope(nfe, item, answers) : undefined
    if (purchase?.buyer.taxId && companyCnpj === purchase.supplier.taxId) {
      block = `Este lote está associado ao fornecedor (CNPJ ${companyCnpj}). A conferência de ICMS-ST disponível atende a compra da empresa destinatária no Paraná (CNPJ ${purchase.buyer.taxId}). Para conferir essa compra, importe as notas para a empresa compradora. A operação do fornecedor exige outro enquadramento.`
      purchaseReviewCompany = { cnpj: purchase.buyer.taxId, ...(purchase.buyer.name ? { name: purchase.buyer.name } : {}) }
    }
  } catch (cause) { block ??= cause instanceof Error ? cause.message : 'Valores inválidos impedem o cálculo.' }

  const indicator = nfe.recipient?.stateRegistrationIndicator
  const xmlTaxpayer = indicator === '1' || indicator === '2' ? true : indicator === '9' ? false : undefined
  const questions: ItemFiscalQuestion[] = [
    { field: 'destination', label: 'Qual será a destinação deste produto pelo comprador?', options: [
      { value: 'RESALE', label: 'Revenda' }, { value: 'INDUSTRIALIZATION', label: 'Industrialização' },
      { value: 'FIXED_ASSET', label: 'Ativo imobilizado' }, { value: 'OWN_USE', label: 'Uso ou consumo' },
    ] },
    ...(xmlTaxpayer === undefined ? [{ field: 'recipientIsIcmsTaxpayer' as const, label: 'O destinatário é contribuinte do ICMS?', options: yesNo }] : []),
    { field: 'constructionCompany', label: 'O destinatário é empresa de construção civil?', options: yesNo },
    { field: 'petroleumOrFuel', label: 'Este produto é petróleo ou combustível?', options: yesNo },
    { field: 'ordinaryTaxTreatmentConfirmed', label: 'Confirma o enquadramento na tributação comum de 19,5%, sem ST, FCP, redução de base ou outro tratamento específico?', options: yesNo },
  ]
  if (!block && (nfe.model !== '55' || nfe.issuer.state !== 'PR' || nfe.recipient?.state !== 'PR'
    || nfe.issuer.taxRegimeCode !== '3' || nfe.operationDirection !== '1' || nfe.purposeCode !== '1'
    || !['5101', '5102'].includes(item.cfop ?? '') || item.includedInDocumentTotal === false)) {
    block = 'Este cálculo atende NF-e de operação comum interna PR, CRT 3 e CFOP 5101/5102. Outros enquadramentos permanecem pendentes.'
  }
  if (!block && !['00', '51'].includes(item.declaredIcms?.cst ?? '')) block = 'O CST desta nota exige outra regra fiscal antes do cálculo.'
  const tax = item.declaredIcms
  try {
    if (!block && (positive(tax?.baseReductionPercent) || positive(tax?.stBaseAmount) || positive(tax?.stAmount)
      || positive(tax?.fcpRate) || positive(tax?.fcpAmount) || positive(tax?.fcpStRate) || positive(tax?.fcpStAmount))) block = 'A nota indica redução de base, ST ou FCP; exige tratamento específico.'
    if (positive(item.discountAmount)) questions.push({ field: 'discountTreatment', label: 'O desconto depende de uma condição futura?', options: [
      { value: 'CONDITIONAL', label: 'Sim — desconto condicional, não deduzir da base' },
      { value: 'UNCONDITIONAL', label: 'Não — desconto incondicional, deduzir da base' },
    ] })
    if (positive(item.ipiAmount)) questions.push({ field: 'ipiTreatment', label: 'Como o IPI participa da base do ICMS nesta operação?', options: [
      { value: 'INCLUDED', label: 'Incluir na base' },
      { value: 'EXCLUDED', label: 'Excluir: entre contribuintes, para revenda/industrialização e fato gerador dos dois impostos' },
    ] })
  } catch (cause) { block ??= cause instanceof Error ? cause.message : 'Valores inválidos impedem o cálculo.' }
  const resolvedTaxpayer = xmlTaxpayer ?? answers.recipientIsIcmsTaxpayer
  let conflict: string | undefined
  if (xmlTaxpayer !== undefined && answers.recipientIsIcmsTaxpayer !== undefined && answers.recipientIsIcmsTaxpayer !== xmlTaxpayer) {
    conflict = 'A resposta sobre o contribuinte conflita com o indicador do XML.'
  }
  const consumer = answers.destination === 'OWN_USE' || answers.destination === 'FIXED_ASSET'
  if (answers.destination && ((nfe.finalConsumerIndicator === '1' && !consumer) || (nfe.finalConsumerIndicator === '0' && consumer))) {
    conflict = 'A destinação informada conflita com a indicação de consumidor final da nota. Revise a nota antes do cálculo.'
  }
  if (answers.ipiTreatment === 'EXCLUDED' && (resolvedTaxpayer !== true || consumer)) {
    conflict = 'A exclusão do IPI exige operação entre contribuintes destinada à revenda ou industrialização.'
  }
  const declaredValues = declared(item)
  const memory = block ? pendingCalculation('UNSUPPORTED', block, [], declaredValues)
    : conflict ? pendingCalculation('PENDING_DATA', conflict, [], declaredValues)
      : calculateParanaCommonIcms({
        ...answers,
        ...(nfe.issuedAt ? { operationDate: nfe.issuedAt.slice(0, 10) } : {}),
        ...(nfe.issuer.state ? { issuerState: nfe.issuer.state } : {}),
        ...(nfe.recipient?.state ? { recipientState: nfe.recipient.state } : {}),
        issuerRegime: 'NORMAL', ...(resolvedTaxpayer !== undefined ? { recipientIsIcmsTaxpayer: resolvedTaxpayer } : {}),
        ...(item.productAmount !== undefined ? { productAmount: item.productAmount } : {}),
        ...(item.freightAmount !== undefined ? { freightAmount: item.freightAmount } : {}),
        ...(item.insuranceAmount !== undefined ? { insuranceAmount: item.insuranceAmount } : {}),
        ...(item.otherAmount !== undefined ? { otherAmount: item.otherAmount } : {}),
        ...(item.discountAmount !== undefined ? { discountAmount: item.discountAmount } : {}),
        ...(item.ipiAmount !== undefined ? { ipiAmount: item.ipiAmount } : {}), declared: declaredValues,
      })
  const commonScenario = !block && Boolean(nfe.issuedAt && nfe.issuedAt.slice(0, 10) >= '2024-03-18') && !item.fuelAnpCode
    && !specificStSector(item.ncm, item.cest, item.fuelAnpCode) && !item.ncm?.startsWith('27')
  return finishContext({ answers, questions, xmlData, ...(purchaseReviewCompany ? { purchaseReviewCompany } : {}),
    ...(commonScenario ? { commonScenario: { ...(nfe.finalConsumerIndicator ? { finalConsumerIndicator: nfe.finalConsumerIndicator } : {}) } } : {}),
    ...(block ? { blockedReason: block } : {}), xmlFacts: [
    `Emitente: ${nfe.issuer.state ?? 'UF ausente'} · CRT ${nfe.issuer.taxRegimeCode ?? 'ausente'}`,
    `Destinatário: ${nfe.recipient?.state ?? 'UF ausente'} · ${xmlTaxpayer === undefined ? 'condição de contribuinte não informada' : xmlTaxpayer ? 'contribuinte ICMS (XML)' : 'não contribuinte (XML)'}`,
    `CFOP ${item.cfop ?? 'ausente'} · CST ${tax?.cst ?? 'ausente'} · NCM ${item.ncm ?? 'ausente'}`,
    'Conferência do ICMS próprio da operação. Crédito de compra e apuração não são calculados aqui.',
  ], calculation: memory }, originalItem, answers, allocationSteps, conflict ? undefined : saved, runId)
}

export function documentFiscalBlock(document: NormalizedFiscalDocumentRecord, artifacts: readonly DocumentArtifactRecord[]): string | undefined {
  if (!document.eligibleForProcessing) return document.pendingReason ?? 'Documento não elegível para processamento.'
  const canceled = artifacts.some(entry => entry.association === 'ASSOCIATED' && entry.documentId === document.id
    && entry.normalized.responseMatches !== false
    && ((entry.normalized.eventType === '110111' && ['135', '155'].includes(entry.normalized.statusCode ?? ''))
      || ['101', '151', '110', '301', '302'].includes(entry.normalized.statusCode ?? '')))
  return canceled ? 'Documento cancelado ou denegado. Não pode integrar este cálculo.' : undefined
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
  if (context.blockedReason || context.stSpecificMva || answers.entryBaseAmount !== undefined
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
    return getItemFiscalContext(database,input.batchId,input.documentId,input.itemNumber)
  }
  if (repository.latestByDocument(input.documentId)?.id!==input.expectedRunId) throw new Error('As respostas foram alteradas em outra tela. Reabra as perguntas antes de salvar.')
  const context=buildItemFiscalContext(document.normalized,item,answers,undefined,undefined,externalBlock,companyCnpj)
  if (!noteAnswerSharingAvailable(context)) throw new Error(context.blockedReason ?? 'Este tratamento exige revisão individual da base ou das condições do produto.')
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
  const context = buildItemFiscalContext(document.normalized, item, readItemFiscalAnswers(saved), saved, run?.id, externalBlock, companyCnpj)
  const tax = item.declaredIcms
  if (document.normalized.finalConsumerIndicator !== undefined) context.xmlFinalConsumerIndicator = document.normalized.finalConsumerIndicator
  try {
    const allocated = allocatedDocument(document.normalized).get(item.itemNumber)?.item ?? item
    context.consumerDifalSuggestions = { ...(allocated.productAmount !== undefined ? {operationAmount:subtractDecimals(addDecimals(allocated.productAmount,allocated.ipiAmount ?? '0',allocated.freightAmount ?? '0',allocated.insuranceAmount ?? '0',allocated.otherAmount ?? '0'),allocated.discountAmount ?? '0')} : {}), internalRate:'19.5', ...(tax?.rate !== undefined ? {interstateRate:tax.rate} : {}) }
  } catch { /* O bloqueio de composição/rateio continua no contexto; não sugerir base incompleta. */ }
  const date = document.normalized.issuedAt?.slice(0,10)
  if (date && date >= '2024-08-01' && date <= '2026-10-12' && item.cest === '1400500' && item.ncm?.startsWith('3924')) context.entryLegislationHint = {
    reason:'Artefatos de higiene/toucador de plástico para uso doméstico: a seção de ST e sua MVA foram revogadas a partir de 01/08/2024 (Decreto PR 6.048/2024 e Resolução SEFA 852/2024). Confira a descrição, a destinação e eventual antecipação da entrada. Não use a MVA antiga nem a tabela de chupetas/mamadeiras apenas pelo NCM.',
    sourceUrl:'https://www.legislacao.pr.gov.br/legislacao/exibirAto.do?action=iniciarProcesso&codAto=327771&codItemAto=2074937' }
  const suggestions: Partial<Record<keyof ItemFiscalAnswers, string>> = {
    ...(tax?.stRate !== undefined ? { stInternalRate: tax.stRate } : {}),
    ...(tax?.rate !== undefined ? { stOwnOperationRate: tax.rate } : {}),
    ...(tax?.stMarginPercent !== undefined ? { stMvaPercent: tax.stMarginPercent } : {}),
    ...(tax?.cst === '10' && tax.stBaseMode === '4' ? { stApplicableConfirmed: 'true' } : {}),
    ...([tax?.fcpStAmount, tax?.fcpStRate].some(value => value !== undefined && compareDecimals(value, '0') > 0)
      ? { fcpStApplicableConfirmed: 'true', stInternalRateIncludesFcp: 'false' } : {}),
    ...(tax?.stRate !== undefined ? { stSpecificEffectiveRate: addDecimals(tax.stRate, tax.fcpStRate ?? '0') } : {}),
  }
  context.questions = context.questions.map(question => ({ ...question,
    ...(question.suggestedValue === undefined && suggestions[question.field] !== undefined ? { suggestedValue: suggestions[question.field]! } : {}) }))
  if (!externalBlock) {
    try { context.xmlCalculationAvailable = calculateAutomaticItem(document.normalized, allocatedDocument(document.normalized).get(item.itemNumber)!.item, companyCnpj)?.status === 'CALCULATED' }
    catch { context.xmlCalculationAvailable = false }
  }
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
    return getItemFiscalContext(database, input.batchId, input.documentId, input.itemNumber)
  }
  const latest = repository.latestByDocument(input.documentId)
  if (latest?.id !== input.expectedRunId) throw new Error('As respostas foram alteradas em outra tela. Reabra as perguntas antes de salvar.')
  if (!isCalculationEligibleCfop(item.cfop)) {
    throw new Error(calculationCfopExclusionReason)
  }
  const context = buildItemFiscalContext(document.normalized, item, answers, undefined, undefined, externalBlock, companyCnpj)
  if (context.blockedReason) throw new Error(context.blockedReason)
  const key = reuseKey(database, document, item)
  if (scope === 'FUTURE_NOTES' && (!key || context.calculation.status !== 'CALCULATED' || context.calculation.component === 'ICMS_ST' || context.calculation.component === 'ICMS_ENTRY')) {
    throw new Error('Para reutilizar nas próximas notas, identifique a empresa e o produto do fornecedor e conclua este cálculo. Você pode salvar respostas parciais somente neste item.')
  }
  const affected = scope === 'MATCHING_NOTE_ITEMS'
    ? matchingNoteItems(document.normalized, item, latest?.items, externalBlock, companyCnpj, answers) : [item]
  if (scope === 'MATCHING_NOTE_ITEMS' && !noteAnswerSharingAvailable(context)) {
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
    return getItemFiscalContext(database, input.batchId, input.documentId, input.itemNumber)
  }
  const latest = repository.latestByDocument(input.documentId)
  if (latest?.id !== input.expectedRunId) throw new Error('As respostas foram alteradas em outra tela. Reabra as perguntas antes de salvar.')
  const allocated = allocatedDocument(document.normalized).get(item.itemNumber)!
  const calculation = input.calculationMode === 'AUTOMATIC' ? calculateAutomaticItem(document.normalized, allocated.item, companyCnpj)
    : calculateAutomaticXmlItem(document.normalized, allocated.item)
  if (!calculation) throw new Error('Os dados do XML não permitem calcular automaticamente este item.')
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
