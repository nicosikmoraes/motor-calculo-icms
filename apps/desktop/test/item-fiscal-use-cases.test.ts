import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CORE_MIGRATIONS, SqliteBatchRepository, SqliteCalculationRepository, SqliteDatabase, SqliteOrganizationRepository,
  SqliteCompanyRepository, SqliteFiscalAnswerDefinitionRepository, runSqlMigrations } from '@motor/database'
import { getBatchConsolidation } from '../src/main/batch-consolidation'
import { randomUUID } from 'node:crypto'
import type { NormalizedNfe } from '@motor/domain'
import type { ItemFiscalAnswers } from '@motor/contracts'
import { applyAutomaticXmlCalculations, applyReusableFiscalAnswers, buildItemFiscalContext, documentFiscalBlock, getItemFiscalContext, saveItemFiscalAnswers, validateItemFiscalAnswers } from '../src/main/item-fiscal-use-cases'
import { calculateAutomaticXmlItem } from '../src/main/automatic-xml-calculation'

const timestamp = '2026-10-04T12:00:00.000Z'
const org = '00000000-0000-4000-8000-000000000001'
const batchId = '00000000-0000-4000-8000-000000000002'
const docId = '00000000-0000-4000-8000-000000000003'
const occurrence = '00000000-0000-4000-8000-000000000004'
const companyId = '00000000-0000-4000-8000-000000000005'
const source = { format: 'NFE_XML_4_00' as const, xmlPath: 'NFe' }
const nfe: NormalizedNfe = {
  kind: 'NFE', layoutVersion: '4.00', model: '55', accessKey: '1'.repeat(44), number: '1', series: '1',
  issuedAt: timestamp, operationDirection: '1', purposeCode: '1', finalConsumerIndicator: '0',
  issuer: { state: 'PR', taxRegimeCode: '3', taxId: '11444777000161', taxIdType: 'CNPJ' },
  recipient: { state: 'PR', stateRegistrationIndicator: '1', taxId: '11222333000181', taxIdType: 'CNPJ' },
  items: [
    { itemNumber: '1', supplierProductCode: 'P1', cfop: '5102', productAmount: '1000', declaredIcms: { cst: '51', amount: '120' }, source },
    { itemNumber: '2', cfop: '5101', productAmount: '100', declaredIcms: { cst: '00', amount: '12' }, source },
  ], declaredTotals: {}, source,
}
const complete: ItemFiscalAnswers = { destination: 'RESALE', constructionCompany: false, petroleumOrFuel: false, ordinaryTaxTreatmentConfirmed: true }
let db: SqliteDatabase

