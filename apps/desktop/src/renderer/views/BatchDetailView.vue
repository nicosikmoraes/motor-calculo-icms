<script setup lang="ts">
import { RendererErrorMessage } from '../error-messages'
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
const saving = ref(false)
const exporting = ref(false)
const reassessing = ref(false)
const selectedRunId = ref('')
const profilesByCompany = ref<Record<string, readonly FiscalProfileSummary[]>>({})
const selectedProfiles = ref<Record<string, string>>({})
type DetailPanel = 'overview' | 'documents' | 'pending' | 'files'
const activePanel = ref<DetailPanel>('overview')
const search = ref('')
const documentFilter = ref('all')
const focusedItem = ref('')
const openDocuments = ref(new Set<string>())
const fiscalIndex = ref(0)
const fiscalPendingItems = computed(() => detail.value?.documents.flatMap(document => document.items
  .filter(item => ['PENDING_DATA', 'PENDING_RULE'].includes(item.calculation.status))
  .map(item => ({ document, item }))) ?? [])
const currentFiscalItem = computed(() => fiscalPendingItems.value[Math.min(fiscalIndex.value, Math.max(0, fiscalPendingItems.value.length - 1))])
const calculatedCount = computed(() => detail.value?.documents.flatMap(document => document.items)
  .filter(item => item.calculation.status === 'CALCULATED').length ?? 0)
const unsupportedCount = computed(() => detail.value?.documents.flatMap(document => document.items)
  .filter(item => item.calculation.status === 'UNSUPPORTED').length ?? 0)
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

