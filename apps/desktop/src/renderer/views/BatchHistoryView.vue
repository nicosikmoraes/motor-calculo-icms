<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import type { BatchOperationProgress, DashboardBatchSummary, RecoverableImport, WorkspaceState } from '@motor/contracts'
import AppIcon from '../components/AppIcon.vue'
import bannerUrl from '../assets/batch-history-banner.png'
import { desktopErrorMessage, RendererErrorMessage } from '../error-messages'
import { filterHistory, groupHistory, historyMonthLabel, historyStatus, summarizeHistory } from '../batch-history'

const route = useRoute()
const router = useRouter()
const batches = ref<readonly DashboardBatchSummary[]>([])
const workspace = ref<WorkspaceState>({ companies: [] })
const recoveries = ref<readonly RecoverableImport[]>([])
const loading = ref(true)
const loaded = ref(false)
const loadedAt = ref(new Date())
const loadError = ref('')
const operationError = ref('')
const resuming = ref('')
const operationId = ref('')
const progress = ref<BatchOperationProgress>()
let unsubscribe: (() => void) | undefined

function queryFilter(name: string) {
  return computed({
    get: () => typeof route.query[name] === 'string' ? route.query[name] as string : '',
    set: (value: string) => { void router.replace({ query: { ...route.query, [name]: value || undefined } }) },
  })
}
const search = queryFilter('q')
const selectedCompany = queryFilter('companyId')
const selectedPeriod = queryFilter('period')
const selectedStatus = queryFilter('status')
const filters = computed(() => ({ search: search.value, companyId: selectedCompany.value, period: selectedPeriod.value, status: selectedStatus.value }))
const hasFilters = computed(() => Object.values(filters.value).some(Boolean))
const visibleBatches = computed(() => filterHistory(batches.value, workspace.value.companies, filters.value))
const groups = computed(() => groupHistory(visibleBatches.value).map(group => ({ ...group,
  entries: group.batches.map(batch => ({ batch, status: historyStatus(batch), date: dateParts(batch.receivedAt) })),
})))
const periods = computed(() => groupHistory(batches.value).map(group => ({ value: group.key, label: group.label })))
const companies = computed(() => [...workspace.value.companies].sort((a, b) => (a.tradeName || a.legalName).localeCompare(b.tradeName || b.legalName, 'pt-BR')))
const summary = computed(() => summarizeHistory(batches.value, loadedAt.value))
const currentMonthLabel = computed(() => historyMonthLabel(`${loadedAt.value.getFullYear()}-${String(loadedAt.value.getMonth() + 1).padStart(2, '0')}`))

function number(value: number): string { return value.toLocaleString('pt-BR') }
function dateParts(value: string) {
  const date = new Date(value), valid = Number.isFinite(date.getTime())
  const format = (options: Intl.DateTimeFormatOptions) => valid ? new Intl.DateTimeFormat('pt-BR', options).format(date) : '—'
  return { valid, day: format({ day: '2-digit' }), month: format({ month: 'short' }).replace('.', ''), time: format({ hour: '2-digit', minute: '2-digit' }),
    full: valid ? format({ dateStyle: 'long', timeStyle: 'short' }) : 'Data não informada' }
}
function lastImport(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}
function environment(code?: string): string {
  return code === '1' ? 'Produção' : code === '2' ? 'Homologação' : 'Ambiente não informado'
}
function sourceType(name?: string): string {
  return name?.trim().toLowerCase().endsWith('.zip') ? 'ZIP' : name?.trim().toLowerCase().endsWith('.xml') ? 'XML' : ''
}
function clearFilters(): void {
  void router.replace({ query: { ...route.query, q: undefined, companyId: undefined, period: undefined, status: undefined } })
}
async function load(): Promise<void> {
  loading.value = true; loadError.value = ''
  try {
    const [savedBatches, savedRecoveries, savedWorkspace] = await Promise.all([
      window.desktopApi.getDashboard(), window.desktopApi.listRecoverableImports(), window.desktopApi.getWorkspace(),
    ])
    batches.value = savedBatches; recoveries.value = savedRecoveries; workspace.value = savedWorkspace
    loadedAt.value = new Date(); loaded.value = true
  } catch (cause) { loadError.value = desktopErrorMessage(cause, RendererErrorMessage.BATCH_LIST_LOAD) }
  finally { loading.value = false }
}
async function resume(id: string): Promise<void> {
  operationError.value = ''; resuming.value = id; operationId.value = crypto.randomUUID()
  try { await window.desktopApi.resumeImport(id, operationId.value) }
  catch (cause) { operationError.value = desktopErrorMessage(cause, 'Não foi possível retomar o lote.') }
  finally { resuming.value = ''; operationId.value = ''; progress.value = undefined; await load() }
}
async function pause(): Promise<void> {
  try { await window.desktopApi.pauseBatchOperation(operationId.value) }
  catch (cause) { operationError.value = desktopErrorMessage(cause, 'Não foi possível pausar.') }
}
onMounted(() => {
  unsubscribe = window.desktopApi.onBatchProgress(value => {
    if (value.operationId === operationId.value) progress.value = value
  })
  void load()
})
onUnmounted(() => unsubscribe?.())
</script>