describe('cálculo automático com parâmetros documentados no XML', () => {
  const declaredItem = { productAmount: '1000.00', ncm: '33030010', cest: '2000700', cfop: '6102', declaredIcms: {
    cst: '10', rate: '12', amount: '120.00', stBaseMode: '4', stMarginPercent: '47.77', stBaseAmount: '1477.70', stRate: '19.5', stAmount: '168.15',
    fcpStBaseAmount: '1477.70', fcpStRate: '2', fcpStAmount: '29.55',
  } }
  it('grava ST e FCP automaticamente, mostra a origem XML e não duplica a execução ao reabrir', () => {
    const next = laterNote({ issuer: { ...nfe.issuer, state: 'SP' }, environmentCode: '2' }, declaredItem)
    expect(applyAutomaticXmlCalculations(db, next.batchId)).toBe(1)
    const context = getItemFiscalContext(db, next.batchId, next.documentId, '1')
    expect(context.blockedReason).toBeUndefined()
    expect(context.automaticCalculationNotice).toContain('MVA do catálogo')
    expect(context.calculation.inputs.find(input => input.name === 'originalMvaPercent')?.source).toContain('CATALOG/')
    expect(context.calculation.inputs.find(input => input.name === 'internalRate')?.source).toBe('XML/pICMSST')
    expect(context.calculation.result).toMatchObject({ base: '1477.70', amount: '168.15' })
    expect(context.calculation.additionalComponents?.[0]?.result?.amount).toBe('29.55')
    expect(context.calculation.inputs.some(input => input.source.startsWith('USER/'))).toBe(false)
    expect(context.answers).toEqual({})
    expect(applyAutomaticXmlCalculations(db, next.batchId)).toBe(0)
    expect(getItemFiscalContext(db, next.batchId, next.documentId, '1').runId).toBe(context.runId)
    expect(getBatchConsolidation(db, next.batchId).counts.calculated).toBe(1)
  })
  it('usa automaticamente a MVA do catálogo e identifica a margem inconsistente declarada no XML', () => {
    const next = laterNote({ issuer: { ...nfe.issuer, state: 'SP' }, environmentCode: '2' }, { ...declaredItem,
      declaredIcms: { ...declaredItem.declaredIcms, stMarginPercent: '0.0000' } })
    expect(applyAutomaticXmlCalculations(db, next.batchId)).toBe(1)
    const memory = getItemFiscalContext(db, next.batchId, next.documentId, '1').calculation
    expect(memory.result?.amount).toBe('168.15')
    expect(memory.comparisons?.find(comparison => comparison.component === 'ICMS_ST')?.status).toBe('MATCH')
    expect(memory.comparisons?.find(comparison => comparison.component === 'MVA')).toMatchObject({ calculated: '47.77', declared: '0.0000', status: 'DIFFERENT' })
    expect(getBatchConsolidation(db, next.batchId).counts.divergentItems).toBe(1)
  })
  it('obtém a MVA ausente da tabela e só pede alíquota quando ela não consta no XML', () => {
    const { stMarginPercent: _mva, ...withoutMva } = declaredItem.declaredIcms
    const next = laterNote({ issuer: { ...nfe.issuer, state: 'SP' } }, { ...declaredItem, declaredIcms: withoutMva })
    expect(applyAutomaticXmlCalculations(db, next.batchId)).toBe(1)
    const context = getItemFiscalContext(db, next.batchId, next.documentId, '1')
    expect(context.calculation.status).toBe('CALCULATED')
    expect(context.calculation.result?.amount).toBe('168.15')
    expect(context.questions.find(question => question.field === 'stInternalRate')?.suggestedValue).toBe('19.5')
    const { stRate: _rate, ...withoutRate } = declaredItem.declaredIcms
    const missingRate = laterNote({ issuer: { ...nfe.issuer, state: 'SP' } }, { ...declaredItem, declaredIcms: withoutRate })
    expect(applyAutomaticXmlCalculations(db, missingRate.batchId)).toBe(0)
    expect(getItemFiscalContext(db, missingRate.batchId, missingRate.documentId, '1').calculation.reason).toContain('pICMSST')
  })
  it('aceita outra MVA manual e calcula a divergência sem obrigar o valor da tabela', () => {
    const next = laterNote({ issuer: { ...nfe.issuer, state: 'SP' }, environmentCode: '2' }, declaredItem)
    const result = saveItemFiscalAnswers(db, { ...next, requestId: 'different-manual-mva', answers: {
      stApplicableConfirmed: true, stInternalRate: '19.5', stOwnOperationRate: '12', stMvaMode: 'MANUAL_APPLIED', stMvaPercent: '30',
      fcpStApplicableConfirmed: true, stInternalRateIncludesFcp: false,
    } })
    expect(result.calculation.status).toBe('CALCULATED')
    expect(result.calculation.result?.amount).toBe('133.50')
    expect(result.calculation.comparisons?.find(comparison => comparison.component === 'ICMS_ST')?.status).toBe('DIFFERENT')
  })
  it('calcula automaticamente por dados identificados depois de uma tentativa manual incompleta', () => {
    const next = laterNote({ issuer: { ...nfe.issuer, state: 'SP' }, environmentCode: '2' }, declaredItem)
    const pending = saveItemFiscalAnswers(db, { ...next, requestId: 'pending-before-auto', answers: { stApplicableConfirmed: true } })
    const request = { ...next, requestId: 'automatic-with-catalog', expectedRunId: pending.runId!, calculationMode: 'AUTOMATIC' as const, answers: {} }
    const result = saveItemFiscalAnswers(db, request)
    expect(result.calculation.result?.amount).toBe('168.15')
    expect(result.calculation.inputs.some(input => input.name === 'automaticCatalogCalculation')).toBe(true)
    expect(saveItemFiscalAnswers(db, request).runId).toBe(result.runId)
  })
  it('atualiza o cálculo automático antigo com a tabela e preserva o cálculo anterior no histórico', () => {
    const next = laterNote({ issuer: { ...nfe.issuer, state: 'SP' }, environmentCode: '2' }, { ...declaredItem,
      declaredIcms: { ...declaredItem.declaredIcms, stMarginPercent: '0' } })
    const document = new SqliteBatchRepository(db).listNormalizedDocuments(next.batchId)[0]!
    const old = new SqliteCalculationRepository(db).save({ batchId: next.batchId, documentId: next.documentId,
      requestId: 'old-xml-automatic', engineVersion: 'XML_ARITHMETIC_1', items: [{ itemNumber: '1', memory: calculateAutomaticXmlItem(document.normalized, document.normalized.items[0]!)! }] })
    expect(applyAutomaticXmlCalculations(db, next.batchId)).toBe(1)
    expect(getItemFiscalContext(db, next.batchId, next.documentId, '1').calculation.result?.amount).toBe('168.15')
    expect(new SqliteCalculationRepository(db).latestByDocument(next.documentId)?.previousRunId).toBe(old.id)
    expect(new SqliteCalculationRepository(db).findByRequest('old-xml-automatic', next.documentId)?.items[0]?.memory.result?.amount).toBe('75.00')
    expect(applyAutomaticXmlCalculations(db, next.batchId)).toBe(0)
  })
  it('permite salvar a revisão fiscal depois do cálculo automático e preserva ambas as memórias', () => {
    const next = laterNote({ issuer: { ...nfe.issuer, state: 'SP' }, environmentCode: '2' }, declaredItem)
    applyAutomaticXmlCalculations(db, next.batchId)
    const automatic = getItemFiscalContext(db, next.batchId, next.documentId, '1')
    const reviewed = saveItemFiscalAnswers(db, { ...next, requestId: 'review-after-auto', expectedRunId: automatic.runId!, answers: {
      stApplicableConfirmed: true, stInternalRate: '19.5', stMvaMode: 'CATALOG_ORIGINAL',
      fcpStApplicableConfirmed: true, stInternalRateIncludesFcp: false,
    } })
    expect(reviewed.calculation.status).toBe('CALCULATED')
    expect(reviewed.runId).not.toBe(automatic.runId)
    expect(reviewed.automaticCalculationNotice).toBeUndefined()
    expect(new SqliteCalculationRepository(db).latestByDocument(next.documentId)?.previousRunId).toBe(automatic.runId)
    expect(applyAutomaticXmlCalculations(db, next.batchId)).toBe(0)
    expect(getItemFiscalContext(db, next.batchId, next.documentId, '1').runId).toBe(reviewed.runId)
  })
  it('retoma a tentativa com 1% incluindo FECOP pelo XML sem apagar a resposta incompatível', () => {
    const next = laterNote({ issuer: { ...nfe.issuer, state: 'SP' }, environmentCode: '2' }, declaredItem)
    const manual = saveItemFiscalAnswers(db, { ...next, requestId: 'invalid-total-rate', answers: {
      stApplicableConfirmed: true, stInternalRate: '1', stMvaMode: 'CATALOG_ORIGINAL',
      fcpStApplicableConfirmed: true, stInternalRateIncludesFcp: true,
    } })
    expect(manual.calculation.status).toBe('PENDING_DATA')
    expect(applyAutomaticXmlCalculations(db, next.batchId)).toBe(0)
    const input = { ...next, requestId: 'explicit-xml-retry', calculationMode: 'XML' as const, expectedRunId: manual.runId!, answers: {} }
    const automatic = saveItemFiscalAnswers(db, input)
    expect(automatic.calculation.result?.amount).toBe('168.15')
    expect(saveItemFiscalAnswers(db, input).runId).toBe(automatic.runId)
    expect(new SqliteCalculationRepository(db).findByRequest('invalid-total-rate', next.documentId)?.items[0]?.memory.status).toBe('PENDING_DATA')
    expect(() => saveItemFiscalAnswers(db, { ...input, calculationMode: 'FISCAL_RULE' })).toThrow(/respostas diferentes/)
  })
  it('preserva respostas manuais e impede executar documento inelegível', () => {
    const next = laterNote({ finalConsumerIndicator: '0' }, { declaredIcms: { cst: '00', baseMode: '3', rate: '19.5', amount: '195.00' } })
    const manual = saveItemFiscalAnswers(db, { ...next, requestId: 'manual-before-auto', answers: { destination: 'RESALE' } })
    expect(applyAutomaticXmlCalculations(db, next.batchId)).toBe(0)
    expect(getItemFiscalContext(db, next.batchId, next.documentId, '1').runId).toBe(manual.runId)
    const blocked = laterNote({}, declaredItem)
    db.run('UPDATE documentos_fiscais SET elegivel_processamento=0 WHERE id=?', blocked.documentId)
    expect(applyAutomaticXmlCalculations(db, blocked.batchId)).toBe(0)
    expect(new SqliteCalculationRepository(db).latestByDocument(blocked.documentId)).toBeUndefined()
  })
})