async function exportExcel(): Promise<void> {
  if (!detail.value || exporting.value) return
  exporting.value = true; error.value = ''; notice.value = ''
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
  return ({ CALCULATED: 'Calculado', PENDING_DATA: 'Dados pendentes', PENDING_RULE: 'Regra pendente', UNSUPPORTED: 'Fora do escopo' })[item.calculation.status]
}
function isDivergent(item: FiscalItemSummary): boolean {
  return Boolean(item.calculation.comparisons?.some(c => c.status === 'DIFFERENT'))
}
function documentCalculated(document: FiscalDocumentSummary): number {
  return document.items.filter(i => i.calculation.status === 'CALCULATED').length
}
function ingestionLabel(value: string): string {
  return ({ RECEBIDO: 'Recebido', VALIDANDO: 'Validando', PROCESSANDO: 'Processando', CONCLUIDO: 'Concluído', PROCESSADO: 'Processado',
    PROCESSADA: 'Processada', PENDENTE: 'Pendente', INTERROMPIDO: 'Interrompido', CANCELADO: 'Cancelado', ERRO: 'Erro',
    ORIGINAL: 'Original', REPETIDA: 'Repetida', SEM_CONFLITO: 'Sem conflito', CONFLITO_CONTEUDO: 'Conteúdo conflitante' } as Record<string, string>)[value] ?? value
}
const divergentCount = computed(() => detail.value?.documents.flatMap(d => d.items).filter(isDivergent).length ?? 0)
const calculatedPercent = computed(() => itemCount.value ? Math.round(calculatedCount.value / itemCount.value * 100) : 0)
const visibleDocuments = computed(() => {
  const query = search.value.trim().toLocaleLowerCase('pt-BR')
  return detail.value?.documents.filter(document => {
    const matchesSearch = !query || [document.number, document.series, document.accessKey, document.companyName, document.issuerName,
      document.recipientName, ...document.items.flatMap(i => [i.description, i.supplierProductCode, i.ncm, i.cfop])]
      .some(value => value?.toLocaleLowerCase('pt-BR').includes(query))
    const matchesFilter = documentFilter.value === 'all'
      || (documentFilter.value === 'calculated' && document.items.some(i => i.calculation.status === 'CALCULATED'))
      || (documentFilter.value === 'pending' && document.items.some(i => ['PENDING_DATA', 'PENDING_RULE'].includes(i.calculation.status)))
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
  try { await loadDetail(); await revealHash() }
  catch (cause) { error.value = cause instanceof Error ? cause.message : RendererErrorMessage.BATCH_LOAD }
}
onMounted(initialize)
watch(() => route.hash, revealHash)
watch(() => route.query.painel, revealHash)
watch(() => route.params.id, () => {
  detail.value = null; selectedRunId.value = ''; activePanel.value = 'overview'; fiscalIndex.value = 0
  focusedItem.value = ''; openDocuments.value.clear(); search.value = ''; documentFilter.value = 'all'
  void initialize()
})
</script>

<template>
  <section class="batch-detail">
    <nav class="breadcrumb" aria-label="Localização"><RouterLink to="/lotes">Histórico</RouterLink><span aria-hidden="true">/</span><span>Detalhe do lote</span></nav>
    <p v-if="error" class="form-error notice" role="alert">{{ error }}</p>
    <p v-if="notice" class="form-success notice" role="status">{{ notice }}</p>
    <div v-if="!detail" class="card loading-card" role="status"><span class="loading-dot" aria-hidden="true"></span>{{ error ? 'O lote não pôde ser carregado.' : 'Carregando os dados do lote…' }}<button v-if="error" class="button secondary" @click="initialize">Tentar novamente</button></div>
    <template v-if="detail">
      <header class="batch-header">
        <div class="header-title"><div class="header-tags"><span class="eyebrow">Conferência do lote</span><span class="badge badge-neutral">{{ ingestionLabel(detail.batch.status) }}</span><span class="badge" :class="detail.batch.environmentCode === '2' ? 'badge-amber' : 'badge-blue'">{{ environment(detail.batch.environmentCode) }}</span></div>
          <h2>{{ detail.batch.originalName || 'Lote fiscal' }}</h2>
          <p>{{ detail.batch.companyName || 'Empresa não informada' }}<span aria-hidden="true"> · </span>Importado em {{ dateTime(detail.batch.receivedAt) }}</p>
        </div>
        <div class="header-actions"><button class="button primary" type="button" :disabled="exporting || saving || reassessing" @click="exportExcel"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 16v5h14v-5" /></svg>{{ exporting ? 'Exportando…' : 'Exportar Excel' }}</button><small>Todas as empresas e meses deste lote</small></div>
      </header>

      <div class="batch-metrics" aria-label="Situação dos itens">
        <button class="card metric" @click="showDocuments()"><span class="metric-caption">Documentos fiscais<span class="metric-symbol" aria-hidden="true">▤</span></span><strong>{{ detail.batch.totalDocuments }}</strong><small>{{ itemCount }} itens neste lote</small></button>
        <button class="card metric" @click="showDocuments('calculated')"><span class="metric-caption">Itens calculados<span class="metric-symbol green" aria-hidden="true">✓</span></span><strong>{{ calculatedCount }}<span class="metric-denominator"> / {{ itemCount }}</span></strong><small>{{ calculatedPercent }}% dos itens com cálculo salvo</small></button>
        <button class="card metric" @click="activePanel = 'pending'"><span class="metric-caption">Dados fiscais pendentes<span class="metric-symbol amber" aria-hidden="true">!</span></span><strong>{{ fiscalPendingItems.length }}</strong><small>{{ unsupportedCount }} itens fora do escopo</small></button>
        <button class="card metric" @click="showDocuments('divergent')"><span class="metric-caption">Itens com divergência<span class="metric-symbol rose" aria-hidden="true">≠</span></span><strong>{{ divergentCount }}</strong><small>Base ou ICMS acima da tolerância</small></button>
      </div>

      <nav class="detail-navigation" aria-label="Áreas do lote">
        <button :aria-pressed="activePanel === 'overview'" :class="{ active: activePanel === 'overview' }" @click="activePanel = 'overview'">Resumo</button>
        <button :aria-pressed="activePanel === 'documents'" :class="{ active: activePanel === 'documents' }" @click="activePanel = 'documents'">Notas e itens <span>{{ detail.documents.length }}</span></button>
        <button :aria-pressed="activePanel === 'pending'" :class="{ active: activePanel === 'pending' }" @click="activePanel = 'pending'">Pendências <span>{{ fiscalPendingItems.length }}</span></button>
        <button :aria-pressed="activePanel === 'files'" :class="{ active: activePanel === 'files' }" @click="activePanel = 'files'">Arquivos e eventos</button>
      </nav>

      <section v-show="activePanel === 'overview'" class="panel-stack" aria-label="Resumo do lote">
        <article class="card analysis-progress">
          <div class="progress-copy"><span class="section-kicker">Andamento da análise</span><h3>{{ fiscalPendingItems.length ? 'Continue a conferência dos itens' : calculatedCount ? 'Confira os resultados salvos' : 'Consulte a situação dos documentos' }}</h3>
            <p>{{ calculatedCount }} itens calculados, {{ fiscalPendingItems.length }} com dados pendentes e {{ unsupportedCount }} fora do escopo. A conferência usa os últimos resultados salvos.</p>
            <div class="progress-track" role="progressbar" aria-label="Itens com cálculo salvo" :aria-valuenow="calculatedCount" :aria-valuemax="Math.max(itemCount, 1)" aria-valuemin="0"><span :style="{ width: `${calculatedPercent}%` }"></span></div>
          </div>
          <button v-if="fiscalPendingItems.length" class="button secondary" @click="activePanel = 'pending'">Resolver dados fiscais <span aria-hidden="true">→</span></button>
          <button v-else class="button secondary" @click="showDocuments()">Ver notas e itens <span aria-hidden="true">→</span></button>
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
        <div class="card document-toolbar"><label class="search-field"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input v-model="search" aria-label="Buscar notas e produtos" placeholder="Buscar por nota, produto, chave ou empresa"></label><label class="filter-field"><span>Situação dos itens</span><select v-model="documentFilter" aria-label="Filtrar documentos por situação"><option value="all">Todos os documentos</option><option value="pending">Com dados fiscais pendentes</option><option value="divergent">Com divergência</option><option value="calculated">Com itens calculados</option></select></label></div>
        <details v-for="document in visibleDocuments" :key="document.id" :id="`nota-${document.id}`" class="card document-card" :open="openDocuments.has(document.id)" @toggle="($event.target as HTMLDetailsElement).open ? openDocuments.add(document.id) : openDocuments.delete(document.id)">
          <summary class="document-heading"><span class="document-icon" aria-hidden="true">▤</span><div class="document-title"><strong>NF-e {{ document.number }} <span>Série {{ document.series }}</span></strong><small>{{ document.companyName || 'Empresa não identificada' }} · {{ document.items.length }} itens · {{ documentCalculated(document) }} calculados</small></div><span class="badge" :class="document.eligibleForProcessing ? 'badge-blue' : 'badge-amber'">{{ document.eligibleForProcessing ? 'Importada para análise' : 'Pendente' }}</span><span class="document-chevron" aria-hidden="true">⌄</span></summary>
          <div class="document-body"><dl class="document-data"><div><dt>Empresa analisada</dt><dd>{{ document.companyName || '—' }}</dd></div><div><dt>Emitente</dt><dd>{{ document.issuerName || document.issuerTaxId || '—' }}</dd></div><div><dt>Destinatário</dt><dd>{{ document.recipientName || document.recipientTaxId || '—' }}</dd></div><div><dt>Emissão e ambiente</dt><dd>{{ dateTime(document.issuedAt) }} · {{ environment(document.environmentCode) }} · Modelo {{ document.model }}</dd></div><div class="access-key"><dt>Chave de acesso</dt><dd class="monospace">{{ document.accessKey }}</dd></div></dl>
            <p v-if="document.pendingReason" class="inline-notice">{{ document.pendingReason }}</p>
            <p v-if="document.conflictResolution" class="inline-notice">{{ document.conflictResolution.reason }} <RouterLink class="text-button" :to="{ path: '/conflitos-notas', query: { key: document.accessKey } }">Comparar versões e decisões</RouterLink></p>
            <p v-if="document.documentaryReason" class="inline-notice">{{ document.documentaryReason }} <RouterLink class="text-button" :to="{ path: '/revisao-documental', query: { key: document.accessKey } }">Revisar eventos</RouterLink></p>
            <p v-else-if="document.documentaryStatus === 'CCE_APPROVED'" class="inline-notice">CC-e revisada: uso do XML original autorizado. <RouterLink class="text-button" :to="{ path: '/revisao-documental', query: { key: document.accessKey } }">Ver decisões</RouterLink></p>
            <article v-for="item in document.items" :key="item.itemNumber" :id="`item-${document.id}-${item.itemNumber}`" class="fiscal-item" :class="{ 'item-focused': focusedItem === `item-${document.id}-${item.itemNumber}` }">
              <div class="item-heading"><span class="item-number">{{ item.itemNumber }}</span><div><h4>{{ item.description || item.supplierProductCode || 'Produto sem descrição' }}</h4><p>{{ item.supplierProductCode ? `Código ${item.supplierProductCode} · ` : '' }}NCM {{ item.ncm || '—' }} · CFOP {{ item.cfop || '—' }}</p></div><span class="badge" :class="item.calculation.status === 'CALCULATED' ? 'badge-green' : item.calculation.status === 'UNSUPPORTED' ? 'badge-neutral' : 'badge-amber'">{{ calculationLabel(item) }}</span><span v-if="isDivergent(item)" class="badge badge-rose">Divergência</span></div>
              <div class="item-values"><div><span>Valor do produto</span><strong>{{ money(item.productAmount) }}</strong></div><div><span>ICMS declarado</span><strong>{{ money(item.declaredIcmsAmount) }}</strong></div><div><span>ICMS calculado</span><strong>{{ money(item.calculation.result?.amount) }}</strong></div><div><span>ICMS diferido</span><strong>{{ money(item.calculation.deferredAmount) }}</strong></div></div>
              <details class="item-analysis" :open="focusedItem === `item-${document.id}-${item.itemNumber}`"><summary>Conferir dados e análise do item <span class="analysis-toggle" aria-hidden="true"></span></summary><div class="item-analysis-grid"><div class="item-analysis-block"><h5>Cálculo da operação</h5><p class="muted">Complete as respostas ou confira a memória do resultado.</p><ItemFiscalQuestions :batch-id="detail.batch.id" :document-id="document.id" :item-number="item.itemNumber" @saved="loadDetail" /><CalculationMemoryDetails :calculation="item.calculation" /></div><div class="item-analysis-block"><h5>Cadastro e enquadramento</h5><p class="muted">Classificação e seleção de regras deste produto.</p><ItemClassificationDetails :item="item" /><RuleAssessmentDetails :assessment="item.ruleAssessment" :original-assessment="item.originalRuleAssessment" /><div v-if="document.companyId && document.issuerTaxId?.length === 14 && item.supplierProductCode && profilesByCompany[document.companyId]?.length" class="catalog-inline-action"><label>Perfil fiscal do produto<select v-model="selectedProfiles[itemKey(document, item)]"><option value="">Escolher perfil</option><option v-for="profile in profilesByCompany[document.companyId]" :key="profile.id" :value="profile.id">{{ profile.name }}</option></select></label><button class="button secondary" type="button" :disabled="saving || !selectedProfiles[itemKey(document, item)]" @click="linkItem(document, item)">Vincular</button></div></div></div></details>
            </article>
          </div>
        </details>
        <div v-if="!visibleDocuments.length" class="card empty-panel"><h4>{{ detail.documents.length ? 'Nenhuma nota corresponde à busca' : 'Nenhum documento normalizado' }}</h4><p>{{ detail.documents.length ? 'Experimente outro termo ou escolha todos os documentos.' : 'Confira os arquivos e diagnósticos para entender a importação.' }}</p><button v-if="detail.documents.length" class="button secondary" @click="showDocuments()">Limpar filtros</button><button v-else class="button secondary" @click="activePanel = 'files'">Ver arquivos e eventos</button></div>
      </section>

      <section v-show="activePanel === 'pending'" class="panel-stack" aria-label="Pendências do lote">
        <div class="section-heading"><div><h3>Dados fiscais para completar</h3><p>Responda por item. As informações salvas ficam vinculadas à execução do cálculo.</p></div><span class="badge badge-amber">{{ fiscalPendingItems.length }} itens pendentes</span></div>
        <article v-if="currentFiscalItem" class="card pending-workspace"><div class="pending-context"><div><span class="section-kicker">Item {{ Math.min(fiscalIndex, fiscalPendingItems.length - 1) + 1 }} de {{ fiscalPendingItems.length }}</span><h4>{{ currentFiscalItem.item.description || currentFiscalItem.item.supplierProductCode || 'Produto sem descrição' }}</h4><p>NF-e {{ currentFiscalItem.document.number }} · Item {{ currentFiscalItem.item.itemNumber }} · {{ currentFiscalItem.document.companyName || 'Empresa não informada' }}</p></div><button class="text-button" @click="showItem(currentFiscalItem.document, currentFiscalItem.item)">Abrir na nota ↗</button></div><ItemFiscalQuestions :key="itemKey(currentFiscalItem.document, currentFiscalItem.item)" :batch-id="detail.batch.id" :document-id="currentFiscalItem.document.id" :item-number="currentFiscalItem.item.itemNumber" expanded @saved="loadDetail" /><div v-if="fiscalPendingItems.length > 1" class="pending-actions"><span>Salve as respostas antes de avançar.</span><div><button class="button secondary" @click="fiscalIndex = (Math.min(fiscalIndex, fiscalPendingItems.length - 1) - 1 + fiscalPendingItems.length) % fiscalPendingItems.length">← Anterior</button><button class="button secondary" @click="fiscalIndex = (Math.min(fiscalIndex, fiscalPendingItems.length - 1) + 1) % fiscalPendingItems.length">Próximo item →</button></div></div></article>
        <article v-else class="card complete-state"><span aria-hidden="true">✓</span><div><h4>Nenhuma pergunta fiscal pendente</h4><p>{{ unsupportedCount ? `${unsupportedCount} itens estão fora do escopo. Consulte seus motivos na análise da nota.` : 'Consulte os resultados e a memória de cada item nas notas.' }}</p></div><button class="button secondary" @click="showDocuments()">Ver notas e itens</button></article>
        <details class="card registration-pendencies"><summary><span>Pendências cadastrais <span class="badge badge-neutral">{{ pendingItems.length }}</span></span><span class="muted">Perfis e vínculos de produtos</span></summary><div class="registration-body"><p class="muted">Os vínculos cadastrais são conferidos separadamente das respostas fiscais do cálculo. <RouterLink to="/perfis">Gerenciar perfis fiscais</RouterLink>.</p><p v-if="!pendingItems.length" class="empty-state">Nenhum item com classificação cadastral pendente.</p><div v-else class="item-pendency-grid"><article v-for="{ document, item } in pendingItems" :key="itemKey(document, item)" class="item-pendency-card"><div class="item-pendency-context"><strong>NF-e {{ document.number }} · Item {{ item.itemNumber }}</strong><span>{{ item.description || item.supplierProductCode || 'Produto sem descrição' }}</span></div><ItemClassificationDetails :item="item" expanded /><RuleAssessmentDetails :assessment="item.ruleAssessment" :original-assessment="item.originalRuleAssessment" /><button class="text-button" @click="showItem(document, item)">Conferir item na nota →</button></article></div></div></details>
      </section>

      <section v-show="activePanel === 'files'" class="panel-stack" aria-label="Arquivos e eventos">
        <div class="section-heading"><div><h3>Arquivos e integridade</h3><p>Confira o que foi recebido, as repetições e os diagnósticos da importação.</p></div><span class="badge badge-neutral">{{ detail.occurrences.length }} ocorrências</span></div>
        <div class="card table-wrap audit-table"><table><thead><tr><th>Arquivo</th><th>Tipo</th><th>Ingestão</th><th>Repetição</th><th>Conflito</th></tr></thead><tbody><tr v-for="occurrence in detail.occurrences" :key="occurrence.id"><td :title="occurrence.contentHash">{{ occurrence.relativePath }}</td><td>{{ occurrence.kind }}</td><td>{{ ingestionLabel(occurrence.ingestionStatus) }}</td><td>{{ ingestionLabel(occurrence.repetition) }}</td><td>{{ ingestionLabel(occurrence.contentConflict) }}</td></tr></tbody></table><p v-if="!detail.occurrences.length" class="empty-state">Nenhuma ocorrência registrada.</p></div>
        <section class="card audit-section"><div class="audit-section-heading"><div><h3>Protocolos e eventos</h3><p>Inclui eventos relacionados de outros lotes e decisões documentais.</p><RouterLink class="text-button" :to="{ path: '/revisao-documental', query: { batchId: detail.batch.id } }">Abrir revisão documental →</RouterLink></div><span class="badge badge-neutral">{{ detail.artifacts.length }}</span></div><div v-if="detail.artifacts.length" class="table-wrap audit-table"><table><thead><tr><th>Tipo</th><th>Chave de acesso</th><th>Evento</th><th>Protocolo</th><th>Status SEFAZ</th><th>Associação</th></tr></thead><tbody><tr v-for="artifact in detail.artifacts" :key="artifact.id"><td>{{ artifact.kind === 'PROTOCOL' ? 'Protocolo' : 'Evento' }}<small>{{ artifact.envelope }} v{{ artifact.version }}</small><small v-if="artifact.sourceBatchId !== detail.batch.id">Origem: {{ artifact.sourceBatchName }}</small></td><td class="monospace">{{ artifact.accessKey }}</td><td>{{ artifact.eventType || '—' }}{{ artifact.sequence ? ' nº ' + artifact.sequence : '' }}</td><td>{{ artifact.protocolNumber || '—' }}</td><td>{{ artifact.statusCode || '—' }}<small>{{ artifact.statusReason || '' }}</small></td><td>{{ artifact.association === 'ASSOCIATED' ? 'Associado' : artifact.association === 'ORPHAN' ? 'Órfão' : 'Nota ambígua' }}<small v-if="artifact.responseMatches === false">Retorno divergente</small></td></tr></tbody></table></div><p v-else class="empty-state">Nenhum protocolo ou evento registrado.</p></section>
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
.document-card { overflow: hidden; }
.document-heading { display: flex; align-items: center; gap: 14px; padding: 22px 24px; list-style: none; cursor: pointer; }
.document-heading::-webkit-details-marker, .item-analysis > summary::-webkit-details-marker { display: none; }
.document-icon { display: grid; place-items: center; flex: none; width: 40px; height: 44px; border-radius: 9px; background: #f0f4fd; color: #6a84c8; font-size: 23px; }
.document-title { flex: 1; min-width: 0; }
.document-title strong { display: block; color: #2a3c58; font-size: 15px; }
.document-title strong span { margin-left: 10px; color: #8c9bb0; font-size: 11px; font-weight: 500; }
.document-title small { display: block; margin-top: 7px; color: #8291a6; font-size: 11px; overflow-wrap: anywhere; }
.document-chevron { color: #95a4b8; font-size: 20px; transition: transform .15s; }
.document-card[open] > summary .document-chevron { transform: rotate(180deg); }
.document-body { padding: 0 24px 24px; border-top: 1px solid #edf1f7; }
.document-data { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; margin: 24px 0; }
.document-data dd { margin: 6px 0 0; color: #576b88; font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.access-key { grid-column: 1 / -1; padding: 12px 14px; border-radius: 8px; background: #f8fafd; }
.fiscal-item { margin-top: 16px; border: 1px solid #e5ebf4; border-radius: 10px; scroll-margin-top: 24px; overflow: hidden; }
.fiscal-item.item-focused { border-color: #97a9ef; box-shadow: 0 0 0 3px #6580ea15; }
.item-heading { display: flex; align-items: center; gap: 12px; padding: 18px 18px 14px; }
.item-number { display: grid; place-items: center; flex: none; width: 28px; height: 28px; border-radius: 7px; background: #f2f5fa; color: #8b9bb1; font-size: 11px; font-weight: 700; }
.item-heading > div { flex: 1; min-width: 0; }
.item-heading h4 { margin: 0; color: #354966; font-size: 13px; font-weight: 700; overflow-wrap: anywhere; }
.item-heading p { margin: 6px 0 0; color: #6c7e97; font-size: 10px; }
.item-values { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 0 18px 16px; }
.item-values > div { padding: 12px 14px; border-radius: 7px; background: #f8fafd; min-width: 0; }
.item-values span { display: block; color: #687a92; font-size: 10px; }
.item-values strong { display: block; margin-top: 7px; color: #496180; font-size: 13px; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.item-analysis > summary { display: flex; justify-content: space-between; padding: 12px 18px; border-top: 1px solid #ecf1f8; color: #667ea3; font-size: 11px; font-weight: 600; list-style: none; }
.item-analysis > summary span { color: #94a6bf; }
.analysis-toggle::before { content: '+'; }
.item-analysis[open] > summary .analysis-toggle::before { content: '−'; }
.item-analysis-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; padding: 20px; border-top: 1px solid #ecf1f8; }
.item-analysis-block { min-width: 0; }
.item-analysis-block h5 { margin: 0 0 7px; font-size: 12px; color: #49617f; }
.catalog-inline-action { display: flex; align-items: end; gap: 8px; flex-wrap: wrap; margin-top: 18px; }
.catalog-inline-action label { display: grid; gap: 7px; flex: 1 1 160px; min-width: 0; font-size: 11px; color: #8393a9; }
.catalog-inline-action select { min-width: 0; font-size: 12px; }
.pending-workspace { padding: 26px 28px; }
.pending-context { display: flex; justify-content: space-between; gap: 18px; margin-bottom: 20px; }
.pending-context h4 { margin: 0 0 8px; font-size: 16px; color: #354966; }
.pending-context p { margin: 0; color: #8a99ae; font-size: 12px; }
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
  .document-heading { padding: 18px; gap: 10px; flex-wrap: wrap; }
  .document-title { min-width: 160px; } .document-heading > .badge { margin-left: 50px; }
  .document-body { padding: 0 16px 16px; } .document-data { grid-template-columns: 1fr; }
  .item-heading { flex-wrap: wrap; } .item-heading > div { flex-basis: calc(100% - 42px); }
  .item-values { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .item-pendency-grid { grid-template-columns: 1fr; }
  .pending-workspace, .reassessment-panel, .analysis-progress { padding: 22px; }
  .reassessment-controls { flex-direction: column; align-items: stretch; }
  .registration-pendencies > summary { flex-wrap: wrap; }
  .consolidation-area :deep(.section-stack > div.card) { flex-direction: column; align-items: stretch; gap: 12px; }
}
</style>
