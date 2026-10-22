<script setup lang="ts">
import { isCalculationEligibleCfop } from '@motor/domain'
import { documentaryTaxReview, itemCalculationStatus, itemCalculationComponents, taxComponentLabel } from '@motor/contracts'
import { desktopErrorMessage, RendererErrorMessage } from '../error-messages'
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import type { BatchDetail, FiscalProfileSummary, FiscalItemSummary, FiscalDocumentSummary } from '@motor/contracts'
import ItemClassificationDetails from '../components/ItemClassificationDetails.vue'
import RuleAssessmentDetails from '../components/RuleAssessmentDetails.vue'
import CalculationMemoryDetails from '../components/CalculationMemoryDetails.vue'
import BatchConsolidationSummary from '../components/BatchConsolidationSummary.vue'
import ItemFiscalQuestions from '../components/ItemFiscalQuestions.vue'

const route = useRoute()
const detail = ref<BatchDetail | null>(null)
const error = ref('')
const notice = ref('')
const noticePending = ref(false)
const saving = ref(false)
const exporting = ref(false)
const reassessing = ref(false)
const selectedRunId = ref('')
const profilesByCompany = ref<Record<string, readonly FiscalProfileSummary[]>>({})
const selectedProfiles = ref<Record<string, string>>({})
type DetailPanel = 'overview' | 'documents' | 'pending' | 'files'
const activePanel = ref<DetailPanel>('documents')
const search = ref('')
const documentFilter = ref('eligibleCfop')
const focusedItem = ref('')
const openDocuments = ref(new Set<string>())
const fiscalIndex = ref(0)
const reviewItems = computed(() => detail.value?.documents.flatMap(document => document.items
  .filter(item => (!hasSavedCalculation(item) || isDivergent(item)) && isEligibleItem(item))
  .map(item => ({ document, item }))) ?? [])
const reviewMode = ref<'pending' | 'divergent' | 'documentary'>('pending')
const reviewReason = ref('')
const missingCalculationItems = computed(() => reviewItems.value.filter(entry => !hasSavedCalculation(entry.item) && !documentaryTaxReview(entry.item.calculation)))
const documentaryItems = computed(() => reviewItems.value.filter(entry => documentaryTaxReview(entry.item.calculation)))
const calculatedDivergentItems = computed(() => reviewItems.value.filter(entry => hasSavedCalculation(entry.item) && isDivergent(entry.item)))
function exceptionReason(item: FiscalItemSummary): string {
  return itemCalculationComponents(item.calculation).find(component => component.status !== 'CALCULATED')?.reason
    ?? item.calculation.reason ?? 'Valores calculados diferentes dos informados no XML'
}
const reviewModeItems = computed(() => reviewMode.value === 'pending' ? missingCalculationItems.value : reviewMode.value === 'documentary' ? documentaryItems.value : calculatedDivergentItems.value)
const reviewReasonGroups = computed(() => {
  const groups = new Map<string, number>()
  for (const entry of reviewModeItems.value) { const reason = exceptionReason(entry.item); groups.set(reason, (groups.get(reason) ?? 0) + 1) }
  return [...groups].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count)
})
const fiscalPendingItems = computed(() => reviewModeItems.value.filter(entry => !reviewReason.value || exceptionReason(entry.item) === reviewReason.value))
watch(reviewMode, () => { reviewReason.value = ''; fiscalIndex.value = 0 })
watch(reviewReason, () => { fiscalIndex.value = 0 })
watch(reviewReasonGroups, groups => { if (reviewReason.value && !groups.some(group => group.reason === reviewReason.value)) reviewReason.value = '' })
const excludedEntryCount = computed(() => detail.value?.documents.flatMap(document => document.items)
  .filter(item => !isEligibleItem(item)).length ?? 0)
const currentFiscalItem = computed(() => fiscalPendingItems.value[Math.min(fiscalIndex.value, Math.max(0, fiscalPendingItems.value.length - 1))])
const calculatedCount = computed(() => detail.value?.documents.flatMap(document => document.items)
  .filter(hasSavedCalculation).length ?? 0)
const unsupportedCount = computed(() => detail.value?.documents.flatMap(document => document.items)
  .filter(item => isEligibleItem(item) && itemCalculationStatus(item.calculation) === 'UNSUPPORTED').length ?? 0)
const itemCount = computed(() => detail.value?.documents.reduce((total, document) => total + document.items.length, 0) ?? 0)
const comparison = computed(() => {
  if (!selectedRunId.value || !detail.value) return null
  const comparable = detail.value.documents.flatMap((document) => document.items)
    .filter((item) => item.originalRuleAssessment && item.ruleAssessment)
  const changed = comparable.filter((item) => JSON.stringify({
    kind: item.originalRuleAssessment?.kind,
    pendingCodes: item.originalRuleAssessment?.pendingCodes, pendingDetail: item.originalRuleAssessment?.pendingDetail,
    selectedRuleId: item.originalRuleAssessment?.selectedRuleId,
    evaluated: item.originalRuleAssessment?.evaluated,
  }) !== JSON.stringify({
    kind: item.ruleAssessment?.kind,
    pendingCodes: item.ruleAssessment?.pendingCodes, pendingDetail: item.ruleAssessment?.pendingDetail,
    selectedRuleId: item.ruleAssessment?.selectedRuleId,
    evaluated: item.ruleAssessment?.evaluated,
  })).length
  return { comparable: comparable.length, changed }
})
const pendingItems = computed(() => detail.value?.documents.flatMap((document) =>
  document.items
    .filter((item) => item.classification !== 'CLASSIFICADO')
    .map((item) => ({ document, item })),
) ?? [])

function itemKey(document: FiscalDocumentSummary, item: FiscalItemSummary): string {
  return `${document.id}:${item.itemNumber}`
}

async function loadDetail(): Promise<void> {
  await window.desktopApi.applyReusableFiscalAnswers(String(route.params.id))
  const loaded = await window.desktopApi.getBatchDetail(String(route.params.id), selectedRunId.value || undefined)
  detail.value = loaded
  const companyIds = [...new Set(loaded.documents.map((document) => document.companyId).filter((id): id is string => Boolean(id)))]
  const workspace = await window.desktopApi.getWorkspace()
  const activeCompanies = new Set(workspace.companies.filter((company) => company.active).map((company) => company.id))
  const entries = await Promise.all(companyIds.map(async (id) => [id, activeCompanies.has(id)
    ? (await window.desktopApi.listFiscalProfiles(id)).filter((profile) => profile.active) : []] as const))
  profilesByCompany.value = Object.fromEntries(entries)
}

async function handleFiscalSaved(outcome: { status: string; message: string; divergent?: boolean }): Promise<void> {
  const reviewedKey = activePanel.value === 'pending' && currentFiscalItem.value ? itemKey(currentFiscalItem.value.document, currentFiscalItem.value.item) : undefined
  notice.value = outcome.message
  noticePending.value = outcome.status !== 'CALCULATED' || Boolean(outcome.divergent)
  error.value = ''
  try {
    await loadDetail()
    fiscalIndex.value = Math.min(fiscalIndex.value, Math.max(0, fiscalPendingItems.value.length - 1))
    if (outcome.status === 'CALCULATED' && reviewedKey && fiscalPendingItems.value.length > 1) {
      const reviewedIndex = fiscalPendingItems.value.findIndex(entry => itemKey(entry.document, entry.item) === reviewedKey)
      if (reviewedIndex >= 0) fiscalIndex.value = (reviewedIndex + 1) % fiscalPendingItems.value.length
    }
  } catch (cause) {
    error.value = desktopErrorMessage(cause, 'As respostas foram salvas, mas não foi possível atualizar a lista. Reabra o lote para consultar o resultado.')
  }
}

async function exportExcel(): Promise<void> {
  if (!detail.value || exporting.value) return
  exporting.value = true; error.value = ''; notice.value = ''
  noticePending.value = false
  try {
    const result = await window.desktopApi.exportBatchExcel(detail.value.batch.id)
    if (result) notice.value = `Excel exportado: ${result.path}`
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Não foi possível exportar o Excel.'
  } finally { exporting.value = false }
}

async function chooseRun(): Promise<void> {
  error.value = ''
  try {
    await loadDetail()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : RendererErrorMessage.ASSESSMENT_LOAD
  }
}

