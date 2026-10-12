import type { ItemFiscalAnswers, ItemFiscalContext, ItemFiscalQuestion } from '@motor/contracts'
import type { NormalizedNfe, NormalizedNfeItem, NormalizedParty } from '@motor/domain'
import { calculateParanaPurchaseIcmsSt, compareDecimals, pendingCalculation, selectParanaStMva,
  type ParanaStMvaSelection } from '@motor/tax-engine'

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
  const catalog = selectParanaStMva({ operationDate: nfe.issuedAt?.slice(0, 10), ncm: item.ncm, cest: item.cest })
  const tax = item.declaredIcms
  const hasSt = tax?.stBaseMode !== undefined || tax?.stMarginPercent !== undefined || tax?.stAmount !== undefined
    || ['10', '30', '70'].includes(tax?.cst ?? '') || ['201', '202', '203'].includes(tax?.csosn ?? '')
  const requested = answers.stApplicableConfirmed !== undefined || answers.stMvaMode !== undefined || answers.stMvaPercent !== undefined
  const buyerIdentified = Boolean(companyCnpj && companyCnpj === buyer.taxId)
  if (!requested && !hasSt && nfe.operationDirection !== '0'
    && !(buyerIdentified && !answers.ordinaryTaxTreatmentConfirmed && (catalog.status === 'FOUND' || supplier.state !== 'PR'))) return undefined
  return { buyer, supplier, catalog }
}