describe('conferência de ICMS-ST de compras', () => {
  it('preserva memória anterior fora da perspectiva correta sem somar o valor calculado aos totais', () => {
    const next = laterNote({ operationDirection: '0', issuer: { ...nfe.issuer, state: 'SP' }, environmentCode: '1' },
      { declaredIcms: { cst: '10', rate: '4', stAmount: '106.30' } })
    const prior = new SqliteCalculationRepository(db).save({ ...next, requestId: 'prior-st', engineVersion: 'PR_COMMON_2',
      items: [{ itemNumber: '1', memory: { schemaVersion: 1, status: 'CALCULATED', inputs: [],
        rule: { id: 'PARANA_PURCHASE_ICMS_ST_MVA', version: 1, legalBasis: 'Memória histórica de teste' },
        steps: [{ name: 'ICMS-ST', operation: 'Método anterior', inputs: {}, result: '106.30' }],
        result: { component: 'ICMS_ST', base: '648.61', rate: '19.5', amount: '106.30' } } }] })
    const summary = getBatchConsolidation(db, next.batchId)
    expect(summary.counts.calculated).toBe(0)
    expect(summary.evidence[0]?.status).toBe('UNSUPPORTED')
    expect(summary.groups[0]?.totals.calculatedIcms).toBe('0.00')
    expect(new SqliteCalculationRepository(db).latestByDocument(next.documentId)?.items[0]?.memory).toEqual(prior.items[0]?.memory)
  })

  it('mantém consumidor final, ST retida anteriormente e Simples fora deste módulo', () => {
    const purchase: NormalizedNfe = { ...nfe, issuer: { ...nfe.issuer, state: 'SP' }, items: [
      { ...nfe.items[0]!, ncm: '33030010', cest: '2000700', declaredIcms: { cst: '10', rate: '4', amount: '20.17', originCode: '1' } },
    ] }
    const answers: ItemFiscalAnswers = { stApplicableConfirmed: true, stInternalRate: '25', fcpStApplicableConfirmed: true, stInternalRateIncludesFcp: true }
    const cases = [
      buildItemFiscalContext({ ...purchase, finalConsumerIndicator: '1' }, purchase.items[0]!, answers),
      buildItemFiscalContext(purchase, { ...purchase.items[0]!, declaredIcms: { ...purchase.items[0]!.declaredIcms, cst: '60' } }, answers),
      buildItemFiscalContext({ ...purchase, issuer: { ...purchase.issuer, taxRegimeCode: '1' } }, purchase.items[0]!, answers),
    ]
    expect(cases.every(context => context.calculation.status === 'UNSUPPORTED' && context.calculation.result === undefined)).toBe(true)
  })

  it('consulta a MVA de 2026, ajusta importado a 4% e confere o ST da compra emitida pelo fornecedor', () => {
    const next = laterNote({ issuer: { ...nfe.issuer, state: 'SP' }, environmentCode: '1' }, {
      productAmount: '504.36', ncm: '33030010', cest: '2000700', cfop: '6403',
      declaredIcms: { cst: '10', originCode: '1', rate: '4', amount: '20.17',
        stBaseMode: '4', stBaseAmount: '953.97', stRate: '23', stAmount: '199.24', fcpStBaseAmount: '953.97', fcpStRate: '2', fcpStAmount: '19.08' },
    })
    const before = getItemFiscalContext(db, next.batchId, next.documentId, '1')
    expect(before.stMvaReference).toMatchObject({ status: 'FOUND', originalMvaPercent: '47.77' })
    expect(before.questions.find(q => q.field === 'stMvaMode')?.suggestedValue).toBe('CATALOG_IMPORT_4')
    const result = saveItemFiscalAnswers(db, { ...next, requestId: 'catalog-st', answers: {
      stApplicableConfirmed: true, stInternalRate: '25', fcpStApplicableConfirmed: true, stInternalRateIncludesFcp: true,
    } })
    expect(result.calculation.result).toMatchObject({ component: 'ICMS_ST', base: '953.97', amount: '199.24' })
    expect(result.calculation.inputs.find(entry => entry.name === 'originalMvaPercent')?.source).toContain('CATALOG/pr-st-mva-1245-2025')
    expect(JSON.parse(result.calculation.inputs.find(entry => entry.name === 'mvaCatalogRow')!.value!)).toMatchObject({
      originalMvaPercent: '47.77', validFrom: '2026-04-01', cest: '2000700',
    })
    expect(result.reuseAvailable).toBe(false)
    const summary = getBatchConsolidation(db, next.batchId)
    expect(summary.groups.find(group => group.component === 'ICMS_ST')).toMatchObject({ perspective: 'PURCHASES', component: 'ICMS_ST',
      totals: { calculatedIcms: '199.24', declaredIcms: '199.24', difference: '0.00' } })
    expect(summary.evidence[0]?.comparison).toMatchObject({ component: 'ICMS_ST', status: 'MATCH' })
  })

  it('reconhece entrada emitida pela própria compradora e mantém o desconto rateado pendente', () => {
    const next = laterNote({ operationDirection: '0', environmentCode: '1',
      issuer: { state: 'PR', taxId: '11222333000181', taxIdType: 'CNPJ', taxRegimeCode: '3' },
      recipient: { state: 'SP', taxId: '11444777000161', taxIdType: 'CNPJ' },
      declaredTotals: { discountAmount: '5' },
    }, { productAmount: '504.36', ncm: '39249000', declaredIcms: { cst: '10', rate: '4', amount: '20.17', stBaseMode: '4' } })
    const context = saveItemFiscalAnswers(db, { ...next, requestId: 'self-issued', answers: {
      stApplicableConfirmed: true, stMvaPercent: '28.6', stInternalRate: '19.5', fcpStApplicableConfirmed: false, stSupplierNormalConfirmed: true,
    } })
    expect(context.calculation.status).toBe('PENDING_DATA')
    expect(context.calculation.reason).toContain('desconto')
    expect(context.calculation.result).toBeUndefined()
    expect(getBatchConsolidation(db, next.batchId).groups[0]?.perspective).toBe('PURCHASES')
  })

  it('não encaminha a empresa vendedora para conferência de entrada ST e normaliza os percentuais recebidos', () => {
    const item = { ...nfe.items[0]!, declaredIcms: { cst: '10', rate: '4', stAmount: '106.30' } }
    expect(buildItemFiscalContext(nfe, item, {}, undefined, undefined, undefined, nfe.issuer.taxId).calculation.status).toBe('UNSUPPORTED')
    expect(validateItemFiscalAnswers({ stMvaMode: 'MANUAL_APPLIED', stMvaPercent: '28.6000' })).toMatchObject({ stMvaPercent: '28.6' })
  })

  it('explica a perspectiva do fornecedor e oferece a compra sem liberar cálculo nem ocultar bloqueio documental', () => {
    const purchase = { ...nfe, issuer: { ...nfe.issuer, state: 'SP' } }
    const item = { ...nfe.items[0]!, cfop: '6102', declaredIcms: { cst: '10', rate: '4', amount: '40', stAmount: '106.30' } }
    const seller = buildItemFiscalContext(purchase, item, {}, undefined, undefined, undefined, purchase.issuer.taxId)
    expect(seller.blockedReason).toContain('associado ao fornecedor')
    expect(seller.purchaseReviewCompany).toMatchObject({ cnpj: purchase.recipient!.taxId })
    expect(seller.calculation.status).toBe('UNSUPPORTED')
    expect(seller.calculation.result).toBeUndefined()

    const buyer = buildItemFiscalContext(purchase, item, {}, undefined, undefined, undefined, purchase.recipient!.taxId)
    expect(buyer.blockedReason).toBeUndefined()
    expect(buyer.purchaseReviewCompany).toBeUndefined()
    expect(buyer.questions.some(question => question.field === 'stApplicableConfirmed')).toBe(true)

    const canceled = buildItemFiscalContext(purchase, item, {}, undefined, undefined, 'Documento cancelado.', purchase.issuer.taxId)
    expect(canceled.blockedReason).toBe('Documento cancelado.')
    expect(canceled.purchaseReviewCompany).toBeUndefined()
  })

  it('usa as respostas fiscais informadas, compara o ICMS-ST declarado e distingue o componente', () => {
    const purchase: NormalizedNfe = {
      ...nfe, issuedAt: '2024-08-15T10:00:00.000Z', operationDirection: '1',
      issuer: { ...nfe.issuer, state: 'SP' },
      items: [{ ...nfe.items[0]!, itemNumber: '1', ncm: '39249000', productAmount: '504.36', cfop: '2403',
        declaredIcms: { cst: '10', rate: '4', stBaseMode: '4', stBaseAmount: '648.61', stRate: '19.5', stAmount: '106.30' } }],
    }
    const result = buildItemFiscalContext(purchase, purchase.items[0]!, {
      stApplicableConfirmed: true, stMvaPercent: '28.6', stInternalRate: '19.5', fcpStApplicableConfirmed: false, stOwnOperationRate: '4',
    }).calculation
    expect(result.status).toBe('CALCULATED')
    expect(result.result).toMatchObject({ component: 'ICMS_ST', base: '648.61', amount: '106.30' })
    expect(result.comparisons).toEqual(expect.arrayContaining([
      expect.objectContaining({ component: 'ICMS_ST', status: 'MATCH' }),
    ]))
  })
})