async function reassessRules(): Promise<void> {
  if (!detail.value || reassessing.value) return
  error.value = ''
  notice.value = ''
  try {
    const original = detail.value.originalAssessmentPack
    const originalLabel = original ? `${original.id} v${original.version}` : 'indisponível'
    const message = `Avaliação original: ${originalLabel}\nNova avaliação: catálogo local atualizado e propostas embarcadas.\n\nA nova execução será salva separadamente. A original não será alterada. A reavaliação de regras não altera os cálculos de ICMS salvos. Deseja continuar?`
    if (!window.confirm(message)) return
    reassessing.value = true
    const run = await window.desktopApi.reassessBatchRules(detail.value.batch.id)
    selectedRunId.value = run.id
    await loadDetail()
    notice.value = `Reavaliação ${run.number} salva com ${run.itemCount} item(ns), pacote ${run.packId} v${run.packVersion}.`
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : RendererErrorMessage.BATCH_REASSESS
  } finally {
    reassessing.value = false
  }
}

async function linkItem(document: FiscalDocumentSummary, item: FiscalItemSummary): Promise<void> {
  if (!document.companyId || !document.issuerTaxId || !item.supplierProductCode) return
  error.value = ''
  notice.value = ''
  saving.value = true
  try {
    const existingProducts = await window.desktopApi.listSupplierProducts(document.companyId)
    const existing = existingProducts.find((product) => product.supplierCnpj === document.issuerTaxId?.replace(/\D/g, '')
      && product.productCode === item.supplierProductCode)
    await window.desktopApi.saveSupplierProduct({
      ...(existing ? { expectedRevision: existing.revision } : {}),
      companyId: document.companyId,
      supplierCnpj: document.issuerTaxId,
      productCode: item.supplierProductCode,
      profileId: selectedProfiles.value[itemKey(document, item)] || '',
    })
    await loadDetail()
    notice.value = 'Produto vinculado ao perfil. A situação dos itens foi atualizada.'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : RendererErrorMessage.PRODUCT_LINK
  } finally {
    saving.value = false
  }
}

function environment(code?: string): string {
  return code === '1' ? 'Produção' : code === '2' ? 'Homologação' : 'Ambiente não informado'
}
function money(value?: string): string {
  if (value === undefined) return '—'
  if (!/^-?\d+(?:\.\d+)?$/.test(value)) return value
  const [integer, cents = '00'] = value.split('.')
  return `R$ ${integer!.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${cents.padEnd(2, '0')}`
}
function dateTime(value?: string): string {
  if (!value) return 'Data não informada'
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : value
}
function calculationLabel(item: FiscalItemSummary): string {
  if (!isEligibleItem(item)) return 'Fora da entrada interestadual'
  const documentary = documentaryTaxReview(item.calculation)
  if (documentary) return documentary.title + ' · sem apuração'
  if (hasSavedCalculation(item) && item.calculation.inputs.some(input => input.name === 'calculationPurpose' && input.value === 'INTERSTATE_ENTRY_ST_ESTIMATE')) return 'ST de entrada por MVA · estimativa'
  if (hasSavedCalculation(item) && item.calculation.rule?.id === 'PR_CONSUMER_DIFAL_REVIEWED') return 'DIFAL de uso/ativo · revisão confirmada'
  if (hasSavedCalculation(item) && item.calculation.component === 'ICMS_ST' && !item.calculation.inputs.some(input=>input.name==='calculationPurpose') && item.calculation.inputs.some(input=>input.name==='automaticXmlCalculation' || input.name==='automaticCatalogCalculation')) return 'ST destacada · conferência do fornecedor'
  if (hasSavedCalculation(item) && item.calculation.inputs.some(input => input.name === 'automaticCatalogCalculation')) return 'Calculado por XML e catálogo'
  if (hasSavedCalculation(item) && item.calculation.inputs.some(input => input.name === 'automaticXmlCalculation')) return 'Calculado pelo XML'
  if (itemCalculationStatus(item.calculation) === 'CALCULATED' && !item.calculation.runId) return 'Aguardando confirmação'
  return ({ CALCULATED: 'Calculado', PENDING_DATA: 'Dados pendentes', PENDING_RULE: 'Regra pendente', UNSUPPORTED: 'Fora do escopo' })[itemCalculationStatus(item.calculation)]
}
function hasSavedCalculation(item: FiscalItemSummary): boolean {
  return isEligibleItem(item) && Boolean(item.calculation.runId) && itemCalculationStatus(item.calculation) === 'CALCULATED'
}
function isIcmsSt(item: FiscalItemSummary): boolean {
  return (item.calculation.component ?? item.calculation.result?.component) === 'ICMS_ST'
}
function itemComponent(item: FiscalItemSummary) {
  return item.calculation.component ?? item.calculation.result?.component ?? 'ICMS'
}
function isDivergent(item: FiscalItemSummary): boolean {
  return isEligibleItem(item) && Boolean(itemCalculationComponents(item.calculation).some(component => component.comparisons?.some(c => c.status === 'DIFFERENT')))
}
function isEligibleItem(item: FiscalItemSummary): boolean {
  return item.entryCalculationEligible !== false && isCalculationEligibleCfop(item.cfop)
}
// A diferença exibida vem da consolidação salva do mesmo item e componente.
const amountComparisons = computed(() => new Map(detail.value?.consolidation?.evidence
  .filter(entry => entry.status === 'CALCULATED' && entry.comparison)
  .map(entry => [JSON.stringify([entry.documentId, entry.itemNumber, entry.component ?? 'ICMS']), entry.comparison!] as const) ?? []))