export function buildPurchaseStContext(nfe: NormalizedNfe, item: NormalizedNfeItem, answers: ItemFiscalAnswers,
  scope: PurchaseStScope, externalBlock?: string): ItemFiscalContext {
  const tax = item.declaredIcms
  const ownRate = answers.stOwnOperationRate ?? tax?.rate
  const importFour = scope.supplier.state !== scope.buyer.state && ownRate !== undefined && compareDecimals(ownRate, '4') === 0
  const catalogMode = importFour ? 'CATALOG_IMPORT_4' : 'CATALOG_ORIGINAL'
  const mode = answers.stMvaMode ?? (answers.stMvaPercent !== undefined ? 'MANUAL_APPLIED'
    : scope.catalog.status === 'FOUND' ? catalogMode : 'MANUAL_APPLIED')
  const deductDeclaredOwn = mode !== 'MANUAL_APPLIED'
    || [item.freightAmount, item.insuranceAmount, item.otherAmount].some(value => value !== undefined && compareDecimals(value, '0') > 0)
  const questions: ItemFiscalQuestion[] = [
    { field: 'stApplicableConfirmed', label: 'Confirma ICMS-ST relativo às operações subsequentes, comprador contribuinte e mercadoria correspondente à descrição legal e às condições desta compra?', options: yesNo },
    { field: 'stMvaMode', label: 'Como obter a MVA desta operação?', suggestedValue: mode, options: [
      ...(scope.catalog.status === 'FOUND' ? [
        { value: 'CATALOG_ORIGINAL', label: `Usar MVA original da tabela: ${scope.catalog.row.originalMvaPercent}%` },
        { value: 'CATALOG_IMPORT_4', label: 'Ajustar a MVA da tabela para importado interestadual a 4%' },
      ] : []),
      { value: 'MANUAL_APPLIED', label: 'Informar MVA final aplicada, conferida na legislação' },
    ] },
    { field: 'stMvaPercent', label: 'MVA final aplicada (%) — no modo manual, informe o percentual já ajustado quando necessário.', inputType: 'decimal' },
    { field: 'stInternalRate', label: 'Alíquota interna do Paraná (%) — confirme a carga efetiva aplicável; FCP e redução de base exigem outro tratamento.', inputType: 'decimal' },
    { field: 'stOwnOperationRate', label: 'Alíquota da operação própria (%)', inputType: 'decimal', ...(tax?.rate !== undefined ? { suggestedValue: tax.rate } : {}) },
    ...(scope.supplier.taxRegimeCode === undefined ? [{ field: 'stSupplierNormalConfirmed' as const,
      label: 'O fornecedor está no regime normal (CRT 3)? Este cálculo exige confirmar o regime do fornecedor.', options: yesNo }] : []),
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
  if (!block && tax?.cst !== undefined && !['00', '10'].includes(tax.cst)) {
    block = 'O CST desta compra indica outro tratamento do imposto próprio ou ST retida anteriormente. Exige regra específica antes desta conferência.'
  }
  if (!block && tax?.stBaseMode !== undefined && tax.stBaseMode !== '4') block = 'A nota usa modalidade ST diferente de MVA; exige outra regra.'
  if (!block && [tax?.fcpStAmount, tax?.fcpStRate].some(value => value !== undefined && compareDecimals(value, '0') > 0)) block = 'FCP-ST exige um componente próprio e permanece pendente.'
  if (!block && [tax?.baseReductionPercent, tax?.stBaseReductionPercent].some(value => value !== undefined && compareDecimals(value, '0') > 0)) block = 'Redução de base exige regra específica e permanece pendente.'
  let calculation = block ? { ...pendingCalculation('UNSUPPORTED', block, [], declared), component: 'ICMS_ST' as const }
    : mode !== 'MANUAL_APPLIED' && scope.catalog.status !== 'FOUND'
      ? { ...pendingCalculation('PENDING_RULE', scope.catalog.reason, [], declared), component: 'ICMS_ST' as const }
      : mode !== 'MANUAL_APPLIED' && tax?.amount === undefined
        ? { ...pendingCalculation('PENDING_DATA', 'O cálculo pelo catálogo exige o ICMS da operação própria informado na NF-e para a dedução.', [], declared), component: 'ICMS_ST' as const }
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
        mvaMode: mode === 'MANUAL_APPLIED' ? 'APPLIED_MANUAL' : mode === 'CATALOG_IMPORT_4' ? 'ADJUSTED_IMPORT_4' : 'ORIGINAL',
        ...(mode === 'MANUAL_APPLIED' && answers.stMvaPercent !== undefined ? { appliedMvaPercent: answers.stMvaPercent } : {}),
        ...(mode !== 'MANUAL_APPLIED' && scope.catalog.status === 'FOUND' ? { originalMvaPercent: scope.catalog.row.originalMvaPercent } : {}),
        ...(answers.stInternalRate !== undefined ? { internalRate: answers.stInternalRate } : {}),
        ...(ownRate !== undefined ? { ownOperationRate: ownRate } : {}),
        ...(deductDeclaredOwn && tax?.amount !== undefined ? { ownIcmsAmount: tax.amount } : {}),
        ...(answers.stApplicableConfirmed !== undefined ? { applicationConfirmed: answers.stApplicableConfirmed } : {}), declared,
      })
  if (mode !== 'MANUAL_APPLIED' && scope.catalog.status === 'FOUND') {
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
  const stMvaReference = scope.catalog.status === 'FOUND' ? {
    status: scope.catalog.status, catalogId: scope.catalog.catalog.id, catalogVersion: scope.catalog.catalog.version,
    ruleId: scope.catalog.row.id, description: scope.catalog.row.description, originalMvaPercent: scope.catalog.row.originalMvaPercent,
    validFrom: scope.catalog.catalog.validFrom, verifiedThrough: scope.catalog.catalog.verifiedThrough,
    sourceUrl: scope.catalog.catalog.sourceUrl, legalBasis: scope.catalog.catalog.legalBasis,
  } : { status: scope.catalog.status, reason: scope.catalog.reason }
  return { answers, questions, stMvaReference, ...(block ? { blockedReason: block } : {}), xmlFacts: [
    `Compra destinada ao PR · fornecedor ${scope.supplier.state ?? 'UF ausente'} · comprador ${scope.buyer.state}`,
    `CFOP ${item.cfop ?? 'ausente'} · NCM ${item.ncm ?? 'ausente'} · CEST ${item.cest ?? 'ausente'} · origem ${tax?.originCode ?? 'ausente'}`,
    deductDeclaredOwn ? `Dedução do ICMS próprio: valor informado no XML (${tax?.amount ?? 'ausente'}). Confira o imposto devido na operação própria.`
      : 'Dedução no modo planilha sem encargos: valor dos produtos × alíquota da operação própria, antes do arredondamento.',
    'ICMS-ST por MVA. IPI, frete, seguro e outras despesas informados entram na base; confira incidência e descrição legal.',
  ], calculation }
}