<template>
  <section class="batch-history" :aria-busy="loading">
    <header class="history-heading">
      <div><p class="eyebrow">Histórico de lotes</p><h2>Cada lote, no seu tempo.</h2><p>Seus lotes e arquivos, organizados por data.</p></div>
      <div class="history-heading-actions">
        <button class="history-refresh" type="button" aria-label="Atualizar histórico" title="Atualizar histórico" :disabled="loading || !!resuming" @click="load"><AppIcon name="refresh" /></button>
        <RouterLink class="button primary" to="/lotes/novo"><AppIcon name="plus" />Novo lote</RouterLink>
      </div>
    </header>

    <div class="history-banner">
      <img :src="bannerUrl" alt="Pastas organizadas em uma mesa de escritório, com um documento sendo arquivado" width="2172" height="724" fetchpriority="high" />
      <div class="history-banner-copy"><p>Seu histórico organizado</p><h3>Cada importação,<br>sempre à mão.</h3></div>
    </div>

    <p v-if="loadError" class="form-error history-error" role="alert">{{ loadError }} <button type="button" :disabled="loading || !!resuming" @click="load">Tentar novamente</button></p>
    <p v-if="operationError" class="form-error history-error" role="alert">{{ operationError }}</p>
    <p v-if="loading && !loaded" class="history-loading" role="status">Carregando o histórico…</p>

    <template v-if="loaded">
      <div class="history-metrics" aria-label="Resumo de todo o histórico">
        <div><span>Todos os lotes</span><strong>{{ number(summary.total) }}</strong><small>Histórico da instalação</small></div>
        <div><span>Importados neste mês</span><strong>{{ number(summary.thisMonth) }}</strong><small>{{ currentMonthLabel }}</small></div>
        <div class="history-metric-attention"><span>Precisam de atenção</span><strong>{{ number(summary.attention) }}</strong><small>Pendências, revisões ou interrupções</small></div>
        <div><span>Última importação</span><strong class="history-last-date">{{ summary.latest ? lastImport(summary.latest.receivedAt) : '—' }}</strong><small>{{ summary.latest?.companyName || (summary.latest ? 'Empresa não informada' : 'Nenhum lote importado') }}</small></div>
      </div>

      <section v-if="recoveries.length" class="history-recoveries" aria-label="Importações a retomar">
        <article v-for="recovery in recoveries" :key="recovery.id" class="history-recovery">
          <div class="history-recovery-copy"><h3>Importação interrompida</h3><p>{{ recovery.originalName }}</p><small>{{ number(recovery.stagedEntries) }} de {{ number(recovery.totalEntries) }} entradas preservadas. Mantenha os arquivos de origem no mesmo local.</small></div>
          <button class="button secondary" type="button" :disabled="!!resuming || loading || !!recovery.error" @click="resume(recovery.id)">Retomar importação</button>
          <p v-if="recovery.error" class="history-recovery-message" role="alert">{{ recovery.error }}</p>
          <div v-if="resuming === recovery.id" class="history-recovery-progress"><p role="status">{{ progress?.phase === 'SAVING' ? 'Salvando lote…' : 'Retomando…' }} {{ number(progress?.completed ?? 0) }} / {{ number(progress?.total ?? recovery.totalEntries) }}</p><button class="button secondary" type="button" :disabled="progress?.phase === 'SAVING'" @click="pause">Pausar</button></div>
        </article>
      </section>

      <div class="history-tools">
        <label class="history-search"><AppIcon name="search" /><input v-model="search" type="search" aria-label="Buscar lote ou empresa" placeholder="Buscar lote ou empresa"></label>
        <select v-model="selectedPeriod" aria-label="Período de importação"><option value="">Todos os períodos</option><option v-for="period in periods" :key="period.value" :value="period.value">{{ period.label }}</option></select>
        <select v-model="selectedCompany" aria-label="Empresa do lote"><option value="">Todas as empresas</option><option v-for="company in companies" :key="company.id" :value="company.id">{{ company.tradeName || company.legalName }}{{ company.active ? '' : ' · Inativa' }}</option></select>
        <select v-model="selectedStatus" aria-label="Situação do lote"><option value="">Todas as situações</option><option value="attention">A conferir</option><option value="complete">Concluídos</option><option value="processing">Em importação</option><option value="stopped">Interrompidos ou com falha</option><option value="excluded">Fora do cálculo</option><option value="files">Sem notas</option></select>
      </div>
      <div class="history-list-caption"><span>Mais recentes primeiro</span><span role="status">{{ number(visibleBatches.length) }} {{ visibleBatches.length === 1 ? 'lote' : 'lotes' }}<template v-if="hasFilters"> de {{ number(batches.length) }} <button type="button" class="history-clear" @click="clearFilters">Limpar filtros</button></template></span></div>

      <article v-if="!batches.length" class="history-empty"><AppIcon name="archive" /><h3>Seu histórico começa no primeiro lote.</h3><p>Importe XMLs ou um ZIP para consultar as notas e acompanhar a conferência.</p><RouterLink class="button primary" to="/lotes/novo">Importar primeiro lote</RouterLink></article>
      <article v-else-if="!visibleBatches.length" class="history-empty"><AppIcon name="search" /><h3>Nenhum lote corresponde aos filtros</h3><p>Experimente outra busca, empresa, período ou situação.</p><button class="button secondary" type="button" @click="clearFilters">Limpar filtros</button></article>

      <section v-for="group in groups" :key="group.key" class="history-month" :aria-label="group.label">
        <header class="history-month-heading"><h3>{{ group.label }}</h3><span>{{ number(group.entries.length) }} {{ group.entries.length === 1 ? 'lote' : 'lotes' }}</span><div aria-hidden="true"></div></header>
        <div class="history-track">
          <div v-for="entry in group.entries" :key="entry.batch.id" class="history-entry">
            <time v-if="entry.date.valid" class="history-date" :datetime="entry.batch.receivedAt" :aria-label="entry.date.full"><strong>{{ entry.date.day }}</strong><span>{{ entry.date.month }}</span><small>{{ entry.date.time }}</small></time>
            <span v-else class="history-date history-undated" aria-label="Data não informada">—</span>
            <RouterLink class="history-card" :to="`/lotes/${entry.batch.id}`" :aria-label="`Abrir lote ${entry.batch.originalName || 'sem nome'}. ${entry.batch.companyName || 'Empresa não informada'}. ${entry.status.label}`">
              <span class="history-folder"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true" focusable="false"><path d="M3 8V6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z"/><path d="M3 9h18"/></svg></span>
              <div class="history-card-content">
                <div class="history-card-heading"><h4>{{ entry.batch.originalName || 'Lote sem nome' }}</h4><span class="history-badge" :class="entry.status.tone"><i aria-hidden="true"></i>{{ entry.status.label }}</span></div>
                <p class="history-company">{{ entry.batch.companyName || 'Empresa não informada' }}<span>{{ environment(entry.batch.environmentCode) }}<template v-if="sourceType(entry.batch.originalName)"> · {{ sourceType(entry.batch.originalName) }}</template></span></p>
                <div class="history-inline-stats">
                  <span><b>{{ number(entry.batch.counts.receivedNotes) }}</b> notas</span>
                  <span><b>{{ number(entry.batch.counts.calculatedNotes) }}</b> calculadas</span>
                  <span :class="{ attention: entry.batch.counts.pendingItems + entry.batch.counts.divergentItems > 0 }" :title="`${entry.batch.counts.pendingItems} itens pendentes e ${entry.batch.counts.divergentItems} itens com divergência`"><b>{{ number(entry.batch.counts.pendingItems + entry.batch.counts.divergentItems) }}</b> itens a conferir</span>
                  <span><b>{{ number(entry.batch.totalFiles) }}</b> arquivos</span>
                  <span v-if="entry.batch.counts.reviewNotes" class="attention"><b>{{ number(entry.batch.counts.reviewNotes) }}</b> notas em revisão</span>
                  <span v-if="entry.batch.counts.excludedNotes + entry.batch.counts.blockedNotes" class="muted" title="Notas sem itens com CFOP elegível ou excluídas pela política documental"><b>{{ number(entry.batch.counts.excludedNotes + entry.batch.counts.blockedNotes) }}</b> fora do cálculo</span>
                  <span v-if="entry.batch.totalPendencies" class="muted"><b>{{ number(entry.batch.totalPendencies) }}</b> diagnósticos</span>
                </div>
              </div>
              <svg class="history-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true" focusable="false"><path d="m9 5 7 7-7 7"/></svg>
            </RouterLink>
          </div>
        </div>
      </section>
    </template>
  </section>
</template>

<style scoped src="../batch-history.css"></style>