function amountComparison(document: FiscalDocumentSummary, item: FiscalItemSummary) {
  return amountComparisons.value.get(JSON.stringify([document.id, item.itemNumber, itemComponent(item)]))
}
function documentReviewCount(document: FiscalDocumentSummary): number {
  return document.items.filter(item => (!hasSavedCalculation(item) || isDivergent(item)) && isEligibleItem(item)).length
}
function documentState(document: FiscalDocumentSummary): string {
  if (!document.eligibleForProcessing) return 'Pendente'
  const eligible = document.items.filter(isEligibleItem)
  if (!eligible.length) return 'Fora da entrada interestadual'
  const reviewCount = documentReviewCount(document)
  const unassessed = eligible.filter(item => documentaryTaxReview(item.calculation)).length
  if (unassessed === eligible.length) return `${unassessed} sem apuração`
  if (reviewCount) return `${reviewCount - unassessed} para conferir${unassessed ? ` · ${unassessed} sem apuração` : ''}`
  return eligible.length > 0 && documentCalculated(document) === eligible.length ? 'Calculada' : 'Importada para análise'
}
function documentCalculated(document: FiscalDocumentSummary): number {
  return document.items.filter(hasSavedCalculation).length
}
function ingestionLabel(value: string): string {
  return ({ RECEBIDO: 'Recebido', VALIDANDO: 'Validando', PROCESSANDO: 'Processando', CONCLUIDO: 'Concluído', PROCESSADO: 'Processado',
    PROCESSADA: 'Processada', PENDENTE: 'Pendente', INTERROMPIDO: 'Interrompido', CANCELADO: 'Cancelado', ERRO: 'Erro',
    ORIGINAL: 'Original', REPETIDA: 'Repetida', SEM_CONFLITO: 'Sem conflito', CONFLITO_CONTEUDO: 'Conteúdo conflitante' } as Record<string, string>)[value] ?? value
}
const divergentCount = computed(() => detail.value?.documents.flatMap(d => d.items).filter(isDivergent).length ?? 0)
const eligibleItemCount = computed(() => itemCount.value - excludedEntryCount.value)
const calculatedPercent = computed(() => eligibleItemCount.value ? Math.round(calculatedCount.value / eligibleItemCount.value * 100) : 0)
const visibleDocuments = computed(() => {
  const query = search.value.trim().toLocaleLowerCase('pt-BR')
  return detail.value?.documents.filter(document => {
    const matchesSearch = !query || [document.number, document.series, document.accessKey, document.companyName, document.issuerName,
      document.recipientName, ...document.items.flatMap(i => [i.description, i.supplierProductCode, i.ncm, i.cfop])]
      .some(value => value?.toLocaleLowerCase('pt-BR').includes(query))
    const matchesFilter = documentFilter.value === 'all'
      || (documentFilter.value === 'eligibleCfop' && document.items.some(isEligibleItem))
      || (documentFilter.value === 'calculated' && document.items.some(hasSavedCalculation))
      || (documentFilter.value === 'pending' && document.items.some(i => isEligibleItem(i) && !hasSavedCalculation(i)))
      || (documentFilter.value === 'divergent' && document.items.some(isDivergent))
    return matchesSearch && matchesFilter
  }) ?? []
})
function showDocuments(filter = 'all'): void {
  search.value = ''; documentFilter.value = filter; activePanel.value = 'documents'
}
function showItem(document: FiscalDocumentSummary, item: FiscalItemSummary): void {
  showDocuments()
  openDocuments.value.add(document.id)
  focusedItem.value = `item-${document.id}-${item.itemNumber}`
  void nextTick(() => window.document.getElementById(focusedItem.value)?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
}
async function revealHash(): Promise<void> {
  if (route.query.painel === 'files') activePanel.value = 'files'
  if (route.query.painel === 'pending') activePanel.value = 'pending'
  if (!route.hash || !detail.value) return
  const note = detail.value.documents.find(document => `#nota-${document.id}` === route.hash)
  if (note) {
    showDocuments(); openDocuments.value.add(note.id)
    await nextTick(); window.document.getElementById(`nota-${note.id}`)?.scrollIntoView({ block: 'start' })
    return
  }
  const target = detail.value.documents.flatMap(document => document.items.map(item => ({ document, item })))
    .find(({ document, item }) => `#item-${document.id}-${item.itemNumber}` === route.hash)
  if (!target) return
  showDocuments()
  openDocuments.value.add(target.document.id)
  focusedItem.value = route.hash.slice(1)
  await nextTick()
  window.document.getElementById(focusedItem.value)?.scrollIntoView({ block: 'start' })
}
async function initialize(): Promise<void> {
  error.value = ''
  try {
    await loadDetail()
    const firstDocument = detail.value?.documents.find(document=>document.items.some(hasSavedCalculation)) ?? detail.value?.documents.find(document=>document.items.some(isEligibleItem))
    if (firstDocument && !route.hash) openDocuments.value.add(firstDocument.id)
    await revealHash()
  }
  catch (cause) { error.value = cause instanceof Error ? cause.message : RendererErrorMessage.BATCH_LOAD }
}
onMounted(initialize)
watch(() => route.hash, revealHash)
watch(() => route.query.painel, revealHash)
watch(() => route.params.id, () => {
  detail.value = null; selectedRunId.value = ''; activePanel.value = 'documents'; fiscalIndex.value = 0
  focusedItem.value = ''; openDocuments.value.clear(); search.value = ''; documentFilter.value = 'all'
  void initialize()
})
</script>

<template>
  <section class="batch-detail">
    <nav class="breadcrumb" aria-label="Localização"><RouterLink to="/lotes">Histórico</RouterLink><span aria-hidden="true">/</span><span>Detalhe do lote</span></nav>
    <p v-if="error" class="form-error notice" role="alert">{{ error }}</p>
    <p v-if="notice" class="notice" :class="noticePending ? 'inline-notice' : 'form-success'" role="status">{{ notice }}</p>
    <div v-if="!detail" class="card loading-card" role="status"><span class="loading-dot" aria-hidden="true"></span>{{ error ? 'O lote não pôde ser carregado.' : 'Carregando os dados do lote…' }}<button v-if="error" class="button secondary" @click="initialize">Tentar novamente</button></div>
    <template v-if="detail">
      <header class="batch-header">
        <div class="header-title"><div class="header-tags"><span class="eyebrow">Conferência do lote</span><span class="badge badge-neutral">{{ ingestionLabel(detail.batch.status) }}</span><span class="badge" :class="detail.batch.environmentCode === '2' ? 'badge-amber' : 'badge-blue'">{{ environment(detail.batch.environmentCode) }}</span></div>
          <h2>{{ detail.batch.originalName || 'Lote fiscal' }}</h2>
          <p>{{ detail.batch.companyName || 'Empresa não informada' }}<span aria-hidden="true"> · </span>Importado em {{ dateTime(detail.batch.receivedAt) }}</p>
        </div>
        <div class="header-actions"><button class="button primary" type="button" :disabled="exporting || saving || reassessing" @click="exportExcel">{{ exporting ? 'Exportando…' : 'Exportar Excel' }}</button><small>Todas as empresas e meses deste lote</small></div>
      </header>

      <div class="batch-metrics" aria-label="Situação dos itens">
        <button class="card metric" @click="showDocuments()"><span class="metric-caption">Documentos fiscais<span class="metric-symbol" aria-hidden="true">▤</span></span><strong>{{ detail.batch.totalDocuments }}</strong><small>{{ itemCount }} itens neste lote</small></button>
        <button class="card metric" @click="showDocuments('calculated')"><span class="metric-caption">Itens calculados<span class="metric-symbol green" aria-hidden="true">✓</span></span><strong>{{ calculatedCount }}<span class="metric-denominator"> / {{ eligibleItemCount }}</span></strong><small>{{ calculatedPercent }}% dos itens elegíveis com cálculo salvo</small></button>
        <button class="card metric" @click="activePanel = 'pending'"><span class="metric-caption">Itens sem cálculo<span class="metric-symbol amber" aria-hidden="true">!</span></span><strong>{{ missingCalculationItems.length }}</strong><small>{{ documentaryItems.length }} sem apuração · {{ calculatedDivergentItems.length }} com divergência</small></button>
        <button class="card metric" @click="showDocuments('divergent')"><span class="metric-caption">Itens com divergência<span class="metric-symbol rose" aria-hidden="true">≠</span></span><strong>{{ divergentCount }}</strong><small>Base ou ICMS acima da tolerância</small></button>
      </div>

      <nav class="detail-navigation" aria-label="Áreas do lote">
        <button :aria-pressed="activePanel === 'overview'" :class="{ active: activePanel === 'overview' }" @click="activePanel = 'overview'">Resumo</button>
        <button :aria-pressed="activePanel === 'documents'" :class="{ active: activePanel === 'documents' }" @click="activePanel = 'documents'">Notas e itens <span>{{ detail.documents.length }}</span></button>
        <button :aria-pressed="activePanel === 'pending'" :class="{ active: activePanel === 'pending' }" @click="activePanel = 'pending'">Conferência <span>{{ reviewItems.length }}</span></button>
        <button :aria-pressed="activePanel === 'files'" :class="{ active: activePanel === 'files' }" @click="activePanel = 'files'">Arquivos e eventos</button>
      </nav>

      <section v-show="activePanel === 'overview'" class="panel-stack" aria-label="Resumo do lote">
        <article class="card analysis-progress">
          <div class="progress-copy"><span class="section-kicker">Andamento da análise</span><h3>{{ reviewItems.length ? 'Continue a conferência dos itens' : calculatedCount ? 'Confira os resultados salvos' : 'Consulte a situação dos documentos' }}</h3>
            <p>{{ calculatedCount }} itens calculados, {{ missingCalculationItems.length }} sem cálculo, {{ documentaryItems.length }} com tratamento documental sem apuração e {{ calculatedDivergentItems.length }} calculados com divergências. {{ excludedEntryCount }} itens fora das compras interestaduais para o Paraná ficam fora do cálculo e dos totais. O cálculo usa XML, MVA e alíquotas da regra aplicável; as premissas ficam na memória.</p>
            <div class="progress-track" role="progressbar" aria-label="Itens com cálculo salvo" :aria-valuenow="calculatedCount" :aria-valuemax="Math.max(eligibleItemCount, 1)" aria-valuemin="0"><span :style="{ width: `${calculatedPercent}%` }"></span></div>
          </div>
          <button v-if="reviewItems.length" class="button secondary" @click="activePanel = 'pending'">Conferir e calcular</button>
          <button v-else class="button secondary" @click="showDocuments()">Ver notas e itens</button>
        </article>
        <div v-if="detail.consolidation" class="consolidation-area"><BatchConsolidationSummary :summary="detail.consolidation" /></div>
        <section class="card reassessment-panel" aria-labelledby="reassessment-title">
          <div class="section-heading"><div><span class="section-kicker">Registro de avaliações</span><h3 id="reassessment-title">Histórico das regras</h3><p>Compare o enquadramento da importação com as reavaliações salvas.</p></div><span class="badge badge-neutral">{{ detail.ruleAssessmentRuns.length }} reavaliações</span></div>
          <div class="reassessment-controls"><label for="rule-run">Execução exibida<select id="rule-run" v-model="selectedRunId" :disabled="reassessing" @change="chooseRun"><option value="">{{ detail.originalAssessmentPack ? 'Original da importação' : 'Original indisponível' }}</option><option v-for="run in detail.ruleAssessmentRuns" :key="run.id" :value="run.id">Reavaliação {{ run.number }} · {{ run.packId }} v{{ run.packVersion }} · {{ dateTime(run.assessedAt) }}</option></select></label><button class="button secondary" type="button" :disabled="reassessing || itemCount === 0" @click="reassessRules">{{ reassessing ? 'Reavaliando…' : 'Reavaliar regras' }}</button></div>
          <p class="muted">Pacote original: {{ detail.originalAssessmentPack ? `${detail.originalAssessmentPack.id} v${detail.originalAssessmentPack.version}` : 'indisponível neste lote' }}. Regras em rascunho não habilitam o cálculo.</p>
          <p v-if="comparison && comparison.comparable > 0" class="inline-notice">{{ comparison.changed }} de {{ comparison.comparable }} itens apresentam resultado diferente da importação. A avaliação original permanece salva.</p><p v-else-if="comparison" class="inline-notice">A avaliação original não está disponível para comparação. A nova execução permanece salva.</p>
        </section>
        <details class="card batch-identity"><summary>Identificação e inventário do lote</summary><dl><div><dt>Identificador</dt><dd class="monospace">{{ detail.batch.id }}</dd></div><div><dt>Ocorrências de arquivos</dt><dd>{{ detail.batch.totalFiles }}</dd></div><div><dt>Pendências na importação</dt><dd>{{ detail.batch.totalPendencies }}</dd></div></dl></details>
      </section>

      <section v-show="activePanel === 'documents'" class="panel-stack" aria-label="Notas e itens">
        <div class="section-heading"><div><h3>Documentos fiscais</h3><p>Localize uma nota e expanda seus itens para conferir valores, respostas e memória.</p></div><span class="badge badge-neutral">{{ visibleDocuments.length }} de {{ detail.documents.length }} notas</span></div>
        <div class="card document-toolbar"><label class="search-field"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input v-model="search" aria-label="Buscar notas e produtos" placeholder="Buscar por nota, produto, chave ou empresa"></label><label class="filter-field"><span>Situação dos itens</span><select v-model="documentFilter" aria-label="Filtrar documentos por situação"><option value="all">Todos os documentos</option><option value="eligibleCfop">Compras de outros estados para o PR</option><option value="pending">Sem cálculo / sem apuração</option><option value="divergent">Com divergência</option><option value="calculated">Com itens calculados</option></select></label></div>
        <details v-for="document in visibleDocuments" :key="document.id" :id="`nota-${document.id}`" class="card document-card" :open="openDocuments.has(document.id)" @toggle="($event.target as HTMLDetailsElement).open ? openDocuments.add(document.id) : openDocuments.delete(document.id)">
          <summary class="document-heading"><span class="document-icon" aria-hidden="true">▤</span><div class="document-title"><strong>NF-e {{ document.number }} <span>Série {{ document.series }}</span></strong><small>{{ document.issuerName || document.issuerTaxId || document.companyName || 'Emitente não informado' }}</small></div><span class="document-counts"><span>{{ document.items.length }} produtos</span><span>{{ documentCalculated(document) }} calculados</span></span><span class="badge" :class="!document.eligibleForProcessing || documentReviewCount(document) ? 'badge-amber' : documentState(document) === 'Calculada' ? 'badge-green' : 'badge-blue'">{{ documentState(document) }}</span><span class="document-chevron" aria-hidden="true">⌄</span></summary>
          <div class="document-body"><div class="document-context"><span>{{ document.companyName || 'Empresa não identificada' }}</span><span>{{ dateTime(document.issuedAt) }} · {{ environment(document.environmentCode) }}</span></div>
            <p v-if="document.pendingReason" class="inline-notice">{{ document.pendingReason }}</p>
            <p v-if="document.conflictResolution" class="inline-notice">{{ document.conflictResolution.reason }} <RouterLink class="text-button" :to="{ path: '/conflitos-notas', query: { key: document.accessKey } }">Comparar versões e decisões</RouterLink></p>
            <p v-if="document.documentaryReason" class="inline-notice">{{ document.documentaryReason }} <RouterLink class="text-button" :to="{ path: '/revisao-documental', query: { key: document.accessKey } }">Revisar eventos</RouterLink></p>
            <p v-else-if="document.documentaryStatus === 'CCE_APPROVED'" class="inline-notice">CC-e revisada: uso do XML original autorizado. <RouterLink class="text-button" :to="{ path: '/revisao-documental', query: { key: document.accessKey } }">Ver decisões</RouterLink></p>
            <div class="document-products">
            <article v-for="item in document.items" :key="item.itemNumber" :id="`item-${document.id}-${item.itemNumber}`" class="fiscal-item" :class="{ 'item-focused': focusedItem === `item-${document.id}-${item.itemNumber}` }">
              <div class="item-heading"><span class="item-number">{{ item.itemNumber }}</span><div><h4>{{ item.description || item.supplierProductCode || 'Produto sem descrição' }}</h4><p>{{ item.supplierProductCode ? `Código ${item.supplierProductCode} · ` : '' }}NCM {{ item.ncm || '—' }} · CFOP {{ item.cfop || '—' }}</p></div><span class="badge" :class="hasSavedCalculation(item) ? 'badge-green' : !isEligibleItem(item) ? 'badge-neutral' : itemCalculationStatus(item.calculation) === 'UNSUPPORTED' ? 'badge-neutral' : 'badge-amber'">{{ calculationLabel(item) }}</span><span v-if="isDivergent(item)" class="badge badge-rose">Divergência</span></div>
              <div class="item-values">
                <div><span>Valor do produto</span><strong>{{ money(item.productAmount) }}</strong></div>
                <div v-if="documentaryTaxReview(item.calculation)"><span>{{ documentaryTaxReview(item.calculation)?.kind === 'PREVIOUS_ST' ? 'ICMS-ST anterior informado no XML' : 'Destaque nesta NF-e' }}</span><strong>{{ documentaryTaxReview(item.calculation)?.kind === 'PREVIOUS_ST' ? money(documentaryTaxReview(item.calculation)?.reported.retainedStAmount) : 'Sem destaque' }}</strong></div><div v-else><span>{{ itemComponent(item) === 'ICMS_ENTRY' ? 'ICMS próprio na nota' : isIcmsSt(item) ? 'ICMS-ST declarado' : 'ICMS declarado' }}</span><strong>{{ money(isIcmsSt(item) ? item.declaredIcmsStAmount : item.declaredIcmsAmount) }}</strong></div>
                <div class="value-calculated"><span>{{ documentaryTaxReview(item.calculation) ? 'Imposto devido nesta operação' : taxComponentLabel(itemComponent(item)) + ' calculado' }}</span><strong>{{ documentaryTaxReview(item.calculation) ? 'Não apurado' : money(isEligibleItem(item) ? item.calculation.result?.amount : undefined) }}</strong></div>
                <div class="value-difference" :class="{ 'amount-divergent': amountComparison(document, item)?.status === 'DIFFERENT' }"><span>{{ itemComponent(item) === 'ICMS_ENTRY' ? 'Conferência com XML' : 'Diferença' }}</span><strong>{{ itemComponent(item) === 'ICMS_ENTRY' ? 'Não se aplica' : money(amountComparison(document, item)?.difference) }}</strong></div>
              </div>
              <div v-if="item.calculation.deferredAmount !== undefined || item.calculation.additionalComponents?.some(component => component.component === 'FCP_ST') || item.declaredFcpStAmount !== undefined" class="item-additional-values">
                <span v-if="isEligibleItem(item) && item.calculation.deferredAmount !== undefined">ICMS diferido <b>{{ money(item.calculation.deferredAmount) }}</b></span>
                <template v-if="item.calculation.additionalComponents?.some(component => component.component === 'FCP_ST') || item.declaredFcpStAmount !== undefined"><span>FCP-ST declarado <b>{{ money(item.declaredFcpStAmount) }}</b></span><span>FCP-ST calculado <b>{{ money(isEligibleItem(item) ? item.calculation.additionalComponents?.find(component => component.component === 'FCP_ST')?.result?.amount : undefined) }}</b></span></template>
              </div>
              <details class="item-analysis" :open="focusedItem === `item-${document.id}-${item.itemNumber}`"><summary>Dados e memória de cálculo <span class="analysis-toggle" aria-hidden="true"></span></summary><div class="item-analysis-grid"><div class="item-analysis-block"><h5>Cálculo da operação</h5><p v-if="!isEligibleItem(item)" class="muted">{{ item.entryCalculationExclusionReason || 'Este item não corresponde a uma compra de outro estado destinada à empresa do Paraná.' }}</p><p v-else class="muted">Complete as respostas ou confira a memória do resultado.</p><ItemFiscalQuestions v-if="isEligibleItem(item)" :batch-id="detail.batch.id" :document-id="document.id" :item-number="item.itemNumber" @saved="handleFiscalSaved" /><CalculationMemoryDetails :calculation="item.calculation" /></div><div class="item-analysis-block"><h5>Cadastro e enquadramento</h5><p class="muted">Classificação e seleção de regras deste produto.</p><ItemClassificationDetails :item="item" /><RuleAssessmentDetails :assessment="item.ruleAssessment" :original-assessment="item.originalRuleAssessment" /><div v-if="document.companyId && document.issuerTaxId?.length === 14 && item.supplierProductCode && profilesByCompany[document.companyId]?.length" class="catalog-inline-action"><label>Perfil fiscal do produto<select v-model="selectedProfiles[itemKey(document, item)]"><option value="">Escolher perfil</option><option v-for="profile in profilesByCompany[document.companyId]" :key="profile.id" :value="profile.id">{{ profile.name }}</option></select></label><button class="button secondary" type="button" :disabled="saving || !selectedProfiles[itemKey(document, item)]" @click="linkItem(document, item)">Vincular</button></div></div></div></details>
            </article>
            </div>
            <details class="document-identification"><summary>Identificação da nota e chave de acesso<span aria-hidden="true">⌄</span></summary><dl class="document-data"><div><dt>Empresa analisada</dt><dd>{{ document.companyName || '—' }}</dd></div><div><dt>Emitente</dt><dd>{{ document.issuerName || document.issuerTaxId || '—' }}</dd></div><div><dt>Destinatário</dt><dd>{{ document.recipientName || document.recipientTaxId || '—' }}</dd></div><div><dt>Emissão e ambiente</dt><dd>{{ dateTime(document.issuedAt) }} · {{ environment(document.environmentCode) }} · Modelo {{ document.model }}</dd></div><div class="access-key"><dt>Chave de acesso</dt><dd class="monospace">{{ document.accessKey }}</dd></div></dl></details>
          </div>
        </details>
        <div v-if="!visibleDocuments.length" class="card empty-panel"><h4>{{ detail.documents.length ? 'Nenhuma nota corresponde à busca' : 'Nenhum documento normalizado' }}</h4><p>{{ detail.documents.length ? 'Experimente outro termo ou escolha todos os documentos.' : 'Confira os arquivos e diagnósticos para entender a importação.' }}</p><button v-if="detail.documents.length" class="button secondary" @click="showDocuments()">Limpar filtros</button><button v-else class="button secondary" @click="activePanel = 'files'">Ver arquivos e eventos</button></div>
      </section>

      <section v-show="activePanel === 'pending'" class="panel-stack" aria-label="Pendências do lote">
        <div class="section-heading"><div><h3>Conferência do lote</h3><p>Resolva o que impede o cálculo ou confira diferenças nos resultados que já foram calculados.</p></div><span class="badge badge-neutral">{{ calculatedCount }} concluídos</span></div>
        <div class="card review-controls">
          <div class="review-tabs" aria-label="Tipo de conferência"><button type="button" :aria-pressed="reviewMode === 'pending'" :class="{ active: reviewMode === 'pending' }" @click="reviewMode = 'pending'">Sem cálculo <span>{{ missingCalculationItems.length }}</span></button><button type="button" :aria-pressed="reviewMode === 'divergent'" :class="{ active: reviewMode === 'divergent' }" @click="reviewMode = 'divergent'">Calculados com divergência <span>{{ calculatedDivergentItems.length }}</span></button><button type="button" :aria-pressed="reviewMode === 'documentary'" :class="{ active: reviewMode === 'documentary' }" @click="reviewMode = 'documentary'">Sem apuração <span>{{ documentaryItems.length }}</span></button></div>
          <label v-if="reviewReasonGroups.length" class="review-reason-filter">Filtrar pelo motivo<select v-model="reviewReason"><option value="">Todos os motivos ({{ reviewModeItems.length }} itens)</option><option v-for="group in reviewReasonGroups" :key="group.reason" :value="group.reason">{{ group.count }} itens · {{ group.reason }}</option></select></label>
          <p>{{ reviewMode === 'documentary' ? 'O tratamento do XML foi identificado. Estes itens não têm imposto devido apurado e não são contabilizados como cálculos de valor zero.' : reviewMode === 'pending' ? 'Estes itens precisam de um dado ou de uma regra específica. Ao responder um produto, as respostas também podem atender os compatíveis da nota.' : 'O cálculo destes itens está concluído. A diferença com o XML está preservada para conferência e não impede consultar ou exportar os valores.' }}</p>
        </div>
        <article v-if="currentFiscalItem" class="card pending-workspace">
          <header class="pending-context">
            <div><span class="section-kicker">Revisão {{ Math.min(fiscalIndex, fiscalPendingItems.length - 1) + 1 }} de {{ fiscalPendingItems.length }}</span><h4>NF-e {{ currentFiscalItem.document.number }} · Item {{ currentFiscalItem.item.itemNumber }}</h4><p class="review-product-name">{{ currentFiscalItem.item.description || currentFiscalItem.item.supplierProductCode || 'Produto sem descrição' }}</p><p>{{ currentFiscalItem.document.companyName || 'Empresa não informada' }}</p></div>
            <div class="review-navigation"><label>Escolher item<select v-model.number="fiscalIndex" aria-label="Escolher item para revisar"><option v-for="(entry, index) in fiscalPendingItems" :key="itemKey(entry.document, entry.item)" :value="index">NF {{ entry.document.number }} · Item {{ entry.item.itemNumber }} · {{ entry.item.supplierProductCode || entry.item.description }}</option></select></label><button type="button" class="text-button" @click="showItem(currentFiscalItem.document, currentFiscalItem.item)">Ver nota completa</button></div>
          </header>
          <div class="exception-context"><strong>{{ reviewMode === 'documentary' ? 'Tratamento identificado · imposto não apurado' : reviewMode === 'pending' ? 'Dados do item para conferência' : 'O cálculo já está concluído' }}</strong><p v-if="reviewMode === 'divergent'">Confira abaixo os valores e a origem da diferença com o XML.</p><div class="exception-facts"><span>CFOP {{ currentFiscalItem.item.cfop || '—' }}</span><span>NCM {{ currentFiscalItem.item.ncm || '—' }}</span></div></div>
          <ItemFiscalQuestions :key="itemKey(currentFiscalItem.document, currentFiscalItem.item)" :batch-id="detail.batch.id" :document-id="currentFiscalItem.document.id" :item-number="currentFiscalItem.item.itemNumber" expanded @saved="handleFiscalSaved" />
          <footer v-if="fiscalPendingItems.length > 1" class="pending-actions"><span>As respostas são enviadas ao confirmar o cálculo.</span><div><button type="button" class="button secondary" @click="fiscalIndex = (Math.min(fiscalIndex, fiscalPendingItems.length - 1) - 1 + fiscalPendingItems.length) % fiscalPendingItems.length">Anterior</button><button type="button" class="button secondary" @click="fiscalIndex = (Math.min(fiscalIndex, fiscalPendingItems.length - 1) + 1) % fiscalPendingItems.length">Próximo item</button></div></footer>
        </article>
        <article v-else class="card complete-state"><span aria-hidden="true">✓</span><div><h4>{{ reviewMode === 'pending' ? 'Nenhum item sem cálculo neste filtro' : reviewMode === 'documentary' ? 'Nenhum item sem apuração neste filtro' : 'Nenhuma divergência neste filtro' }}</h4><p v-if="excludedEntryCount">{{ excludedEntryCount }} item(ns) fora das compras interestaduais para o Paraná ficaram fora do cálculo. Consulte os dados nas notas.</p><p v-else>Consulte os resultados e a memória dos itens nas notas.</p></div><button class="button secondary" @click="showDocuments()">Ver notas e itens</button></article>
        <details class="card registration-pendencies"><summary><span>Pendências cadastrais <span class="badge badge-neutral">{{ pendingItems.length }}</span></span><span class="muted">Perfis e vínculos de produtos</span></summary><div class="registration-body"><p class="muted">Os vínculos cadastrais são conferidos separadamente das respostas fiscais do cálculo. <RouterLink to="/perfis">Gerenciar perfis fiscais</RouterLink>.</p><p v-if="!pendingItems.length" class="empty-state">Nenhum item com classificação cadastral pendente.</p><div v-else class="item-pendency-grid"><article v-for="{ document, item } in pendingItems" :key="itemKey(document, item)" class="item-pendency-card"><div class="item-pendency-context"><strong>NF-e {{ document.number }} · Item {{ item.itemNumber }}</strong><span>{{ item.description || item.supplierProductCode || 'Produto sem descrição' }}</span></div><ItemClassificationDetails :item="item" expanded /><RuleAssessmentDetails :assessment="item.ruleAssessment" :original-assessment="item.originalRuleAssessment" /><button class="text-button" @click="showItem(document, item)">Conferir item na nota</button></article></div></div></details>
      </section>

      <section v-show="activePanel === 'files'" class="panel-stack" aria-label="Arquivos e eventos">
        <div class="section-heading"><div><h3>Arquivos e integridade</h3><p>Confira o que foi recebido, as repetições e os diagnósticos da importação.</p></div><span class="badge badge-neutral">{{ detail.occurrences.length }} ocorrências</span></div>
        <div class="card table-wrap audit-table"><table><thead><tr><th>Arquivo</th><th>Tipo</th><th>Ingestão</th><th>Repetição</th><th>Conflito</th></tr></thead><tbody><tr v-for="occurrence in detail.occurrences" :key="occurrence.id"><td :title="occurrence.contentHash">{{ occurrence.relativePath }}</td><td>{{ occurrence.kind }}</td><td>{{ ingestionLabel(occurrence.ingestionStatus) }}</td><td>{{ ingestionLabel(occurrence.repetition) }}</td><td>{{ ingestionLabel(occurrence.contentConflict) }}</td></tr></tbody></table><p v-if="!detail.occurrences.length" class="empty-state">Nenhuma ocorrência registrada.</p></div>
        <section class="card audit-section"><div class="audit-section-heading"><div><h3>Protocolos e eventos</h3><p>Inclui eventos relacionados de outros lotes e decisões documentais.</p><RouterLink class="text-button" :to="{ path: '/revisao-documental', query: { batchId: detail.batch.id } }">Abrir revisão documental</RouterLink></div><span class="badge badge-neutral">{{ detail.artifacts.length }}</span></div><div v-if="detail.artifacts.length" class="table-wrap audit-table"><table><thead><tr><th>Tipo</th><th>Chave de acesso</th><th>Evento</th><th>Protocolo</th><th>Status SEFAZ</th><th>Associação</th></tr></thead><tbody><tr v-for="artifact in detail.artifacts" :key="artifact.id"><td>{{ artifact.kind === 'PROTOCOL' ? 'Protocolo' : 'Evento' }}<small>{{ artifact.envelope }} v{{ artifact.version }}</small><small v-if="artifact.sourceBatchId !== detail.batch.id">Origem: {{ artifact.sourceBatchName }}</small></td><td class="monospace">{{ artifact.accessKey }}</td><td>{{ artifact.eventType || '—' }}{{ artifact.sequence ? ' nº ' + artifact.sequence : '' }}</td><td>{{ artifact.protocolNumber || '—' }}</td><td>{{ artifact.statusCode || '—' }}<small>{{ artifact.statusReason || '' }}</small></td><td>{{ artifact.association === 'ASSOCIATED' ? 'Associado' : artifact.association === 'ORPHAN' ? 'Órfão' : 'Nota ambígua' }}<small v-if="artifact.responseMatches === false">Retorno divergente</small></td></tr></tbody></table></div><p v-else class="empty-state">Nenhum protocolo ou evento registrado.</p></section>
        <section class="card audit-section"><div class="audit-section-heading"><div><h3>Diagnósticos de ingestão</h3><p>Mensagens preservadas durante a leitura dos arquivos.</p></div><span class="badge badge-neutral">{{ detail.diagnostics.length }}</span></div><ul v-if="detail.diagnostics.length" class="diagnostic-list"><li v-for="diagnostic in detail.diagnostics" :key="diagnostic.id"><span class="diagnostic-marker" aria-hidden="true">i</span><div><strong>{{ diagnostic.code }}</strong><small>{{ diagnostic.source }}</small><p>{{ diagnostic.message }}</p></div></li></ul><p v-else class="empty-state">Nenhum diagnóstico de ingestão registrado.</p></section>
      </section>
    </template>
  </section>
</template>

<style scoped>
.batch-detail { color: #243650; }
.breadcrumb { display: flex; align-items: center; gap: 10px; margin-bottom: 26px; color: #8290a5; font-size: 12px; }
.breadcrumb a { color: #526788; text-decoration: none; }
.breadcrumb a:hover { color: #455fdb; }
.batch-header { display: flex; justify-content: space-between; align-items: center; gap: 24px; margin-bottom: 26px; }
.header-title { min-width: 0; }
.header-tags { display: flex; gap: 9px; align-items: center; flex-wrap: wrap; }
.batch-header h2 { margin: 13px 0 9px; font-size: clamp(24px, 2.5vw, 34px); color: #15243d; font-weight: 750; letter-spacing: -.035em; overflow-wrap: anywhere; }
.batch-header p { margin: 0; color: #718198; font-size: 13px; line-height: 1.6; }
.header-actions { display: grid; flex: none; justify-items: end; gap: 9px; }
.header-actions small { font-size: 10px; color: #8090a6; }
.header-actions svg, .search-field svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.header-actions .button { gap: 9px; }
.badge { display: inline-flex; align-items: center; gap: 6px; flex: none; padding: 5px 9px; border-radius: 6px; font-size: 10px; line-height: 1.4; font-weight: 700; }
.badge-neutral { color: #60718a; background: #f0f3f8; }
.badge-blue { color: #4266af; background: #edf3ff; }
.badge-green { color: #278367; background: #e9f6f0; }
.badge-amber { color: #946c20; background: #fff5df; }
.badge-rose { color: #bd5360; background: #fff0f2; }
.batch-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 28px; }
.metric { padding: 19px 20px; text-align: left; font-family: inherit; cursor: pointer; transition: border-color .15s, box-shadow .15s; }
.metric:hover { border-color: #bbcafa; box-shadow: 0 8px 22px #2439520c; }
.metric:focus-visible, .detail-navigation button:focus-visible, .text-button:focus-visible { outline: 3px solid #455fdb50; outline-offset: 3px; }
.metric-caption { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11px; color: #6b7d96; }
.metric-symbol { display: grid; place-items: center; width: 27px; height: 27px; border-radius: 8px; background: #eef2fd; color: #6580d6; font-size: 17px; }
.metric-symbol.green { color: #398f73; background: #eaf5f0; }
.metric-symbol.amber { color: #b48b3c; background: #fff7e8; }
.metric-symbol.rose { color: #be6a79; background: #fff0f3; }
.metric strong { display: block; margin: 14px 0 8px; color: #22344e; font-size: 29px; font-weight: 750; letter-spacing: -.04em; font-variant-numeric: tabular-nums; }
.metric-denominator { color: #a0adbd; font-size: 16px; font-weight: 500; }
.metric small { color: #687a92; font-size: 10px; }
.detail-navigation { display: flex; gap: 26px; margin-bottom: 26px; border-bottom: 1px solid #dfe6f0; overflow-x: auto; }
.detail-navigation button { display: flex; align-items: center; gap: 8px; flex: none; padding: 0 1px 15px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: #78889e; font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
.detail-navigation button.active { color: #455fdb; border-bottom-color: #455fdb; }
.detail-navigation button span { padding: 2px 6px; border-radius: 5px; background: #eef1f6; font-size: 10px; }
.detail-navigation button.active span { background: #eaf0ff; }
.panel-stack { display: grid; gap: 22px; }
.section-kicker { display: block; margin-bottom: 8px; color: #64758d; font-size: 10px; text-transform: uppercase; letter-spacing: .09em; font-weight: 700; }
.section-heading { display: flex; justify-content: space-between; align-items: start; gap: 20px; }
.section-heading h3, .analysis-progress h3, .audit-section-heading h3 { margin: 0 0 8px; color: #263955; font-size: 18px; font-weight: 700; letter-spacing: -.025em; }
.section-heading p, .analysis-progress p, .audit-section-heading p { margin: 0; color: #64768f; font-size: 12px; line-height: 1.65; }
.analysis-progress { display: flex; align-items: center; gap: 32px; padding: 25px 28px; }
.progress-copy { flex: 1; min-width: 0; }
.analysis-progress .button { gap: 14px; flex: none; }
.progress-track { height: 5px; margin-top: 18px; background: #edf1f8; border-radius: 10px; overflow: hidden; }
.progress-track span { display: block; height: 100%; border-radius: inherit; background: #6580ea; transition: width .2s; }
.reassessment-panel { display: grid; gap: 20px; padding: 26px 28px; }
.reassessment-controls { display: flex; align-items: end; gap: 14px; }
.reassessment-controls label { display: grid; gap: 8px; flex: 1; color: #6b7b92; font-size: 12px; }
.reassessment-controls select { max-width: 100%; }
.muted { color: #7c8ba0; font-size: 12px; line-height: 1.6; margin: 0; }
.inline-notice { margin: 0; padding: 13px 16px; border: 1px solid #f0dfb6; border-radius: 8px; color: #8a6b35; background: #fffbf2; font-size: 12px; line-height: 1.6; }
.batch-identity { padding: 18px 24px; color: #718199; font-size: 12px; }
.batch-identity summary { font-weight: 600; }
.batch-identity dl { display: flex; gap: 24px; flex-wrap: wrap; margin-bottom: 0; }
.batch-identity dt, .document-data dt { color: #687990; font-size: 10px; font-weight: 600; }
.batch-identity dd { margin: 7px 0 0; }
.monospace { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 11px; overflow-wrap: anywhere; }
.document-toolbar { display: flex; align-items: center; padding: 15px 18px; gap: 18px; }
.search-field { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; color: #94a2b7; }
.search-field input { min-width: 0; border: 0; background: transparent; font-size: 13px; }
.search-field input:focus { outline: 2px solid #455fdb35; }
.search-field svg { flex: none; }
.filter-field { display: flex; align-items: center; gap: 10px; color: #8997ab; font-size: 11px; }
.filter-field select { width: 235px; min-height: 38px; padding: 8px 10px; font-size: 12px; background: #fafbfd; }
.document-card { overflow: hidden; border-color: #dfe6ef; border-radius: 13px; box-shadow: 0 3px 14px #233a5f04; }
.document-heading { display: flex; align-items: center; gap: 13px; padding: 17px 20px; list-style: none; cursor: pointer; }
.document-heading::-webkit-details-marker, .item-analysis > summary::-webkit-details-marker, .document-identification > summary::-webkit-details-marker { display: none; }
.document-icon { display: grid; place-items: center; flex: none; width: 35px; height: 40px; border-radius: 9px; background: #eef2fc; color: #7b94c4; font-size: 20px; }
.document-title { flex: 1; min-width: 0; }
.document-title strong { display: block; color: #3f5a7d; font-size: 14px; font-weight: 650; }
.document-title strong span { margin-left: 10px; color: #93a2b7; font-size: 11px; font-weight: 400; }
.document-title small { display: block; margin-top: 5px; color: #798da8; font-size: 11px; overflow-wrap: anywhere; }
.document-counts { display: flex; gap: 15px; margin-right: 5px; color: #798da8; font-size: 11px; white-space: nowrap; }
.document-heading > .badge { font-weight: 500; }
.document-chevron { display: inline-block; color: #98a9c0; font-size: 15px; transition: transform .15s; }
.document-card[open] > summary .document-chevron { transform: rotate(180deg); }
.document-body { padding: 16px 20px 20px; border-top: 1px solid #e8edf4; background: #fbfcfe; }
.document-context { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; color: #7b8da7; font-size: 10px; line-height: 1.5; }
.document-body > .inline-notice { margin-bottom: 12px; }
.document-identification { margin-top: 15px; border-top: 1px solid #e6ecf4; }
.document-identification > summary { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 13px 0 0; list-style: none; cursor: pointer; color: #768da9; font-size: 11px; }
.document-identification > summary > span { color: #9eacc0; transition: transform .15s; }
.document-identification[open] > summary > span { transform: rotate(180deg); }
.document-data { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; margin: 20px 0 0; }
.document-data dd { margin: 6px 0 0; color: #576b88; font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.access-key { grid-column: 1 / -1; padding: 12px 14px; border-radius: 8px; background: #f3f6fb; }
.document-products { display: grid; gap: 12px; }
.fiscal-item { border: 1px solid #e2e8f1; border-radius: 10px; scroll-margin-top: 24px; overflow: hidden; background: #fff; min-width: 0; }
.fiscal-item.item-focused { border-color: #97a9ef; box-shadow: 0 0 0 3px #6580ea15; }
.item-heading { display: flex; align-items: center; gap: 10px; padding: 15px 17px 13px; }
.item-number { display: grid; place-items: center; flex: none; width: 25px; height: 25px; border-radius: 7px; background: #f2f5fa; color: #8a9ebd; font-size: 11px; }
.item-heading > div { flex: 1; min-width: 0; }
.item-heading h4 { margin: 0; color: #496382; font-size: 13px; font-weight: 600; line-height: 1.45; overflow-wrap: anywhere; }
.item-heading p { margin: 4px 0 0; color: #8192aa; font-size: 10px; line-height: 1.5; overflow-wrap: anywhere; }
.item-heading > .badge { font-size: 9px; font-weight: 500; padding: 5px 7px; }
.item-values { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0; margin: 0 17px 14px; padding: 13px 0 0; border-top: 1px solid #edf1f7; }
.item-values > div { min-width: 0; padding: 0 14px; border-right: 1px solid #e8edf4; }
.item-values > div:first-child { padding-left: 0; }
.item-values > div:last-child { padding-right: 0; border-right: 0; }
.item-values span { display: block; color: #7e91ab; font-size: 10px; }
.item-values strong { display: block; margin-top: 7px; color: #5c7598; font-size: 16px; font-weight: 600; letter-spacing: -.03em; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.item-values .value-calculated strong { color: #586fb7; }
.item-values .amount-divergent strong { color: #a9782b; }
.item-additional-values { display: flex; flex-wrap: wrap; gap: 8px 22px; margin: 0 17px 14px; padding-top: 11px; border-top: 1px solid #edf1f7; color: #8295ae; font-size: 10px; line-height: 1.5; }
.item-additional-values b { margin-left: 6px; color: #637d9f; font-size: 11px; font-weight: 500; font-variant-numeric: tabular-nums; }
.item-analysis > summary { display: flex; align-items: center; justify-content: space-between; gap: 15px; padding: 10px 17px; border-top: 1px solid #edf1f6; color: #748aa8; background: #fcfdff; font-size: 10px; font-weight: 400; list-style: none; cursor: pointer; }
.item-analysis > summary:hover { background: #f6f9fe; color: #607bb7; }
.item-analysis > summary span { color: #9aabc2; }
.analysis-toggle { display: inline-block; transition: transform .15s; }
.analysis-toggle::before { content: '⌄'; font-size: 13px; }
.item-analysis[open] > summary .analysis-toggle { transform: rotate(180deg); }
.document-heading:focus-visible, .item-analysis > summary:focus-visible, .document-identification > summary:focus-visible { outline: 2px solid #5973db; outline-offset: -3px; }
.item-analysis-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; padding: 20px; border-top: 1px solid #ecf1f8; }
.item-analysis-block { min-width: 0; }
.item-analysis-block h5 { margin: 0 0 7px; font-size: 12px; color: #49617f; }
.catalog-inline-action { display: flex; align-items: end; gap: 8px; flex-wrap: wrap; margin-top: 18px; }
.catalog-inline-action label { display: grid; gap: 7px; flex: 1 1 160px; min-width: 0; font-size: 11px; color: #8393a9; }
.catalog-inline-action select { min-width: 0; font-size: 12px; }
.pending-workspace { padding: 26px 28px; background: #fff; }
.pending-context { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 8px; padding-bottom: 22px; border-bottom: 1px solid #e4eaf3; }
.pending-context h4 { margin: 0 0 8px; font-size: 16px; color: #354966; }
.pending-context p { margin: 6px 0 0; color: #52647f; font-size: 13px; }
.pending-context .review-product-name { color: #2d4363; font-size: 15px; font-weight: 600; }
.review-navigation { display: grid; gap: 12px; width: 310px; flex: none; justify-items: start; }
.review-navigation label { display: grid; gap: 6px; width: 100%; color: #52647f; font-size: 12px; }
.review-navigation select { font-size: 12px; min-width: 0; }
@media (max-width: 800px) { .pending-context { flex-direction: column; } .review-navigation { width: 100%; } }
.text-button { padding: 0; border: 0; background: transparent; color: #5572bd; font: inherit; font-size: 12px; cursor: pointer; }
.pending-actions { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-top: 22px; border-top: 1px solid #edf1f7; padding-top: 18px; }
.pending-actions > span { color: #94a1b3; font-size: 11px; }
.pending-actions > div { display: flex; gap: 8px; }
.complete-state { display: flex; gap: 18px; align-items: center; padding: 28px; }
.complete-state > span { display: grid; place-items: center; flex: none; width: 44px; height: 44px; color: #58977d; background: #edf8f2; border-radius: 50%; font-size: 24px; }
.complete-state > div { flex: 1; }
.complete-state h4 { margin: 0 0 8px; font-size: 15px; }
.complete-state p { margin: 0; color: #8493a9; font-size: 12px; line-height: 1.6; }
.registration-pendencies > summary { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 22px 26px; color: #596f91; font-size: 13px; font-weight: 600; }
.registration-pendencies summary .badge { margin-left: 8px; }
.registration-body { padding: 0 26px 26px; }
.registration-body > p { margin-bottom: 20px; }
.item-pendency-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.item-pendency-card { padding: 18px; border: 1px solid #e8edf5; border-radius: 9px; }
.item-pendency-context { display: grid; gap: 6px; margin: 0 0 14px; color: #71839d; font-size: 11px; }
.item-pendency-context span { color: #94a1b4; }
.item-pendency-card .text-button { margin-top: 18px; }
.audit-section { overflow: hidden; }
.audit-section-heading { display: flex; justify-content: space-between; align-items: start; gap: 16px; padding: 24px; }
.audit-table th { padding: 14px 20px; font-size: 10px; font-weight: 600; letter-spacing: .03em; }
.audit-table td { padding: 16px 20px; color: #7386a2; font-size: 12px; white-space: normal; overflow-wrap: anywhere; min-width: 125px; vertical-align: top; }
.audit-table td:first-child { min-width: 170px; }
.audit-table td small { display: block; margin-top: 5px; color: #9aa8bb; font-size: 10px; }
.audit-section .empty-state { margin: 0 24px 24px; }
.diagnostic-list { list-style: none; margin: 0; padding: 0 24px; }
.diagnostic-list li { display: flex; gap: 14px; padding: 18px 0; border-top: 1px solid #edf1f7; }
.diagnostic-marker { display: grid; place-items: center; flex: none; width: 22px; height: 22px; color: #7793bd; border: 1px solid #d6e1f2; border-radius: 50%; font-size: 11px; }
.diagnostic-list li > div { min-width: 0; }
.diagnostic-list strong { color: #627b9d; font-size: 11px; overflow-wrap: anywhere; }
.diagnostic-list small { display: block; margin-top: 6px; color: #9aa8ba; font-size: 10px; }
.diagnostic-list p { color: #7e90a8; font-size: 12px; line-height: 1.6; margin: 10px 0 0; }
.empty-panel { text-align: center; padding: 40px 24px; }
.empty-panel h4 { font-size: 16px; margin: 0 0 10px; }
.empty-panel p { font-size: 13px; color: #8a9ab0; margin: 0 0 22px; }
.loading-card { display: flex; gap: 12px; align-items: center; padding: 32px; color: #8191a7; font-size: 13px; }
.loading-dot { width: 9px; height: 9px; border-radius: 50%; background: #7188db; }
.consolidation-area :deep(.section-stack) { display: grid; gap: 18px; }
.consolidation-area :deep(h2) { font-size: 19px; color: #2b405f; letter-spacing: -.025em; margin: 0; }
.consolidation-area :deep(p) { color: #7c8da4; font-size: 12px; line-height: 1.65; margin: 0; }
.consolidation-area :deep(.section-stack > div.card) { display: flex; align-items: center; gap: 24px; padding: 18px 24px; box-shadow: none; }
.consolidation-area :deep(label) { display: flex; align-items: center; gap: 14px; color: #687a92; font-size: 11px; flex: 1; min-width: 0; white-space: nowrap; }
.consolidation-area :deep(select) { min-height: 38px; font-size: 12px; max-width: 100%; min-width: 0; }
.consolidation-area :deep(article.card) { display: grid; gap: 16px; padding: 24px; box-shadow: none; }
.consolidation-area :deep(h3) { color: #4d668a; font-size: 14px; margin: 0; }
.consolidation-area :deep(th) { font-size: 10px; font-weight: 600; }
.consolidation-area :deep(td) { color: #526c91; font-size: 14px; font-weight: 700; }
.consolidation-area :deep(details.card) { padding: 18px 24px; color: #7389a8; font-size: 12px; box-shadow: none; }
.consolidation-area :deep(details li) { margin-bottom: 16px; overflow-wrap: anywhere; line-height: 1.7; }
.batch-detail :deep(.calculation-memory summary), .batch-detail :deep(.rule-assessment summary), .batch-detail :deep(.fiscal-questions summary) { color: #667ea3; font-size: 12px; }
.batch-detail :deep(.calculation-body), .batch-detail :deep(.rule-assessment-body), .batch-detail :deep(.questions-body) { border-color: #e3eaf6; background: #f8faff; padding: 16px; font-size: 12px; }
.batch-detail :deep(.questions-body form) { display: grid; gap: 4px; }
.batch-detail :deep(.questions-body select) { min-width: 0; font-size: 12px; min-height: 42px; padding: 9px 12px; }
.batch-detail :deep(.questions-body label) { color: #5d7293; font-weight: 500; line-height: 1.5; }
.batch-detail :deep(.questions-body p) { color: #7d8ea6; font-size: 12px; line-height: 1.65; }
.batch-detail :deep(.questions-body p.form-error) { color: #8d241d; }
.batch-detail :deep(.questions-body p.form-success) { color: #1c6549; }
@media (max-width: 1150px) { .metric { padding: 16px; } .metric-caption { font-size: 10px; } .filter-field > span { display: none; } }
@media (max-width: 1100px) { .batch-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 900px) { .batch-header { align-items: start; } .batch-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } .item-analysis-grid { grid-template-columns: 1fr; } }
@media (max-width: 650px) {
  .batch-header, .analysis-progress, .pending-context, .pending-actions, .complete-state { flex-direction: column; align-items: stretch; }
  .header-actions { justify-items: start; }
  .batch-metrics { gap: 10px; } .metric strong { font-size: 26px; } .metric small { font-size: 9px; }
  .detail-navigation { gap: 20px; }
  .section-heading { flex-wrap: wrap; }
  .document-toolbar { flex-direction: column; align-items: stretch; gap: 8px; }
  .filter-field select { width: 100%; }
  .document-heading { padding: 14px; gap: 9px; flex-wrap: wrap; }
  .document-title { min-width: 140px; } .document-title strong { font-size: 12px; } .document-title small { font-size: 10px; } .document-heading > .badge { margin-left: 44px; } .document-counts { display: none; }
  .document-body { padding: 14px; } .document-data { grid-template-columns: 1fr; } .document-context { font-size: 9px; }
  .item-heading { flex-wrap: wrap; padding: 13px; gap: 8px; } .item-heading > div { flex-basis: calc(100% - 42px); } .item-heading > .badge { margin-left: 33px; } .item-heading > .badge + .badge { margin-left: 0; }
  .item-values { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 15px 0; margin: 0 13px 12px; } .item-values > div:nth-child(2) { padding-right: 0; border-right: 0; } .item-values > div:nth-child(3) { padding-left: 0; } .item-values strong { font-size: 15px; } .item-analysis > summary { padding: 10px 13px; } .item-additional-values { margin-inline: 13px; }
  .item-pendency-grid { grid-template-columns: 1fr; }
  .pending-workspace, .reassessment-panel, .analysis-progress { padding: 22px; }
  .reassessment-controls { flex-direction: column; align-items: stretch; }
  .registration-pendencies > summary { flex-wrap: wrap; }
  .consolidation-area :deep(.section-stack > div.card) { flex-direction: column; align-items: stretch; gap: 12px; }
}
@media (max-width: 1150px) { .document-counts { gap: 10px; font-size: 10px; } }
@media (prefers-reduced-motion: reduce) { .document-chevron, .analysis-toggle, .document-identification > summary > span { transition: none; } }
.review-controls { padding: 22px 24px; }
.review-tabs { display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 22px; }
.review-tabs button { display: flex; align-items: center; gap: 12px; min-height: 48px; padding: 12px 18px; border: 1px solid #dce3ef; border-radius: 10px; background: #f8fafd; color: #52647f; cursor: pointer; font: inherit; font-size: 13px; }
.review-tabs button.active { border-color: #455fdb; background: #eef3ff; color: #304ab6; font-weight: 650; }
.review-tabs span { padding: 3px 8px; border-radius: 6px; background: #e2e9f7; font-variant-numeric: tabular-nums; }
.review-reason-filter { display: grid; gap: 9px; color: #52647f; font-size: 13px; }
.review-reason-filter select { width: 100%; min-width: 0; }
.review-controls > p { margin: 16px 0 0; font-size: 13px; color: #52647f; line-height: 1.65; }
.exception-context { margin: 22px 0 26px; padding: 18px 20px; border: 1px solid #dce5f3; border-radius: 12px; background: #f5f8fd; }
.exception-context strong { font-size: 14px; color: #2d4363; }
.exception-context p { margin: 9px 0 16px; color: #52647f; line-height: 1.65; font-size: 13px; }
.exception-facts { margin-top: 14px; display: flex; flex-wrap: wrap; gap: 10px; }
.exception-facts span { padding: 5px 9px; background: #fff; border: 1px solid #e1e7f0; border-radius: 6px; font-size: 11px; }
.pending-context > div:first-child { min-width: 0; }
.review-navigation { width: min(330px, 42%); }
@media (max-width: 800px) { .review-navigation { width: 100%; } .review-tabs button { width: 100%; justify-content: space-between; } }
.review-navigation select, .review-reason-filter select { appearance: auto; padding-right: 28px; cursor: pointer; }
</style>
