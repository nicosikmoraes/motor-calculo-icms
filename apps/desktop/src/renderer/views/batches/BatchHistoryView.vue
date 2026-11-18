<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import type { RecoverableImport } from '@motor/contracts'
import AppIcon from '../../components/ui/AppIcon.vue'
import bannerUrl from '../../assets/batch-history-banner.png'
import { desktopErrorMessage, RendererErrorMessage } from '../../concerns/ipc/error-messages'
import { filterHistory, groupHistory, historyMonthLabel, historyStatus, summarizeHistory } from '../../concerns/batches/batch-history'
import { useBatchesStore } from '../../stores/batches'
import { useWorkspaceStore } from '../../stores/workspace'
import { useBatchProgress } from '../../concerns/batches/use-batch-progress'

const route = useRoute()
const router = useRouter()
const batchesStore = useBatchesStore()
const { batches } = storeToRefs(batchesStore)
const workspaceStore = useWorkspaceStore()
const { workspace } = storeToRefs(workspaceStore)
const recoveries = ref<readonly RecoverableImport[]>([])
const loading = ref(true)
const loaded = ref(false)
const loadedAt = ref(new Date())
const loadError = ref('')
const operationError = ref('')
const resuming = ref('')
const operationId = ref('')
const progress = useBatchProgress(operationId)

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
    const [savedRecoveries] = await Promise.all([
      window.desktopApi.listRecoverableImports(), batchesStore.refreshBatches(), workspaceStore.refreshWorkspace(),
    ])
    recoveries.value = savedRecoveries
    loadedAt.value = new Date(); loaded.value = true
  } catch (cause) { loadError.value = desktopErrorMessage(cause, RendererErrorMessage.BATCH_LIST_LOAD) }
  finally { loading.value = false }
}
async function resume(id: string): Promise<void> {
  operationError.value = ''; resuming.value = id; operationId.value = crypto.randomUUID()
  try { await window.desktopApi.resumeImport(id, operationId.value) }
  catch (cause) { operationError.value = desktopErrorMessage(cause, 'Não foi possível retomar o lote.') }
  finally { resuming.value = ''; operationId.value = ''; progress.value = null; await load() }
}
async function pause(): Promise<void> {
  try { await window.desktopApi.pauseBatchOperation(operationId.value) }
  catch (cause) { operationError.value = desktopErrorMessage(cause, 'Não foi possível pausar.') }
}
onMounted(load)
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