describe('MVA específica de combustíveis e veículos no fluxo de entrada', () => {
  const fuelAnswers: ItemFiscalAnswers = { stApplicableConfirmed: true, stSpecificRuleConfirmed: true,
    stMvaMode: 'SPECIFIC_RULE', stFuelCategory: 'PETROLEUM_NONINCIDENCE', stFuelArt50OperationBaseConfirmed: true,
    stFuelMonophaseConfirmed: false, stSpecificEffectiveRate: '18', stInternalRate: '18', fcpStApplicableConfirmed: false }
  const vehicleAnswers: ItemFiscalAnswers = { stApplicableConfirmed: true, stSpecificRuleConfirmed: true, stMvaMode: 'SPECIFIC_RULE',
    stVehicleNewForResaleConfirmed: true, stVehicleMvaFallbackConfirmed: true, stVehicleImportedConfirmed: true,
    stVehicleImportPriceFloorConfirmed: true, stSpecificEffectiveRate: '12', stInternalRate: '12',
    fcpStApplicableConfirmed: true, stInternalRateIncludesFcp: true }
  it('grava a MVA do art. 11, aplica seu arredondamento e confirma os totais da entrada', () => {
    const next = laterNote({ issuer: { ...nfe.issuer, state: 'SP' }, environmentCode: '1' }, { productAmount: '1000',
      ncm: '27101999', cest: '0600700', fuelAnpCode: '520101001', fuelDescription: 'Óleo combustível',
      declaredIcms: { cst: '10', rate: '0', amount: '0', stBaseMode: '4', stBaseAmount: '1585.40', stAmount: '285.37', fcpStAmount: '0' } })
    const result = saveItemFiscalAnswers(db, { ...next, requestId: 'specific-fuel', answers: fuelAnswers })
    expect(result.stSpecificMva).toMatchObject({ status: 'CALCULATED', appliedMvaPercent: '58.54', article: 11 })
    expect(result.calculation.result).toMatchObject({ base: '1585.40', amount: '285.37' })
    const decision = JSON.parse(result.calculation.inputs.find(input => input.name === 'stSpecificMvaDecision')!.value!)
    expect(decision.rule.version).toBe(1)
    expect(decision.steps.at(-1).rounding).toMatchObject({ scale: 2 })
    expect(getBatchConsolidation(db, next.batchId).counts).toMatchObject({ documents: 1, items: 1, calculated: 1 })
    expect(saveItemFiscalAnswers(db, { ...next, requestId: 'specific-fuel', answers: fuelAnswers }).runId).toBe(result.runId)
  })
  it('ajusta o veículo importado e separa o FECOP usando a carga efetiva de 12%', () => {
    const next = laterNote({ issuer: { ...nfe.issuer, state: 'SP' }, environmentCode: '1' }, { productAmount: '1000',
      ncm: '87032390', cest: '2500700', vehicleOperationType: '2', declaredIcms: { cst: '10', originCode: '1', rate: '4', amount: '40',
        stBaseMode: '4', stBaseAmount: '1418.18', stAmount: '101.82', fcpStBaseAmount: '1418.18', fcpStRate: '2', fcpStAmount: '28.36' } })
    const result = saveItemFiscalAnswers(db, { ...next, requestId: 'specific-vehicle', answers: vehicleAnswers })
    expect(result.stSpecificMva).toMatchObject({ originalMvaPercent: '30', appliedMvaPercent: '41.81818181818181818182' })
    expect(result.calculation.result).toMatchObject({ base: '1418.18', rate: '10', amount: '101.82' })
    expect(result.calculation.additionalComponents?.[0]?.result).toMatchObject({ component: 'FCP_ST', amount: '28.36' })
    const summary = getBatchConsolidation(db, next.batchId)
    expect(summary.counts).toMatchObject({ documents: 1, items: 1, calculated: 1, divergentItems: 0 })
    expect(summary.groups.map(g => g.component).sort()).toEqual(['FCP_ST','ICMS_ST'])
  })
  it('mantém a MVA visível quando o imposto está pendente por carga efetiva incoerente ou preço prioritário', () => {
    const item = { ...nfe.items[0]!, productAmount: '1000', ncm: '27101999', cest: '0600700', declaredIcms: { cst: '10', amount: '0', rate: '0' } }
    const note = { ...nfe, issuer: { ...nfe.issuer, state: 'SP' }, items: [item] }
    const inconsistent = buildItemFiscalContext(note, item, { ...fuelAnswers, stInternalRate: '19.5' })
    expect(inconsistent.stSpecificMva?.status).toBe('CALCULATED')
    expect(inconsistent.calculation.status).toBe('PENDING_DATA')
    expect(inconsistent.calculation.reason).toContain('carga efetiva')
    const priced = buildItemFiscalContext(note, item, { ...fuelAnswers, stFuelArt50OperationBaseConfirmed: false })
    expect(priced.stSpecificMva?.status).toBe('PENDING_RULE')
    expect(priced.calculation.result).toBeUndefined()
  })
  it('permite salvar a MVA pela carga efetiva de um item com redução, mantendo o imposto fora do escopo', () => {
    const next = laterNote({ issuer: { ...nfe.issuer, state: 'SP' }, environmentCode: '1' }, { productAmount: '1000',
      ncm: '27101999', cest: '0600700', declaredIcms: { cst: '70', rate: '12', amount: '120', stBaseMode: '4', stBaseReductionPercent: '40' } })
    const result = saveItemFiscalAnswers(db, { ...next, requestId: 'mva-only', answers: {
      ...fuelAnswers, stFuelCategory: 'OTHER', stInternalRate: '30',
    } })
    expect(result.stSpecificMva).toMatchObject({ status: 'CALCULATED', appliedMvaPercent: '39.5121951219512195122' })
    expect(result.calculation.status).toBe('UNSUPPORTED')
    expect(result.calculation.result).toBeUndefined()
    expect(result.blockedReason).toBeUndefined()
    expect(getBatchConsolidation(db, next.batchId).counts.calculated).toBe(0)
  })
  it('seleciona 34% para duas rodas nacionais e exige revisão de uma memória anterior sem condições específicas', () => {
    const next = laterNote({ issuer: { ...nfe.issuer, state: 'PR' }, environmentCode: '1' }, { productAmount: '1000',
      ncm: '87112020', cest: '2600100', declaredIcms: { cst: '10', originCode: '0', rate: '10', amount: '100', stBaseMode: '4' } })
    const old = new SqliteCalculationRepository(db).save({ ...next, requestId: 'old-moto', engineVersion: 'PR_FISCAL_4', items: [
      { itemNumber: '1', memory: { schemaVersion: 1, status: 'CALCULATED', component: 'ICMS_ST',
        rule: { id: 'OLD', version: 1, legalBasis: 'Memória anterior' }, steps: [{ name: 'ST', operation: 'manual', inputs: {}, result: '34' }],
        inputs: [{ name: 'fiscalAnswers', value: JSON.stringify({ stApplicableConfirmed: true, fcpStApplicableConfirmed: false }), source: 'USER/current_item', treatment: 'INCLUDED' }],
        result: { component: 'ICMS_ST', base: '1340.00', rate: '10', amount: '34.00' } } },
    ] })
    expect(getBatchConsolidation(db, next.batchId).counts.calculated).toBe(0)
    expect(new SqliteCalculationRepository(db).latestByDocument(next.documentId)?.items[0]?.memory).toEqual(old.items[0]?.memory)
    const result = saveItemFiscalAnswers(db, { ...next, requestId: 'new-moto', expectedRunId: old.id, answers: {
      ...vehicleAnswers, stVehicleImportedConfirmed: false,
    } })
    expect(result.stSpecificMva).toMatchObject({ status: 'CALCULATED', originalMvaPercent: '34', appliedMvaPercent: '34' })
    expect(result.calculation.result).toMatchObject({ base: '1340.00', amount: '34.00' })
    expect(result.calculation.additionalComponents?.[0]?.result?.amount).toBe('26.80')
  })
  it('não utiliza o PDF em combustível monofásico nem aceita burlar a regra com MVA manual', () => {
    const item = { ...nfe.items[0]!, ncm: '27101259', cest: '0600200', declaredIcms: { cst: '10', amount: '0', rate: '0' } }
    const note = { ...nfe, issuer: { ...nfe.issuer, state: 'SP' }, items: [item] }
    const result = buildItemFiscalContext(note, item, { ...fuelAnswers, stMvaMode: 'MANUAL_APPLIED', stMvaPercent: '30' })
    expect(result.stSpecificMva?.status).toBe('UNSUPPORTED')
    expect(result.calculation.reason).toContain('monofásico')
    expect(result.calculation.result).toBeUndefined()
  })
})

