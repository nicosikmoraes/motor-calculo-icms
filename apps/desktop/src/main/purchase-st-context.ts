import type { ItemFiscalAnswers, ItemFiscalContext, ItemFiscalQuestion } from '@motor/contracts'
import type { NormalizedNfe, NormalizedNfeItem, NormalizedParty } from '@motor/domain'
import { addDecimals, calculateParanaPurchaseIcmsSt, compareDecimals, pendingCalculation, selectParanaStMva, paranaStMvaCandidates,
  PARANA_FCP_ST_RULE, specificStSector, type ParanaStMvaSelection } from '@motor/tax-engine'

import { preparePurchaseSpecificMva } from './purchase-specific-mva-context'
import { preparePurchaseFcpContext } from './purchase-fcp-context'

const yesNo = [{ value: 'true', label: 'Sim' }, { value: 'false', label: 'Não' }]
export interface PurchaseStScope {
  buyer: NormalizedParty; supplier: NormalizedParty; catalog: ParanaStMvaSelection
}

/** tpNF pertence ao emitente. A compra da empresa destinatária costuma ter tpNF=1. */
export function purchaseStScope(nfe: NormalizedNfe, item: NormalizedNfeItem, answers: ItemFiscalAnswers,
  companyCnpj?: string): PurchaseStScope | undefined {
  if (!['0', '1'].includes(nfe.operationDirection ?? '')) return undefined
  const buyer = nfe.operationDirection === '0' ? nfe.issuer : nfe.recipient
  const supplier = nfe.operationDirection === '0' ? nfe.recipient : nfe.issuer
  if (!buyer || !supplier || buyer.state !== 'PR') return undefined
  if (companyCnpj && (companyCnpj !== buyer.taxId || companyCnpj === supplier.taxId)) return undefined
  let catalog = selectParanaStMva({ operationDate: nfe.issuedAt?.slice(0, 10), ncm: item.ncm, cest: item.cest })
  if (answers.stCatalogRowId && answers.stCatalogRowId !== 'XML') {
    const row = paranaStMvaCandidates(nfe.issuedAt?.slice(0, 10), item.ncm).find(row => row.id === answers.stCatalogRowId)
    catalog = !row ? { status: 'CLASSIFICATION_CONFLICT', reason: 'A referência escolhida não corresponde ao NCM ou à vigência. O XML original foi preservado.' }
      : answers.stClassificationConfirmed !== true || !answers.stClassificationReason?.trim()
        ? { status: 'MISSING_CLASSIFICATION', reason: 'Confirme a descrição e justifique a classificação revisada antes de usar a MVA. O CEST do XML não será alterado.' }
        : selectParanaStMva({ operationDate: nfe.issuedAt?.slice(0, 10), ncm: item.ncm, cest: row.cest })
  }
  const tax = item.declaredIcms
  const hasSt = [tax?.fcpStAmount, tax?.fcpStRate].some(value => value !== undefined && compareDecimals(value, '0') > 0) || tax?.stBaseMode !== undefined || tax?.stMarginPercent !== undefined || tax?.stAmount !== undefined
    || ['10', '30', '70'].includes(tax?.cst ?? '') || ['201', '202', '203'].includes(tax?.csosn ?? '')
  const requested = answers.stSpecificRuleConfirmed !== undefined || answers.stApplicableConfirmed !== undefined || answers.stMvaMode !== undefined || answers.stMvaPercent !== undefined
  const buyerIdentified = Boolean(companyCnpj && companyCnpj === buyer.taxId)
  if (!requested && !hasSt && nfe.operationDirection !== '0'
    && !(buyerIdentified && !answers.ordinaryTaxTreatmentConfirmed && (catalog.status === 'FOUND' || specificStSector(item.ncm, item.cest, item.fuelAnpCode) !== undefined || supplier.state !== 'PR'))) return undefined
  return { buyer, supplier, catalog }
}