<style scoped>
.batch-history { max-width: 1180px; margin: 0 auto; }
.history-heading { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 23px; }
.history-heading h2 { margin: 7px 0 9px; color: #142238; font-size: 30px; line-height: 1.15; letter-spacing: -.045em; }
.history-heading > div > p:last-child { margin: 0; color: #6a788d; font-size: 13px; }
.history-heading-actions { display: flex; align-items: center; gap: 10px; flex: none; }
.history-heading-actions .button { gap: 7px; }
.history-refresh { display: grid; place-items: center; width: 39px; height: 39px; border: 1px solid #dfe5ef; border-radius: 9px; background: #fff; color: #7b8ca6; cursor: pointer; }
.history-refresh:hover:not(:disabled) { color: #455fdb; border-color: #bfccef; }
.history-refresh:disabled { opacity: .5; cursor: wait; }
.history-banner { position: relative; isolation: isolate; overflow: hidden; min-height: 168px; border-radius: 18px; margin-bottom: 19px; background: #111c2e; }
.history-banner img { position: absolute; inset: 0; z-index: -2; width: 100%; height: 100%; object-fit: cover; object-position: center 56%; }
.history-banner::after { content: ''; position: absolute; inset: 0; z-index: -1; background: linear-gradient(90deg, #111c2e80, #111c2e44 40%, transparent 67%); }
.history-banner-copy { padding: 23px 28px; color: white; }
.history-banner-copy > p { margin: 0; color: #bbc9e9; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .16em; }
.history-banner-copy h3 { margin: 10px 0 0; font-size: 25px; line-height: 1.17; font-weight: 650; letter-spacing: -.035em; }
.history-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 11px; margin-bottom: 23px; }
.history-metrics > div { padding: 14px 17px; min-width: 0; border: 1px solid #e1e7f0; border-radius: 12px; background: #fff; }
.history-metrics span { display: block; color: #728096; font-size: 11px; }
.history-metrics strong { display: block; margin: 7px 0 4px; font-size: 24px; font-weight: 650; color: #1a2b4b; line-height: 1.2; letter-spacing: -.04em; font-variant-numeric: tabular-nums; }
.history-metrics small { color: #8793a6; font-size: 10px; line-height: 1.4; overflow-wrap: anywhere; }
.history-metrics .history-metric-attention { border-color: #eadfc9; background: #fffcf6; }
.history-metric-attention strong { color: #a47121; }
.history-metrics .history-last-date { font-size: 19px; letter-spacing: -.03em; }
.history-error { margin-bottom: 16px; }
.history-error button { border: 0; background: transparent; color: inherit; text-decoration: underline; font: inherit; cursor: pointer; }
.history-loading { padding: 22px; color: #77879f; font-size: 13px; }
.history-tools { display: grid; grid-template-columns: minmax(200px, 1.5fr) repeat(3, minmax(125px, 1fr)); gap: 9px; }
.history-tools input, .history-tools select { min-height: 42px; width: 100%; min-width: 0; padding: 0 10px; color: #52627a; background: white; border: 1px solid #dfe5ef; border-radius: 9px; font-size: 11px; }
.history-search { display: flex; gap: 8px; align-items: center; padding: 0 11px; border: 1px solid #dfe5ef; border-radius: 9px; background: white; }
.history-search .app-icon { width: 17px; height: 17px; color: #8492a7; }
.history-search input { border: 0; padding: 0; background: transparent; }
.history-tools input::placeholder { color: #8d99ab; }
.history-search:focus-within { border-color: #7a8ede; outline: 2px solid #455fdb26; }
.history-search input:focus { outline: 0; }
.history-tools select:focus-visible { outline: 2px solid #5973db; outline-offset: 3px; }
.history-list-caption { display: flex; justify-content: space-between; gap: 10px; margin: 12px 0 25px; color: #8a96a8; font-size: 10px; }
.history-clear { margin-left: 8px; padding: 0; border: 0; background: none; color: #526bc7; font-size: 10px; cursor: pointer; }
.history-clear:hover { text-decoration: underline; }
.history-month { margin-bottom: 24px; }
.history-month-heading { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.history-month-heading h3 { margin: 0; font-size: 13px; font-weight: 650; color: #33496a; }
.history-month-heading > span { color: #8b98ab; font-size: 10px; }
.history-month-heading > div { flex: 1; height: 1px; background: #e4e9f1; }
.history-track { display: grid; gap: 10px; position: relative; }
.history-track::before { content: ''; position: absolute; left: 24px; top: 22px; bottom: 22px; width: 1px; background: #e0e6ef; }
.history-entry { display: grid; grid-template-columns: 49px minmax(0, 1fr); gap: 15px; align-items: center; position: relative; }
.history-date { display: flex; align-items: center; flex-direction: column; position: relative; background: #f5f7fb; padding: 6px 0; font-style: normal; }
.history-date strong { font-size: 24px; color: #4c6080; font-weight: 550; line-height: 1; letter-spacing: -.04em; }
.history-date > span { color: #8b98aa; font-size: 9px; text-transform: uppercase; letter-spacing: .08em; margin-top: 4px; }
.history-date small { color: #9da8b7; font-size: 9px; margin-top: 6px; }
.history-undated { color: #8b98aa; }
.history-card { display: flex; align-items: center; gap: 13px; min-width: 0; padding: 15px 17px; border: 1px solid #e1e7ef; border-radius: 11px; background: #fff; text-decoration: none; color: inherit; box-shadow: 0 2px 5px #263b6003; transition: background .16s, border-color .16s, box-shadow .16s; }
.history-card:hover { border-color: #c0cdef; background: #fcfdff; box-shadow: 0 3px 12px #263b6008; }
.history-card:focus-visible { outline: 2px solid #5973db; outline-offset: 3px; }
.history-folder { display: grid; place-items: center; width: 34px; height: 38px; flex: none; border-radius: 9px; color: #7890c0; background: #f1f4fb; }
.history-folder svg { width: 20px; height: 20px; }
.history-card-content { flex: 1; min-width: 0; }
.history-card-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.history-card-heading h4 { margin: 0; font-size: 13px; font-weight: 600; color: #304562; line-height: 1.4; overflow-wrap: anywhere; letter-spacing: -.01em; }
.history-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 7px; border-radius: 99px; font-size: 9px; font-weight: 500; flex: none; color: #697e9b; background: #eff3f9; }
.history-badge i { width: 5px; height: 5px; border-radius: 50%; background: currentColor; flex: none; }
.history-badge.success { color: #227057; background: #eaf6f0; }
.history-badge.warning { color: #956216; background: #fff3dc; }
.history-company { margin: 5px 0 10px; color: #7f8da1; font-size: 10px; line-height: 1.4; overflow-wrap: anywhere; }
.history-company > span { margin-left: 8px; color: #909db2; font-size: 9px; }
.history-inline-stats { display: flex; align-items: center; flex-wrap: wrap; gap: 5px 14px; color: #8190a6; font-size: 10px; line-height: 1.4; }
.history-inline-stats > span { white-space: nowrap; }
.history-inline-stats b { font-weight: 600; color: #526680; font-variant-numeric: tabular-nums; }
.history-inline-stats .attention, .history-inline-stats .attention b { color: #a87626; }
.history-inline-stats .muted, .history-inline-stats .muted b { color: #8c98aa; font-size: 9px; font-weight: 400; }
.history-arrow { width: 15px; height: 15px; flex: none; margin-left: 2px; color: #b6c1d1; transition: transform .16s, color .16s; }
.history-card:hover .history-arrow { color: #5f78c0; transform: translateX(2px); }
.history-empty { padding: 36px 20px; text-align: center; border: 1px dashed #d9e1ee; border-radius: 11px; color: #6f8099; }
.history-empty > .app-icon { width: 28px; height: 28px; color: #96a7c5; }
.history-empty h3 { margin: 13px 0 8px; font-size: 17px; color: #4a6080; }
.history-empty p { margin: 0 0 18px; font-size: 12px; line-height: 1.6; }
.history-recoveries { display: grid; gap: 10px; margin-bottom: 22px; }
.history-recovery { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 15px; padding: 17px; border: 1px solid #e8dcc1; border-radius: 11px; background: #fffcf6; }
.history-recovery-copy { flex: 1; min-width: 220px; }
.history-recovery h3 { margin: 0 0 6px; color: #8c682d; font-size: 13px; }
.history-recovery-copy p { margin: 0 0 5px; color: #6f7782; font-size: 12px; overflow-wrap: anywhere; }
.history-recovery-copy small { color: #948773; font-size: 10px; line-height: 1.5; }
.history-recovery-message { width: 100%; margin: 0; color: #9c542c; font-size: 12px; }
.history-recovery-progress { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; border-top: 1px solid #ede4d3; padding-top: 12px; }
.history-recovery-progress p { margin: 0; color: #8c764f; font-size: 12px; }
.history-refresh:focus-visible, .history-clear:focus-visible, .history-error button:focus-visible { outline: 2px solid #5973db; outline-offset: 3px; }
@media (max-width: 1200px) {
  .history-tools { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .history-search { grid-column: 1 / -1; }
  .history-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 650px) {
  .history-heading { align-items: flex-start; flex-direction: column; gap: 15px; }
  .history-heading h2 { font-size: 26px; }
  .history-heading > div > p:last-child { font-size: 12px; }
  .history-banner { min-height: 160px; }
  .history-banner-copy { padding: 20px; }
  .history-banner img { object-position: 55% center; }
  .history-banner::after { background: linear-gradient(90deg, #111c2ec9, #111c2e55 65%, #111c2e22); }
  .history-entry { grid-template-columns: 33px minmax(0, 1fr); gap: 9px; }
  .history-track::before { left: 16px; }
  .history-date strong { font-size: 21px; }
  .history-date small, .history-date > span { font-size: 8px; }
  .history-card { padding: 12px; gap: 9px; }
  .history-folder { display: none; }
  .history-card-heading { gap: 7px; align-items: flex-start; flex-wrap: wrap; }
  .history-card-heading h4 { font-size: 12px; }
  .history-badge { font-size: 8px; padding: 4px 5px; }
  .history-company { font-size: 9px; margin-bottom: 8px; }
  .history-company > span { display: block; margin: 3px 0 0; font-size: 8px; }
  .history-inline-stats { gap: 5px 10px; font-size: 9px; }
  .history-inline-stats .muted, .history-inline-stats .muted b { font-size: 8px; }
  .history-arrow { width: 12px; }
  .history-tools { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .history-tools select:last-child { grid-column: 1 / -1; }
  .history-list-caption { flex-wrap: wrap; font-size: 9px; }
  .history-metrics > div { padding: 13px; }
  .history-metrics small { font-size: 9px; }
  .history-metrics .history-last-date { font-size: 17px; }
}
@media (prefers-reduced-motion: reduce) {
  .history-card, .history-arrow { transition: none; }
}
</style>