beforeEach(() => {
  db = new SqliteDatabase(':memory:')
  runSqlMigrations(db, CORE_MIGRATIONS, { appVersion: 'test' })
  new SqliteOrganizationRepository(db).create({ id: org, name: 'Escritório', active: true, createdAt: timestamp, updatedAt: timestamp })
  new SqliteCompanyRepository(db).create({ id: companyId, organizationId: org, legalName: 'Empresa', cnpj: '11222333000181',
    state: 'PR', active: true, createdAt: timestamp, updatedAt: timestamp })
  new SqliteBatchRepository(db).createWithOccurrences({ id: batchId, organizationId: org, status: 'RECEBIDO', receivedAt: timestamp, createdAt: timestamp, updatedAt: timestamp }, [
    { id: occurrence, batchId, originalName: 'nota.xml', relativePath: 'nota.xml', detectedKind: 'XML', origin: 'SELECTED_FILE',
      contentHash: 'a'.repeat(64), sizeBytes: 100, order: 1, accessKey: nfe.accessKey, ingestionStatus: 'PROCESSADA',
      repetition: 'ORIGINAL', contentConflict: 'SEM_CONFLITO', eligibleForTotalsByOccurrencePolicy: true, receivedAt: timestamp },
  ], [], [{ id: docId, batchId, companyId, occurrenceId: occurrence, contentHash: 'a'.repeat(64), eligibleForProcessing: true, createdAt: timestamp, normalized: nfe }])
})

function laterNote(changes: Partial<NormalizedNfe> = {}, itemChanges: Partial<NormalizedNfe['items'][number]> = {}, assignedCompany = companyId) {
  const id = randomUUID(), batch = randomUUID(), file = randomUUID()
  const normalized: NormalizedNfe = { ...nfe, issuedAt: '2026-10-05T12:00:00.000Z', ...changes,
    items: changes.items ?? [{ ...nfe.items[0]!, productAmount: '2000', ...itemChanges }] }
  new SqliteBatchRepository(db).createWithOccurrences({ id: batch, organizationId: org, status: 'RECEBIDO', receivedAt: '2026-10-05T12:00:00.000Z', createdAt: timestamp, updatedAt: timestamp }, [
    { id: file, batchId: batch, originalName: 'nova.xml', relativePath: 'nova.xml', detectedKind: 'XML', origin: 'SELECTED_FILE',
      contentHash: 'c'.repeat(64), sizeBytes: 100, order: 1, accessKey: normalized.accessKey, ingestionStatus: 'PROCESSADA',
      repetition: 'ORIGINAL', contentConflict: 'SEM_CONFLITO', eligibleForTotalsByOccurrencePolicy: true, receivedAt: timestamp },
  ], [], [{ id, batchId: batch, companyId: assignedCompany, occurrenceId: file, contentHash: 'c'.repeat(64), eligibleForProcessing: true, createdAt: timestamp, normalized }])
  return { batchId: batch, documentId: id, itemNumber: '1' }
}