export function buildPurchaseStContext(nfe: NormalizedNfe, item: NormalizedNfeItem, answers: ItemFiscalAnswers,
  scope: PurchaseStScope, externalBlock?: string): ItemFiscalContext {
  const tax = item.declaredIcms
  const simple = scope.supplier.taxRegimeCode === '1'
  const entrySt = answers.entryMethod === 'ICMS_ST'
  const interstate = scope.supplier.state !== scope.buyer.state
  const candidates = paranaStMvaCandidates(nfe.issuedAt?.slice(0, 10), item.ncm)
  const specific = preparePurchaseSpecificMva(nfe, item, answers, scope.supplier)
  const decision = specific?.decision
  const fcp = preparePurchaseFcpContext(nfe, item, answers, decision)
  const ownRate = answers.stOwnOperationRate ?? tax?.rate ?? (simple && interstate ? '12' : undefined)
  const importFour = scope.supplier.state !== scope.buyer.state && ownRate !== undefined && compareDecimals(ownRate, '4') === 0
  const catalogMode = importFour && !simple ? 'CATALOG_IMPORT_4' : entrySt && interstate && !simple ? 'CATALOG_INTERSTATE' : 'CATALOG_ORIGINAL'
  const date = nfe.issuedAt?.slice(0, 10)
  const cosmetics = Boolean(item.ncm && ['3303','3304','3305','3307'].some(prefix => item.ncm!.startsWith(prefix))
    && item.ncm !== '33051000' && !item.ncm.startsWith('330720'))
  const rateSuggestion = date && date >= '2024-03-18' && date <= '2026-10-18' && scope.catalog.status === 'FOUND'
    ? cosmetics ? '23' : '19.5' : undefined
  const mode = specific ? 'SPECIFIC_RULE' : answers.stMvaMode ?? (answers.stMvaPercent !== undefined ? 'MANUAL_APPLIED'
    : scope.catalog.status === 'FOUND' ? catalogMode : 'MANUAL_APPLIED')
  const deductDeclaredOwn = mode !== 'MANUAL_APPLIED'
    || [item.freightAmount, item.insuranceAmount, item.otherAmount].some(value => value !== undefined && compareDecimals(value, '0') > 0)
  const questions: ItemFiscalQuestion[] = [
    { field: 'stApplicableConfirmed', label: 'Confirma ICMS-ST relativo às operações subsequentes, comprador contribuinte e mercadoria correspondente à descrição legal e às condições desta compra?', options: yesNo },
    ...(interstate ? [{ field: 'stBuyerLiabilityConfirmed' as const, label: 'Conferiu a responsabilidade do adquirente pelo recolhimento nesta entrada, sem retenção válida para o PR ou pagamento já realizado que duplique o débito?', options: yesNo }] : []),
    ...(candidates.length ? [{ field: 'stCatalogRowId' as const, label: 'Classificação para consultar a MVA. Uma revisão exige fundamento e conserva o XML original; salve o rascunho para atualizar a referência.', suggestedValue: 'XML', options: [
      { value: 'XML', label: `Usar classificação do XML (CEST ${item.cest ?? 'ausente'}) ou MVA manual` },
      ...candidates.map(row => ({ value: row.id, label: `CEST ${row.cest} · ${row.description.split(' (')[0]} · MVA ${row.originalMvaPercent}%` })),
    ] },
    { field: 'stClassificationConfirmed' as const, label: 'A descrição e as condições legais do produto correspondem à classificação revisada selecionada?', options: yesNo },
    { field: 'stClassificationReason' as const, label: 'Fundamento da classificação revisada e evidência do produto; o XML original será preservado.', inputType: 'text' as const }] : []),
    ...(candidates.some(row => row.article === 12) ? [{ field: 'stMvaFallbackConfirmed' as const,
      label: 'Confirma a hipótese de MVA do art. 97, § 1º: sem preço máximo/sugerido que prevaleça, sem interdependência ou marketing direto que exija outro tratamento?', options: yesNo }] : []),
    { field: 'stMvaMode', label: 'Como obter a MVA desta operação?', suggestedValue: mode, options: [
      ...(specific ? [{ value: 'SPECIFIC_RULE', label: 'Calcular a MVA pela regra específica da resolução' }] : scope.catalog.status === 'FOUND' ? [
        { value: 'CATALOG_ORIGINAL', label: `Usar MVA original da tabela: ${scope.catalog.row.originalMvaPercent}%` },
        ...(!simple ? [{ value: 'CATALOG_IMPORT_4', label: 'Ajustar a MVA da tabela para importado interestadual a 4%' },
          { value: 'CATALOG_INTERSTATE', label: 'Ajustar a MVA da tabela para a operação interestadual a 4%, 7% ou 12%' }] : []),
      ] : []),
      ...(!specific ? [{ value: 'MANUAL_APPLIED', label: 'Informar MVA final aplicada, conferida na legislação' }] : []),
    ] },
    { field: 'stMvaPercent', label: 'MVA final aplicada (%) — no modo manual, informe o percentual já ajustado quando necessário.', inputType: 'decimal' },
    { field: 'stInternalRate', label: `Alíquota interna do Paraná (%) — ${rateSuggestion ? `sugestão de ${rateSuggestion}% somente de ICMS (Lei 11.580/1996, art. 14 e § 9º). Confira o enquadramento e o FECOP separado.` : 'informe o ICMS ou a carga com FECOP e confirme abaixo se ela inclui o adicional.'}`,
      inputType: 'decimal', ...(rateSuggestion && tax?.stRate === undefined ? { suggestedValue: rateSuggestion } : {}) },
    { field: 'stOwnOperationRate', label: simple ? 'Alíquota interestadual do Senado para dedução da ST (%) — não usar pCredSN; recorte nacional a 12%' : 'Alíquota da operação própria (%)', inputType: 'decimal', ...(ownRate !== undefined ? { suggestedValue: ownRate } : {}) },
    ...(simple ? [{ field: 'stSimpleDeductionConfirmed' as const, label: 'Confirma base própria composta por produtos, frete, seguro e outras despesas, sem IPI nem descontos, para dedução à alíquota interestadual? O crédito do Simples não será usado.', options: yesNo }] : []),
    ...(scope.supplier.taxRegimeCode === undefined ? [{ field: 'stSupplierNormalConfirmed' as const,
      label: 'O fornecedor está no regime normal (CRT 3)? Este cálculo exige confirmar o regime do fornecedor.', options: yesNo }] : []),
    ...(specific?.questions ?? []),
    ...fcp.questions,
  ]
  const declared = {
    ...(tax?.stBaseAmount !== undefined ? { base: tax.stBaseAmount } : {}),
    ...(tax?.stRate !== undefined ? { rate: tax.stRate } : {}),
    ...(tax?.stAmount !== undefined ? { amount: tax.stAmount } : {}),
  }
  let block = externalBlock
  if (!block && (nfe.model !== '55' || nfe.purposeCode !== '1' || item.includedInDocumentTotal === false)) {
    block = 'Este cálculo atende NF-e de compra destinadas ao Paraná, de finalidade normal e item incluído no documento.'
  }
  if (!block && (nfe.finalConsumerIndicator === '1' || scope.buyer.stateRegistrationIndicator === '9')) {
    block = 'Esta compra indica consumidor final ou comprador não contribuinte. A ST por operações subsequentes não cobre esse enquadramento; exige regra própria.'
  }
  if (!block && ['OWN_USE','FIXED_ASSET'].includes(answers.destination ?? '')) block = 'A destinação informada é uso/consumo ou ativo. A ST por operações subsequentes exige outro enquadramento.'
  if (!block && entrySt && item.cfop === '6911') block = 'Remessa de amostra grátis (CFOP 6911): confirme uso, revenda ou retorno. A ST de operações subsequentes não será presumida.'
  if (!block && ((scope.supplier.taxRegimeCode !== undefined && !['1','3'].includes(scope.supplier.taxRegimeCode)) || answers.stSupplierNormalConfirmed === false)) block = 'Regime do fornecedor fora da cobertura CRT 1/3.'
  const structuralBlock = block
  if (!block && tax?.cst !== undefined && !['00', '10'].includes(tax.cst)) {
    block = 'O CST desta compra indica outro tratamento do imposto próprio ou ST retida anteriormente. Exige regra específica antes desta conferência.'
  }
  if (!block && simple && !['101','102'].includes(tax?.csosn ?? '')) block = 'Este recorte do Simples cobre CSOSN 101/102 sem retenção anterior; outros códigos exigem análise própria.'
  if (!block && tax?.stBaseMode !== undefined && tax.stBaseMode !== '4') block = 'A nota usa modalidade ST diferente de MVA; exige outra regra.'
  if (!block && [tax?.baseReductionPercent, tax?.stBaseReductionPercent].some(value => value !== undefined && compareDecimals(value, '0') > 0)) block = 'Redução de base exige regra específica e permanece pendente.'
  const mvaOnly = Boolean(specific && !structuralBlock && (['20','70'].includes(tax?.cst ?? '')
    || [tax?.baseReductionPercent, tax?.stBaseReductionPercent].some(value => value !== undefined && compareDecimals(value,'0') > 0))
    && (tax?.stBaseMode === undefined || tax.stBaseMode === '4'))
  let calculation = block ? { ...pendingCalculation('UNSUPPORTED', block, [], declared), component: 'ICMS_ST' as const }
    : entrySt && answers.stBuyerLiabilityConfirmed !== true ? { ...pendingCalculation('PENDING_DATA', 'Confirme a responsabilidade do adquirente e a inexistência de retenção ou pagamento que duplique o débito.', [], declared), component: 'ICMS_ST' as const }
    : entrySt && candidates.some(row => row.article === 12) && answers.stMvaFallbackConfirmed !== true ? { ...pendingCalculation('PENDING_DATA', 'Confirme a hipótese de MVA do art. 97, § 1º; preço máximo/sugerido, interdependência e marketing direto exigem outra análise.', [], declared), component: 'ICMS_ST' as const }
    : entrySt && mode === 'CATALOG_ORIGINAL' && interstate && !simple && ownRate !== undefined && compareDecimals(fcp.adjustmentRate ?? fcp.icmsRate ?? '0', ownRate) > 0
      ? { ...pendingCalculation('PENDING_DATA', 'A MVA do catálogo é original. Nesta entrada interestadual do regime normal, selecione o ajuste ou confira regra específica; art. 1º, § 5º, do Anexo IX.', [], declared), component: 'ICMS_ST' as const }
    : answers.stCatalogRowId && answers.stCatalogRowId !== 'XML' && scope.catalog.status !== 'FOUND' ? { ...pendingCalculation('PENDING_DATA', scope.catalog.reason, [], declared), component: 'ICMS_ST' as const }
    : decision && decision.status !== 'CALCULATED' ? { ...pendingCalculation(decision.status, decision.reason!, [], declared), component: 'ICMS_ST' as const }
    : mode === 'SPECIFIC_RULE' && !decision ? { ...pendingCalculation('PENDING_RULE', 'A classificação do item não corresponde a uma regra específica disponível.', [], declared), component: 'ICMS_ST' as const }
    : decision && scope.supplier.state !== 'PR' && fcp.adjustmentRate === undefined && fcp.icmsRate !== undefined && answers.fcpStApplicableConfirmed === false && compareDecimals(answers.stSpecificEffectiveRate!, fcp.icmsRate) !== 0
      ? { ...pendingCalculation('PENDING_DATA', 'A carga efetiva da MVA difere da alíquota interna de ICMS. Confira a redução ou o significado das alíquotas antes do imposto.', [], declared), component: 'ICMS_ST' as const }
    : decision && scope.supplier.state !== 'PR' && fcp.adjustmentRate !== undefined && compareDecimals(answers.stSpecificEffectiveRate!, fcp.adjustmentRate) !== 0
      ? { ...pendingCalculation('PENDING_DATA', 'A carga efetiva da MVA precisa corresponder ao ICMS mais FECOP desta operação. Confira as alíquotas.', [], declared), component: 'ICMS_ST' as const }
    : fcp.reason ? { ...pendingCalculation(fcp.status, fcp.reason, [], declared), component: 'ICMS_ST' as const }
    : mode !== 'MANUAL_APPLIED' && mode !== 'SPECIFIC_RULE' && scope.catalog.status !== 'FOUND'
      ? { ...pendingCalculation('PENDING_RULE', scope.catalog.reason, [], declared), component: 'ICMS_ST' as const }
      : !simple && mode !== 'MANUAL_APPLIED' && tax?.amount === undefined
        ? { ...pendingCalculation('PENDING_DATA', 'O cálculo pela MVA automática exige o ICMS da operação própria informado na NF-e para a dedução.', [], declared), component: 'ICMS_ST' as const }
      : calculateParanaPurchaseIcmsSt({
        ...(nfe.issuedAt ? { operationDate: nfe.issuedAt.slice(0, 10) } : {}),
        ...(scope.supplier.state ? { issuerState: scope.supplier.state } : {}), recipientState: 'PR',
        ...(scope.supplier.taxRegimeCode || answers.stSupplierNormalConfirmed !== undefined
          ? { supplierRegime: scope.supplier.taxRegimeCode ?? (answers.stSupplierNormalConfirmed ? '3' : 'NOT_NORMAL') } : {}),
        ...(tax?.originCode ? { merchandiseOrigin: tax.originCode } : {}),
        ...(item.productAmount !== undefined ? { productAmount: item.productAmount } : {}),
        ...(item.ipiAmount !== undefined ? { ipiAmount: item.ipiAmount } : {}),
        ...(item.freightAmount !== undefined ? { freightAmount: item.freightAmount } : {}),
        ...(item.insuranceAmount !== undefined ? { insuranceAmount: item.insuranceAmount } : {}),
        ...(item.otherAmount !== undefined ? { otherAmount: item.otherAmount } : {}),
        ...(item.discountAmount !== undefined ? { discountAmount: item.discountAmount } : {}),
        mvaMode: decision?.engineMvaMode ?? (mode === 'MANUAL_APPLIED' ? 'APPLIED_MANUAL' : mode === 'CATALOG_IMPORT_4' ? 'ADJUSTED_IMPORT_4' : mode === 'CATALOG_INTERSTATE' ? 'ADJUSTED_INTERSTATE' : 'ORIGINAL'),
        ...(decision?.engineMvaMode === 'APPLIED_MANUAL' ? { appliedMvaPercent: decision.appliedMvaPercent! } : {}),
        ...(decision?.engineMvaMode !== 'APPLIED_MANUAL' && decision?.originalMvaPercent ? { originalMvaPercent: decision.originalMvaPercent } : {}),
        ...(mode === 'MANUAL_APPLIED' && answers.stMvaPercent !== undefined ? { appliedMvaPercent: answers.stMvaPercent } : {}),
        ...(mode !== 'MANUAL_APPLIED' && mode !== 'SPECIFIC_RULE' && scope.catalog.status === 'FOUND' ? { originalMvaPercent: scope.catalog.row.originalMvaPercent } : {}),
        ...(fcp.icmsRate !== undefined ? { internalRate: fcp.icmsRate } : {}),
        ...((decision ? answers.stSpecificEffectiveRate : fcp.adjustmentRate) !== undefined
          ? { mvaAdjustmentInternalRate: decision ? answers.stSpecificEffectiveRate! : fcp.adjustmentRate! } : {}),
        ...(ownRate !== undefined ? { ownOperationRate: ownRate } : {}),
        ...(!simple && deductDeclaredOwn && tax?.amount !== undefined ? { ownIcmsAmount: tax.amount } : {}),
        ...(simple ? { simpleDeductionBase: addDecimals(item.productAmount ?? '0', item.freightAmount ?? '0', item.insuranceAmount ?? '0', item.otherAmount ?? '0'),
          simpleDeductionConfirmed: answers.stSimpleDeductionConfirmed === true } : {}),
        ...(answers.stApplicableConfirmed !== undefined ? { applicationConfirmed: answers.stApplicableConfirmed } : {}), declared,
      })
  if (mode !== 'MANUAL_APPLIED' && mode !== 'SPECIFIC_RULE' && scope.catalog.status === 'FOUND') {
    const { catalog, row } = scope.catalog
    const source = `CATALOG/${catalog.id}/v${catalog.version}`
    calculation = { ...calculation,
      ...(calculation.rule ? { rule: { ...calculation.rule, legalBasis: `${calculation.rule.legalBasis}; ${catalog.legalBasis}, item ${row.item} do art. ${row.article}` } } : {}),
      inputs: [...calculation.inputs.map(entry => entry.name === 'originalMvaPercent' ? { ...entry, source }
        : entry.name === 'mvaMode' && answers.stMvaMode === undefined ? { ...entry, source: 'DERIVED/MVA_MODE' } : entry),
        { name: 'mvaCatalogRow', value: JSON.stringify({ catalogId: catalog.id, version: catalog.version,
          validFrom: catalog.validFrom, verifiedThrough: catalog.verifiedThrough, sourceUrl: catalog.sourceUrl,
          sourceSha256: catalog.sourceSha256, ...row }), source, treatment: 'INCLUDED' }],
    }
  }
  if (decision) calculation = { ...calculation,
    ...(calculation.rule ? { rule: { ...calculation.rule, legalBasis: `${calculation.rule.legalBasis}; ${decision.rule.legalBasis}, art. ${decision.article}` } } : {}),
    inputs: [...calculation.inputs.map(entry => ['originalMvaPercent','appliedMvaPercent','mvaMode'].includes(entry.name)
      ? { ...entry, source: `RULE/${decision.rule.id}/v${decision.rule.version}` } : entry),
      { name: 'stSpecificMvaDecision', value: JSON.stringify(decision), source: `RULE/${decision.rule.id}/v${decision.rule.version}`, treatment: decision.status === 'CALCULATED' ? 'INCLUDED' : 'UNDECIDED' }],
    steps: [...decision.steps, ...calculation.steps],
  }
  calculation = { ...calculation, inputs: [...calculation.inputs.map(entry =>
    entry.name === 'simpleDeductionBase' ? { ...entry, source: 'DERIVED/CONFIRMED_SIMPLE_OWN_BASE' }
      : entry.name === 'ownOperationRate' && simple && answers.stOwnOperationRate === undefined ? { ...entry, source: 'RULE/SENATE_22_1989' }
      : entry.name === 'internalRate' && answers.fcpStApplicableConfirmed ? { ...entry, source: 'DERIVED/ICMS_WITHOUT_FCP' }
      : entry.name === 'mvaAdjustmentInternalRate' ? { ...entry, source: 'DERIVED/EFFECTIVE_INTERNAL_RATE' } : entry),
    ...(answers.fcpStApplicableConfirmed !== undefined ? [{ name: 'fcpStApplicableConfirmed', value: String(answers.fcpStApplicableConfirmed),
      source: 'USER/current_item', treatment: answers.fcpStApplicableConfirmed ? 'INCLUDED' as const : 'EXCLUDED' as const }] : []),
    ...(answers.stInternalRateIncludesFcp !== undefined ? [{ name: 'stInternalRateIncludesFcp', value: String(answers.stInternalRateIncludesFcp), source: 'USER/current_item', treatment: 'INCLUDED' as const }] : []),
    { name: 'fcpStCoverage', value: JSON.stringify({ ...PARANA_FCP_ST_RULE, ncm: item.ncm, operationDate: nfe.issuedAt?.slice(0, 10), coverage: fcp.coverage }), source: `RULE/PARANA_FCP_ST_2/v${PARANA_FCP_ST_RULE.version}`, treatment: 'INCLUDED' },
    ...(answers.stCatalogRowId && answers.stCatalogRowId !== 'XML' ? [{ name: 'reviewedClassification', value: JSON.stringify({ originalNcm: item.ncm, originalCest: item.cest ?? null,
      selectedRowId: answers.stCatalogRowId, reviewedCest: scope.catalog.status === 'FOUND' ? scope.catalog.row.cest : null, confirmed: answers.stClassificationConfirmed === true, reason: answers.stClassificationReason ?? null }), source: 'USER/current_item', treatment: 'UNDECIDED' as const }] : []),
  ] }
  if (answers.fcpStApplicableConfirmed && !fcp.reason && fcp.icmsRate && fcp.adjustmentRate) calculation.steps = [
    { name: 'Separação do FECOP', operation: 'ICMS separado do adicional; carga efetiva com FECOP usada no ajuste da MVA',
      inputs: { enteredInternalRate: answers.stInternalRate!, icmsRate: fcp.icmsRate, fcpRate: '2', effectiveMvaRate: fcp.adjustmentRate }, result: fcp.icmsRate },
    ...calculation.steps,
  ]
  const additional = fcp.additional(calculation)
  const memory = { ...calculation, ...(additional ? { additionalComponents: [additional] } : {}) }
  const stMvaReference = scope.catalog.status === 'FOUND' ? {
    status: scope.catalog.status, catalogId: scope.catalog.catalog.id, catalogVersion: scope.catalog.catalog.version,
    ruleId: scope.catalog.row.id, description: scope.catalog.row.description, originalMvaPercent: scope.catalog.row.originalMvaPercent,
    validFrom: scope.catalog.catalog.validFrom, verifiedThrough: scope.catalog.catalog.verifiedThrough,
    sourceUrl: scope.catalog.catalog.sourceUrl, legalBasis: scope.catalog.catalog.legalBasis,
  } : { status: scope.catalog.status, reason: scope.catalog.reason }
  return { answers, questions, stMvaReference, ...(decision ? { stSpecificMva: { status: decision.status, sector: decision.sector, article: decision.article,
    ...(decision.reason ? { reason: decision.reason } : {}), ...(decision.originalMvaPercent ? { originalMvaPercent: decision.originalMvaPercent } : {}),
    ...(decision.appliedMvaPercent ? { appliedMvaPercent: decision.appliedMvaPercent } : {}), legalBasis: decision.rule.legalBasis, sourceUrl: decision.rule.sourceUrl } } : {}), ...(block && !mvaOnly ? { blockedReason: block } : {}), xmlFacts: [
    `Compra destinada ao PR · fornecedor ${scope.supplier.state ?? 'UF ausente'} · comprador ${scope.buyer.state}`,
    ...(item.fuelAnpCode ? [`ANP ${item.fuelAnpCode} · ${item.fuelDescription ?? 'descrição ausente'}`] : []),
    `CFOP ${item.cfop ?? 'ausente'} · NCM ${item.ncm ?? 'ausente'} · CEST ${item.cest ?? 'ausente'} · origem ${tax?.originCode ?? 'ausente'}`,
    simple ? 'Remetente do Simples: MVA original; dedução pela base própria confirmada × 12%, sem usar o percentual ou valor do crédito do Simples.' : deductDeclaredOwn ? `Dedução do ICMS próprio: valor informado no XML (${tax?.amount ?? 'ausente'}). Confira o imposto devido na operação própria.`
      : 'Dedução no modo planilha sem encargos: valor dos produtos × alíquota da operação própria, antes do arredondamento.',
    fcp.coverage.status === 'COVERED' ? `FECOP: NCM da categoria ${fcp.coverage.category}; confirme a descrição e as condições de incidência.` : fcp.coverage.reason,
    'ICMS-ST por MVA. IPI, frete, seguro e outras despesas informados entram na base; confira incidência e descrição legal.',
  ], calculation: memory }
}