describe('confirmação de itens compatíveis na mesma nota', () => {
  const commonItem = { ...nfe.items[0]!, ncm: '39269090', description: 'Peça plástica',
    declaredIcms: { cst: '00', rate: '19.5', amount: '0.00' } }
  const ownUse: ItemFiscalAnswers = { ...complete, destination: 'OWN_USE' }
  function groupedNote(extra: NormalizedNfe['items'] = []) {
    return laterNote({ finalConsumerIndicator: '1', declaredTotals: { freightAmount: '50' }, items: [
      { ...commonItem, productAmount: '300' },
      { ...commonItem, itemNumber: '2', supplierProductCode: 'P2', productAmount: '200' }, ...extra,
    ] })
  }

  it('oferece revisão resumida sem confirmar condições fiscais nem escolher a destinação automaticamente', () => {
    const next = groupedNote()
    const context = getItemFiscalContext(db, next.batchId, next.documentId, '1')
    expect(context.commonScenario).toEqual({ finalConsumerIndicator: '1' })
    expect(context.answers).toEqual({})
    expect(context.calculation.status).toBe('PENDING_DATA')
    expect(context.questions.find(question => question.field === 'destination')?.suggestedValue).toBeUndefined()
    expect(new SqliteCalculationRepository(db).latestByDocument(next.documentId)).toBeUndefined()
  })

  it('mantém declaração zerada na revisão e exclui item sem ICMS declarado da confirmação em grupo', () => {
    const next = groupedNote([{ ...commonItem, itemNumber: '3', declaredIcms: { cst: '00', rate: '19.5' } }])
    expect(getItemFiscalContext(db, next.batchId, next.documentId, '1').matchingNoteItems?.map(item => item.itemNumber)).toEqual(['1', '2'])
    expect(() => saveItemFiscalAnswers(db, { ...next, itemNumber: '3', requestId: 'no-declaration', answers: ownUse })).toThrow(/não tem valor de ICMS declarado/)
    const result = saveItemFiscalAnswers(db, { ...next, requestId: 'declared-group', reuseScope: 'MATCHING_NOTE_ITEMS', answers: ownUse })
    expect(result.appliedItemNumbers).toEqual(['1', '2'])
    expect(getItemFiscalContext(db, next.batchId, next.documentId, '3').calculation.result).toBeUndefined()
  })

  it('calcula os dois itens e seu rateio em uma gravação, preservando o item com outro NCM', () => {
    const next = groupedNote([{ ...commonItem, itemNumber: '3', ncm: '39269010', productAmount: '100', freightAmount: '0' }])
    expect(getItemFiscalContext(db, next.batchId, next.documentId, '1').matchingNoteItems?.map(item => item.itemNumber)).toEqual(['1', '2'])
    const input = { ...next, requestId: 'confirm-group', reuseScope: 'MATCHING_NOTE_ITEMS' as const, answers: ownUse }
    const result = saveItemFiscalAnswers(db, input)
    expect(result.appliedItemNumbers).toEqual(['1', '2'])
    expect(result.calculation.result).toMatchObject({ base: '330', amount: '64.35' })
    expect(getItemFiscalContext(db, next.batchId, next.documentId, '2').calculation.result).toMatchObject({ base: '220', amount: '42.90' })
    const third = getItemFiscalContext(db, next.batchId, next.documentId, '3')
    expect(third.answers).toEqual({})
    expect(third.calculation.status).toBe('PENDING_DATA')
    expect(saveItemFiscalAnswers(db, input).runId).toBe(result.runId)
    expect(() => saveItemFiscalAnswers(db, { ...input, itemNumber: '2' })).toThrow(/respostas diferentes/)
  })

  it('mantém o resultado e as respostas do item já calculado ao confirmar outros itens', () => {
    const next = groupedNote([{ ...commonItem, itemNumber: '3', supplierProductCode: 'P3', productAmount: '100', freightAmount: '0' }])
    const second = saveItemFiscalAnswers(db, { ...next, itemNumber: '2', requestId: 'second-first', answers: { ...ownUse, constructionCompany: true } })
    const repository = new SqliteCalculationRepository(db)
    const prior = repository.latestByDocument(next.documentId)!.items.find(item => item.itemNumber === '2')!.memory
    expect(getItemFiscalContext(db, next.batchId, next.documentId, '1').matchingNoteItems?.map(item => item.itemNumber)).toEqual(['1', '3'])
    saveItemFiscalAnswers(db, { ...next, requestId: 'others', expectedRunId: second.runId!, reuseScope: 'MATCHING_NOTE_ITEMS', answers: ownUse })
    expect(repository.latestByDocument(next.documentId)!.items.find(item => item.itemNumber === '2')!.memory).toEqual(prior)
  })

  it('não grava uma confirmação parcial em conjunto e mantém a proteção contra uma tela desatualizada', () => {
    const next = groupedNote()
    expect(() => saveItemFiscalAnswers(db, { ...next, requestId: 'partial-group', reuseScope: 'MATCHING_NOTE_ITEMS', answers: { destination: 'OWN_USE' } })).toThrow(/conclua as respostas/)
    expect(new SqliteCalculationRepository(db).latestByDocument(next.documentId)).toBeUndefined()
    const first = saveItemFiscalAnswers(db, { ...next, requestId: 'partial-item', answers: { destination: 'OWN_USE' } })
    expect(() => saveItemFiscalAnswers(db, { ...next, requestId: 'stale-group', reuseScope: 'MATCHING_NOTE_ITEMS', answers: ownUse })).toThrow(/outra tela/)
    expect(new SqliteCalculationRepository(db).latestByDocument(next.documentId)?.id).toBe(first.runId)
  })

  it('permite corrigir respostas que deixaram os itens fora do escopo sem apagar a memória anterior', () => {
    const next = groupedNote()
    const wrong = saveItemFiscalAnswers(db, { ...next, requestId: 'wrong', answers: { ...ownUse, petroleumOrFuel: true } })
    expect(wrong.calculation.status).toBe('UNSUPPORTED')
    const fixed = saveItemFiscalAnswers(db, { ...next, requestId: 'correct-group', expectedRunId: wrong.runId!, reuseScope: 'MATCHING_NOTE_ITEMS', answers: ownUse })
    expect(fixed.calculation.status).toBe('CALCULATED')
    expect(new SqliteCalculationRepository(db).findByRequest('wrong', next.documentId)?.items[0]?.memory.status).toBe('UNSUPPORTED')
  })

  it('não oferece confirmação comum para combustível nem para itens com ST', () => {
    expect(buildItemFiscalContext(nfe, { ...commonItem, ncm: '27101999', fuelAnpCode: '123456789' }).commonScenario).toBeUndefined()
    expect(buildItemFiscalContext(nfe, { ...commonItem, declaredIcms: { cst: '10', stAmount: '10' } }).commonScenario).toBeUndefined()
  })
})

describe('reaproveitamento nas próximas notas', () => {
  it('persiste rateio, classificação do desconto e diferença de um centavo na memória', () => {
    const next = laterNote({ declaredTotals: { freightAmount: '10', insuranceAmount: '2', otherAmount: '5', discountAmount: '10' } },
      { declaredIcms: { cst: '51', baseAmount: '2007', rate: '19.5', amount: '240.83' } })
    const pending = getItemFiscalContext(db, next.batchId, next.documentId, '1')
    expect(pending.questions.map(question => question.field)).toContain('discountTreatment')
    const result = saveItemFiscalAnswers(db, { ...next, requestId: 'allocated', answers: { ...complete, discountTreatment: 'UNCONDITIONAL' } })
    expect(result.calculation.result).toMatchObject({ base: '2007', amount: '240.84' })
    expect(result.calculation.steps.filter(step => step.name.startsWith('Rateio de'))).toHaveLength(4)
    expect(result.calculation.comparisons).toEqual(expect.arrayContaining([
      expect.objectContaining({ component: 'BASE', status: 'MATCH' }),
      expect.objectContaining({ component: 'ICMS', status: 'WITHIN_TOLERANCE', difference: '0.01' }),
    ]))
    expect(getItemFiscalContext(db, next.batchId, next.documentId, '1').calculation.comparisons).toEqual(result.calculation.comparisons)
  })
  function remember() { return saveItemFiscalAnswers(db, { batchId, documentId: docId, itemNumber: '1', requestId: 'remember', answers: complete, reuseScope: 'FUTURE_NOTES' }) }

  it('reutiliza respostas compatíveis, recalcula valores novos e grava a origem uma única vez', () => {
    const first = remember()
    const next = laterNote()
    expect(applyReusableFiscalAnswers(db, next.batchId)).toBe(1)
    const context = getItemFiscalContext(db, next.batchId, next.documentId, '1')
    expect(context.calculation.result?.amount).toBe('240.00')
    expect(context.reuseNotice).toMatch(/reaproveitadas/)
    expect(context.calculation.inputs.find(entry => entry.name === 'reuseDefinitionId')?.value).toBe(first.definitionId)
    expect(context.calculation.inputs.find(entry => entry.name === 'destination')?.source).toContain('REUSED_DEFINITION/')
    expect(applyReusableFiscalAnswers(db, next.batchId)).toBe(0)
    expect(getItemFiscalContext(db, next.batchId, next.documentId, '1').runId).toBe(context.runId)
  })

  it('só neste item não cria nem altera definição futura', () => {
    saveItemFiscalAnswers(db, { batchId, documentId: docId, itemNumber: '1', requestId: 'local', answers: complete })
    expect(applyReusableFiscalAnswers(db, laterNote().batchId)).toBe(0)
    const first = saveItemFiscalAnswers(db, { batchId, documentId: docId, itemNumber: '1', requestId: 'remember',
      expectedRunId: getItemFiscalContext(db, batchId, docId, '1').runId!, answers: complete, reuseScope: 'FUTURE_NOTES' })
    saveItemFiscalAnswers(db, { batchId, documentId: docId, itemNumber: '1', requestId: 'local-override', expectedRunId: first.runId!,
      answers: { ...complete, constructionCompany: true } })
    const next = laterNote()
    expect(applyReusableFiscalAnswers(db, next.batchId)).toBe(1)
    expect(getItemFiscalContext(db, next.batchId, next.documentId, '1').answers.constructionCompany).toBe(false)
  })

  it('pede confirmação quando NCM, CFOP, destinatário, regime, CST ou condições mudam', () => {
    remember()
    const notes = [laterNote({}, { ncm: '12345678' }), laterNote({}, { cfop: '5101' }),
      laterNote({ recipient: { ...nfe.recipient!, taxId: '00000000000191' } }),
      laterNote({ issuer: { ...nfe.issuer, taxRegimeCode: '1' } }), laterNote({}, { declaredIcms: { cst: '00' } }),
      laterNote({ finalConsumerIndicator: '1' }), laterNote({}, { ipiAmount: '10' }),
      laterNote({ issuedAt: '2026-10-03T12:00:00.000Z' })]
    for (const note of notes) {
      expect(applyReusableFiscalAnswers(db, note.batchId)).toBe(0)
      const context = getItemFiscalContext(db, note.batchId, note.documentId, '1')
      expect(context.answers).toEqual({})
      expect(context.reuseNotice).toMatch(/difere/)
      expect(context.calculation.result).toBeUndefined()
    }
  })

  it('isola empresa, fornecedor e código do produto', () => {
    remember()
    const otherCompany = randomUUID()
    new SqliteCompanyRepository(db).create({ id: otherCompany, organizationId: org, legalName: 'Outra', cnpj: '11444777000161',
      state: 'PR', active: true, createdAt: timestamp, updatedAt: timestamp })
    const notes = [laterNote({}, {}, otherCompany), laterNote({ issuer: { ...nfe.issuer, taxId: '00000000000191' } }),
      laterNote({}, { supplierProductCode: 'P2' })]
    for (const note of notes) expect(applyReusableFiscalAnswers(db, note.batchId)).toBe(0)
  })

  it('preserva respostas manuais parciais e histórico quando a definição é revisada', () => {
    const first = remember()
    const next = laterNote()
    const partial = saveItemFiscalAnswers(db, { ...next, requestId: 'partial-next', answers: { destination: 'RESALE' } })
    expect(applyReusableFiscalAnswers(db, next.batchId)).toBe(0)
    expect(getItemFiscalContext(db, next.batchId, next.documentId, '1').runId).toBe(partial.runId)
    saveItemFiscalAnswers(db, { batchId, documentId: docId, itemNumber: '1', requestId: 'revision', expectedRunId: first.runId!,
      expectedDefinitionId: first.definitionId!, reuseScope: 'FUTURE_NOTES', answers: { ...complete, constructionCompany: true } })
    expect(new SqliteCalculationRepository(db).findByRequest('remember', docId)?.items[0]?.memory.result?.amount).toBe('120.00')
    const newer = laterNote()
    expect(applyReusableFiscalAnswers(db, newer.batchId)).toBe(1)
    expect(getItemFiscalContext(db, newer.batchId, newer.documentId, '1').calculation.result?.amount).toBe('390.00')
  })

  it('rejeita definição desatualizada atomicamente e protege o histórico das definições', () => {
    const first = remember()
    const key = { companyId, supplierCnpj: nfe.issuer.taxId!, productCode: 'P1' }
    const definitions = new SqliteFiscalAnswerDefinitionRepository(db)
    expect(definitions.latest(key)?.id).toBe(first.definitionId)
    expect(() => saveItemFiscalAnswers(db, { batchId, documentId: docId, itemNumber: '1', requestId: 'stale-def',
      expectedRunId: first.runId!, answers: complete, reuseScope: 'FUTURE_NOTES' })).toThrow(/outra tela/)
    expect(new SqliteCalculationRepository(db).findByRequest('stale-def', docId)).toBeUndefined()
    expect(definitions.latest(key)?.id).toBe(first.definitionId)
    expect(() => db.run('UPDATE definicoes_respostas_fiscais SET respostas_json = ?', '{}')).toThrow(/imutável/)
    expect(() => db.run('DELETE FROM definicoes_respostas_fiscais')).toThrow(/imutável/)
    expect(() => saveItemFiscalAnswers(db, { batchId, documentId: docId, itemNumber: '1', requestId: 'remember', answers: complete })).toThrow(/respostas diferentes/)
  })

  it('não cria definição com respostas incompletas', () => {
    expect(() => saveItemFiscalAnswers(db, { batchId, documentId: docId, itemNumber: '1', requestId: 'incomplete',
      answers: { destination: 'RESALE' }, reuseScope: 'FUTURE_NOTES' })).toThrow(/respostas parciais/)
    expect(new SqliteCalculationRepository(db).latestByDocument(docId)).toBeUndefined()
  })
})
afterEach(() => db.close())

describe('perguntas fiscais no lote', () => {
  it('usa condição do contribuinte do XML e inicia sem cadastro ou resultado inventado', () => {
    const context = getItemFiscalContext(db, batchId, docId, '1')
    expect(context.calculation.status).toBe('PENDING_DATA')
    expect(context.calculation.result).toBeUndefined()
    expect(context.questions.map(question => question.field)).not.toContain('recipientIsIcmsTaxpayer')
    const oldXml = { ...nfe, recipient: { state: 'PR' } }
    expect(buildItemFiscalContext(oldXml, nfe.items[0]!).questions.map(question => question.field)).toContain('recipientIsIcmsTaxpayer')
  })

  it('salva respostas parciais e depois calcula sem alterar o histórico', () => {
    const first = saveItemFiscalAnswers(db, { batchId, documentId: docId, itemNumber: '1', requestId: 'partial', answers: { destination: 'RESALE' } })
    expect(first.calculation.status).toBe('PENDING_DATA')
    expect(getItemFiscalContext(db, batchId, docId, '1').answers).toEqual({ destination: 'RESALE' })
    const second = saveItemFiscalAnswers(db, { batchId, documentId: docId, itemNumber: '1', requestId: 'complete', expectedRunId: first.runId!, answers: complete })
    expect(second.calculation.result?.amount).toBe('120.00')
    expect(second.calculation.declared?.amount).toBe('120')
    expect(second.calculation.inputs.find(entry => entry.name === 'destination')?.source).toBe('USER/current_item')
    const repository = new SqliteCalculationRepository(db)
    expect(repository.findByRequest('partial', docId)?.items[0]?.memory.status).toBe('PENDING_DATA')
    expect(repository.latestByDocument(docId)?.previousRunId).toBe(first.runId)
  })

  it('preserva o cálculo do primeiro item ao responder outro e retoma a mesma solicitação', () => {
    const first = saveItemFiscalAnswers(db, { batchId, documentId: docId, itemNumber: '1', requestId: 'one', answers: complete })
    const input = { batchId, documentId: docId, itemNumber: '2', requestId: 'two', expectedRunId: first.runId!, answers: complete }
    const second = saveItemFiscalAnswers(db, input)
    expect(saveItemFiscalAnswers(db, input).runId).toBe(second.runId)
    expect(getItemFiscalContext(db, batchId, docId, '1').calculation.result?.amount).toBe('120.00')
    expect(second.calculation.result?.amount).toBe('12.00')
    expect(() => saveItemFiscalAnswers(db, { ...input, answers: { ...complete, constructionCompany: true } })).toThrow(/respostas diferentes/)
    expect(() => saveItemFiscalAnswers(db, { ...input, itemNumber: '1' })).toThrow(/respostas diferentes/)
  })

  it('bloqueia tela desatualizada, IDs de outro lote e valores fiscais enviados como respostas', () => {
    saveItemFiscalAnswers(db, { batchId, documentId: docId, itemNumber: '1', requestId: 'one', answers: complete })
    expect(() => saveItemFiscalAnswers(db, { batchId, documentId: docId, itemNumber: '2', requestId: 'stale', answers: complete })).toThrow(/outra tela/)
    expect(() => getItemFiscalContext(db, batchId, 'other-document', '1')).toThrow(/Item não encontrado/)
    expect(() => getItemFiscalContext(db, 'other-batch', docId, '1')).toThrow(/Lote não encontrado/)
    expect(() => validateItemFiscalAnswers({ productAmount: '1' })).toThrow(/não permitido/)
    expect(() => validateItemFiscalAnswers({ constructionCompany: 'false' })).toThrow(/válida/)
    expect(() => validateItemFiscalAnswers({ destination: 'anything' })).toThrow(/válida/)
  })

  it('mantém conflitos de consumidor final e IPI como pendência sem apagar as respostas', () => {
    const final = { ...nfe, finalConsumerIndicator: '1' }
    expect(buildItemFiscalContext(final, nfe.items[0]!, complete).calculation.reason).toMatch(/conflita/)
    const memory = buildItemFiscalContext(final, { ...nfe.items[0]!, ipiAmount: '10' }, { ...complete, destination: 'OWN_USE', ipiTreatment: 'EXCLUDED' }).calculation
    expect(memory.status).toBe('PENDING_DATA')
    expect(memory.result).toBeUndefined()
    const saved = saveItemFiscalAnswers(db, { batchId, documentId: docId, itemNumber: '1', requestId: 'conflict', answers: { ...complete, destination: 'OWN_USE' } })
    expect(saved.calculation.reason).toMatch(/conflita/)
    expect(saved.answers.destination).toBe('OWN_USE')
  })

  it('exige classificação de desconto e IPI apenas quando existem valores', () => {
    const fields = buildItemFiscalContext(nfe, { ...nfe.items[0]!, discountAmount: '10', ipiAmount: '5' }).questions.map(question => question.field)
    expect(fields).toContain('discountTreatment')
    expect(fields).toContain('ipiTreatment')
    expect(buildItemFiscalContext(nfe, nfe.items[0]!).questions.map(question => question.field)).not.toContain('ipiTreatment')
  })

  it('rateia frete total sem duplicar encargos e impede tributação específica', () => {
    const unallocated = buildItemFiscalContext({ ...nfe, declaredTotals: { freightAmount: '50' } }, nfe.items[0]!, complete)
    expect(unallocated.blockedReason).toBeUndefined()
    expect(unallocated.calculation.result?.amount).toBe('125.45')
    expect(unallocated.calculation.steps.find(step => step.name === 'Rateio de Frete')?.result).toBe('45.45')
    expect(unallocated.calculation.inputs.find(entry => entry.name === 'freightAmount')?.source).toBe('ALLOCATION/document_total')
    const st = buildItemFiscalContext(nfe, { ...nfe.items[0]!, declaredIcms: { cst: '10', stAmount: '100' } }, complete)
    expect(st.calculation.status).toBe('PENDING_DATA')
    expect(st.questions.map(question => question.field)).toContain('stMvaMode')
    expect(buildItemFiscalContext({ ...nfe, issuer: { state: 'PR', taxRegimeCode: '1' } }, nfe.items[0]!, complete).calculation.status).toBe('UNSUPPORTED')
    expect(buildItemFiscalContext(nfe, nfe.items[0]!, complete, undefined, undefined, 'Documento cancelado.').calculation.result).toBeUndefined()
  })

  it('bloqueia cancelamento aceito associado, preserva o histórico e ignora resposta rejeitada/órfã', () => {
    const document = new SqliteBatchRepository(db).listNormalizedDocuments(batchId)[0]!
    const artifact = {
      id: 'event', batchId, occurrenceId: occurrence, documentId: docId, association: 'ASSOCIATED' as const,
      contentHash: 'b'.repeat(64), createdAt: timestamp,
      normalized: { kind: 'EVENT' as const, envelope: 'PROC_EVENTO_NFE' as const, version: '1.00', accessKey: nfe.accessKey,
        eventType: '110111', statusCode: '135', responseMatches: true },
    }
    const reason = documentFiscalBlock(document, [artifact])
    expect(reason).toMatch(/cancelado/)
    expect(documentFiscalBlock(document, [{ ...artifact, association: 'ORPHAN' }])).toBeUndefined()
    expect(documentFiscalBlock(document, [{ ...artifact, normalized: { ...artifact.normalized, statusCode: '573' } }])).toBeUndefined()
    expect(documentFiscalBlock(document, [{ ...artifact, normalized: { ...artifact.normalized, responseMatches: false } }])).toBeUndefined()
    const saved = saveItemFiscalAnswers(db, { batchId, documentId: docId, itemNumber: '1', requestId: 'before-cancel', answers: complete })
    const historic = new SqliteCalculationRepository(db).latestByDocument(docId)!.items[0]!.memory
    expect(buildItemFiscalContext(nfe, nfe.items[0]!, complete, historic, saved.runId, reason).calculation.result).toBeUndefined()
    expect(historic.result?.amount).toBe('120.00')
  })
})


describe('consolidação integrada aos cálculos persistidos', () => {
  it('separa ICMS de compras sem conceder crédito e atualiza após salvar respostas', () => {
    const next = laterNote({ environmentCode: '1' }, { productAmount: '1000' })
    const before = getBatchConsolidation(db, next.batchId)
    expect(before.groups[0]).toMatchObject({ perspective: 'PURCHASES', authorization: 'UNVERIFIED',
      purchaseCredit: 'NOT_CALCULATED', counts: { pending: 1 }, totals: { declaredIcms: '120.00', calculatedIcms: '0.00' } })
    const saved = saveItemFiscalAnswers(db, { ...next, requestId: 'summary', answers: complete })
    const after = getBatchConsolidation(db, next.batchId)
    expect(after.groups[0]).toMatchObject({ counts: { calculated: 1, pending: 0 },
      totals: { calculatedIcms: '120.00', deferredIcms: '75.00', difference: '0.00' } })
    expect(after.evidence[0]?.runId).toBe(saved.calculation.runId)
    expect(before.groups[0]?.totals.calculatedIcms).toBe('0.00')
  })
  it('exclui empresa sem vínculo como emitente ou destinatária', () => {
    const next = laterNote({ issuer: { ...nfe.issuer, taxId: '99999999000199' }, recipient: { ...nfe.recipient!, taxId: '88888888000188' } })
    const summary = getBatchConsolidation(db, next.batchId)
    expect(summary.counts.excluded).toBe(1)
    expect(summary.groups[0]?.totals.declaredIcms).toBe('0.00')
  })
  it('rejeita lote inexistente', () => {
    expect(() => getBatchConsolidation(db, 'unknown')).toThrow('Lote não encontrado')
  })
})
