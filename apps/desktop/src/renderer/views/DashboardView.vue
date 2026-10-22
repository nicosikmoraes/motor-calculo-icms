<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import type { DashboardBatchSummary, DashboardCounts, WorkspaceState } from '@motor/contracts'
import AppIcon from '../components/AppIcon.vue'
import bannerUrl from '../assets/office-team-banner.webp'
import { RendererErrorMessage } from '../error-messages'

const router = useRouter()
const batches = ref<readonly DashboardBatchSummary[]>([])
const workspace = ref<WorkspaceState>({ companies: [] })
const selectedCompany = ref('')
const selectedPeriod = ref('all')
const chartMode = ref<'company' | 'date'>('company')
const loading = ref(true)
const error = ref('')
const loadedAt = ref('')

function emptyCounts(): DashboardCounts {
  return { receivedNotes: 0, calculatedNotes: 0, pendingNotes: 0, excludedNotes: 0, blockedNotes: 0, reviewNotes: 0, pendingItems: 0, divergentItems: 0 }
}
function totalCounts(rows: readonly DashboardCounts[]): DashboardCounts {
  const result = emptyCounts()
  for (const row of rows) for (const field of Object.keys(result) as (keyof DashboardCounts)[]) result[field] += row[field]
  return result
}
function monthKey(value: string): string {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}` : 'unknown'
}
function dayKey(value: string): string {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? `${monthKey(value)}-${String(date.getDate()).padStart(2, '0')}` : 'unknown'
}
function formatDate(value: string, short = false): string {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('pt-BR', short ? { day: 'numeric', month: 'short' } : { dateStyle: 'short', timeStyle: 'short' }).format(date) : 'Data não informada'
}
const periods = computed(() => [...new Set(batches.value.map(batch => monthKey(batch.receivedAt)))].filter(key => key !== 'unknown').sort().reverse()
  .map(value => ({ value, label: new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(new Date(`${value}-15T12:00:00`)) })))
const periodBatches = computed(() => batches.value.filter(batch => selectedPeriod.value === 'all' || monthKey(batch.receivedAt) === selectedPeriod.value))
const visibleBatches = computed(() => periodBatches.value.filter(batch => !selectedCompany.value || batch.companies.some(company => company.companyId === selectedCompany.value))
  .map(batch => ({ ...batch, counts: selectedCompany.value ? totalCounts(batch.companies.filter(company => company.companyId === selectedCompany.value)) : batch.counts })))
const totals = computed(() => totalCounts(visibleBatches.value.map(batch => batch.counts)))
const attentionCount = computed(() => totals.value.pendingItems + totals.value.divergentItems)
const calculatedPercent = computed(() => totals.value.receivedNotes ? Math.round(totals.value.calculatedNotes / totals.value.receivedNotes * 100) : 0)
const ringStyle = computed(() => {
  const denominator = totals.value.receivedNotes || 1
  const calculated = totals.value.calculatedNotes / denominator * 360
  const pending = calculated + totals.value.pendingNotes / denominator * 360
  const excluded = pending + totals.value.excludedNotes / denominator * 360
  return { background: `conic-gradient(#455fdb 0deg ${calculated}deg, #d9a047 ${calculated}deg ${pending}deg, #b7c2d6 ${pending}deg ${excluded}deg, #e7ecf5 ${excluded}deg 360deg)` }
})
const companyNames = computed(() => new Map(workspace.value.companies.map(company => [company.id, company.tradeName || company.legalName])))
const chartGroups = computed(() => {
  if (chartMode.value === 'company') {
    const groups = new Map<string, DashboardCounts>()
    for (const batch of visibleBatches.value) for (const company of batch.companies) {
      if (selectedCompany.value && company.companyId !== selectedCompany.value) continue
      const key = company.companyId ?? ''
      groups.set(key, totalCounts([groups.get(key) ?? emptyCounts(), company]))
    }
    return [...groups].map(([id, counts]) => ({ id, label: companyNames.value.get(id) ?? 'Sem empresa associada', counts }))
      .sort((a, b) => b.counts.receivedNotes - a.counts.receivedNotes || a.label.localeCompare(b.label, 'pt-BR'))
  }
  const groups = new Map<string, { date: string; counts: DashboardCounts }>()
  for (const batch of visibleBatches.value) {
    const key = dayKey(batch.receivedAt), previous = groups.get(key)
    groups.set(key, { date: batch.receivedAt, counts: totalCounts([previous?.counts ?? emptyCounts(), batch.counts]) })
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([id, value]) => ({ id, label: formatDate(value.date, true), counts: value.counts }))
})
const chartMaximum = computed(() => Math.max(1, ...chartGroups.value.map(group => group.counts.receivedNotes)))
const attentionBatches = computed(() => visibleBatches.value.filter(batch => batch.counts.pendingItems + batch.counts.divergentItems + batch.counts.reviewNotes > 0))
const recentBatches = computed(() => visibleBatches.value.slice(0, 5))

function companyLabel(batch: DashboardBatchSummary): string {
  return selectedCompany.value ? companyNames.value.get(selectedCompany.value) ?? 'Empresa' : batch.companyName ?? 'Sem empresa associada'
}
function batchState(batch: DashboardBatchSummary): string {
  if (batch.counts.reviewNotes) return 'Revisão documental'
  if (batch.counts.pendingItems) return 'A conferir'
  if (batch.counts.divergentItems) return 'Divergência'
  if (batch.counts.calculatedNotes) return 'Calculado'
  if (batch.counts.blockedNotes) return 'Fora dos totais'
  if (batch.counts.excludedNotes) return 'Sem CFOP elegível'
  return batch.totalPendencies ? 'Diagnósticos de importação' : 'Sem notas para calcular'
}
function batchNeedsAttention(batch: DashboardBatchSummary): boolean {
  return batch.counts.pendingItems + batch.counts.divergentItems + batch.counts.reviewNotes > 0 || (!batch.counts.receivedNotes && batch.totalPendencies > 0)
}
function showAttention(): void {
  document.getElementById('dashboard-attention')?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}
function openChartGroup(id: string): void {
  if (chartMode.value === 'company' && id) selectedCompany.value = selectedCompany.value === id ? '' : id
}
function openBatch(batch: DashboardBatchSummary): void {
  void router.push({ path: `/lotes/${batch.id}`, query: batch.counts.pendingItems || batch.counts.divergentItems ? { painel: 'pending' } : {} })
}
async function load(): Promise<void> {
  loading.value = true; error.value = ''
  try {
    const [savedBatches, savedWorkspace] = await Promise.all([window.desktopApi.getDashboard(), window.desktopApi.getWorkspace()])
    batches.value = savedBatches; workspace.value = savedWorkspace
    loadedAt.value = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date())
    if (selectedCompany.value && !savedWorkspace.companies.some(company => company.id === selectedCompany.value)) selectedCompany.value = ''
  } catch (cause) { error.value = cause instanceof Error ? cause.message : RendererErrorMessage.DASHBOARD_LOAD }
  finally { loading.value = false }
}
onMounted(load)
</script>

<template>
  <section class="dashboard" :aria-busy="loading">
    <header class="dashboard-heading"><div><p class="eyebrow">{{ workspace.organization?.name || 'Meu escritório' }}</p><h2>Visão geral</h2></div><div class="refresh-tools"><small v-if="loadedAt">Atualizado às {{ loadedAt }}</small><button class="refresh-button" type="button" :disabled="loading" @click="load"><AppIcon name="refresh" />{{ loading ? 'Carregando…' : 'Atualizar' }}</button></div></header>
    <section class="office-banner" aria-label="Seu escritório em um só lugar"><img :src="bannerUrl" alt="Equipe contábil revisando documentos em um escritório" width="2172" height="724" fetchpriority="high" /><div class="banner-copy"><h3>Seu escritório,<br>em um só lugar.</h3><p>Acompanhe suas empresas e dê sequência às conferências do dia.</p><div class="banner-actions"><RouterLink class="banner-primary" to="/lotes/novo"><AppIcon name="plus" />Importar notas</RouterLink><RouterLink class="banner-secondary" to="/lotes">Ver histórico</RouterLink></div></div></section>
    <p v-if="error" class="form-error" role="alert">{{ error }} <button type="button" class="text-action" :disabled="loading" @click="load">Tentar novamente</button></p>
    <div class="dashboard-filters"><label>Empresa<select v-model="selectedCompany"><option value="">Todas as empresas</option><option v-for="company in workspace.companies" :key="company.id" :value="company.id">{{ company.tradeName || company.legalName }} · {{ company.state }}{{ company.active ? '' : ' · Inativa' }}</option></select></label><label>Período de importação<select v-model="selectedPeriod"><option value="all">Todo o histórico</option><option v-for="period in periods" :key="period.value" :value="period.value">{{ period.label }}</option></select></label><RouterLink class="company-shortcut" to="/empresas"><AppIcon name="companies" />Gerenciar empresas</RouterLink></div>
    <p v-if="loading && !loadedAt" class="dashboard-empty" role="status">Carregando notas e cálculos salvos…</p>
    <template v-else-if="loadedAt">
      <div class="dashboard-stats" aria-live="polite" aria-atomic="true"><div><span>Notas recebidas</span><strong>{{ totals.receivedNotes.toLocaleString('pt-BR') }}</strong><small>{{ visibleBatches.length }} lote(s) no período</small></div><div><span>Notas calculadas</span><strong>{{ totals.calculatedNotes.toLocaleString('pt-BR') }}</strong><small>Com resultado salvo</small></div><div><span>Itens a conferir</span><strong>{{ attentionCount.toLocaleString('pt-BR') }}</strong><small>{{ totals.pendingItems }} pendente(s) · {{ totals.divergentItems }} divergente(s)</small></div></div>
      <section class="dashboard-panel analysis-panel">
        <header class="panel-header"><div><h3>Recebimento e cálculo</h3><p>Compare o volume de notas no período</p></div><div class="chart-tabs" aria-label="Agrupar gráfico"><button type="button" :aria-pressed="chartMode === 'company'" @click="chartMode = 'company'">Por empresa</button><button type="button" :aria-pressed="chartMode === 'date'" @click="chartMode = 'date'">Por data</button></div></header>
        <div class="analysis-grid"><div class="column-chart"><div class="chart-legend"><span><i class="legend-dot received"></i>Recebidas</span><span><i class="legend-dot calculated"></i>Calculadas</span></div><p class="plot-unit">Número de notas</p><p v-if="!chartGroups.length" class="chart-empty">{{ batches.length ? 'Nenhuma nota neste recorte. Escolha outra empresa ou período.' : 'Importe seu primeiro lote para acompanhar os cálculos aqui.' }}</p><div v-else class="chart-scroll" role="region" aria-label="Comparação de notas recebidas e calculadas" tabindex="0"><div class="paired-bars" :style="{ minWidth: `${chartGroups.length * 100}px` }"><button v-for="group in chartGroups" :key="group.id" type="button" class="bar-group" :class="{ 'can-filter': chartMode === 'company' && group.id }" :aria-label="`${group.label}: ${group.counts.receivedNotes} notas recebidas e ${group.counts.calculatedNotes} calculadas${chartMode === 'company' && group.id ? '. Filtrar esta empresa' : ''}`" @click="openChartGroup(group.id)"><span class="bar-pair"><span class="bar-unit"><span class="bar-value">{{ group.counts.receivedNotes }}</span><span class="bar-fill received" :style="{ height: `${group.counts.receivedNotes / chartMaximum * 132}px` }"></span></span><span class="bar-unit"><span class="bar-value">{{ group.counts.calculatedNotes }}</span><span class="bar-fill calculated" :style="{ height: `${group.counts.calculatedNotes / chartMaximum * 132}px` }"></span></span></span><span class="bar-label">{{ group.label }}</span></button></div></div><p class="plot-axis">{{ chartMode === 'company' ? 'Empresa · clique nas barras para filtrar' : 'Data de importação' }}</p></div>
          <aside class="progress-panel"><h4>Andamento do cálculo</h4><div class="calculation-ring" :style="ringStyle" role="img" :aria-label="`${totals.calculatedNotes} de ${totals.receivedNotes} notas calculadas`"><div><strong>{{ calculatedPercent }}%</strong><span>calculadas</span></div></div><dl class="progress-legend"><div><dt><i class="legend-dot calculated"></i>Calculadas</dt><dd>{{ totals.calculatedNotes }}</dd></div><div><dt><i class="legend-dot pending"></i>Aguardam cálculo</dt><dd>{{ totals.pendingNotes }}</dd></div><div><dt><i class="legend-dot excluded"></i>Fora do filtro CFOP</dt><dd>{{ totals.excludedNotes }}</dd></div><div v-if="totals.blockedNotes"><dt><i class="legend-dot blocked"></i>Fora dos totais</dt><dd>{{ totals.blockedNotes }}</dd></div></dl><button v-if="attentionBatches.length" class="text-action" type="button" @click="showAttention">Ver o que falta conferir</button></aside>
        </div>
      </section>
      <section v-if="attentionBatches.length" id="dashboard-attention" class="dashboard-panel attention-panel"><header class="panel-header"><div><h3>O que falta conferir</h3><p>Abra o lote para revisar os itens ou a documentação.</p></div></header><div class="attention-list"><button v-for="batch in attentionBatches.slice(0, 3)" :key="batch.id" type="button" @click="openBatch(batch)"><span><strong>{{ batch.originalName || 'Lote sem nome' }}</strong><small>{{ companyLabel(batch) }}</small></span><span>{{ batch.counts.pendingItems }} pendente(s) · {{ batch.counts.divergentItems }} divergente(s)<template v-if="batch.counts.reviewNotes"> · {{ batch.counts.reviewNotes }} nota(s) em revisão</template></span><b>Conferir lote</b></button></div><RouterLink v-if="attentionBatches.length > 3" class="attention-more" to="/lotes">Ver todos os lotes no histórico</RouterLink></section>
      <section class="dashboard-panel recent-panel"><header class="panel-header"><div><h3>Últimos lotes</h3><p>Resultados e conferências em andamento</p></div><RouterLink class="text-action" to="/lotes">Ver histórico</RouterLink></header><div v-if="!recentBatches.length" class="dashboard-empty"><p>{{ batches.length ? 'Nenhum lote corresponde aos filtros selecionados.' : 'Seu histórico começa na primeira importação.' }}</p><RouterLink class="text-action" to="/lotes/novo">Importar notas</RouterLink></div><div v-for="batch in recentBatches" :key="batch.id" class="recent-row"><div class="batch-name"><strong>{{ batch.originalName || 'Lote sem nome' }}</strong><small>{{ formatDate(batch.receivedAt) }} · {{ batch.counts.receivedNotes }} nota(s)</small></div><div class="batch-company"><strong>{{ companyLabel(batch) }}</strong><small>{{ batch.counts.calculatedNotes }} calculada(s)<template v-if="batch.environmentCode"> · {{ batch.environmentCode === '2' ? 'Homologação' : 'Produção' }}</template></small></div><span class="batch-state" :class="{ attention: batchNeedsAttention(batch) }">{{ batchState(batch) }}</span><button type="button" class="text-action" @click="openBatch(batch)">{{ batchNeedsAttention(batch) ? 'Conferir' : 'Ver lote' }}</button></div><footer v-if="recentBatches.length"><RouterLink class="text-action" to="/lotes">Consultar todas as importações</RouterLink></footer></section>
      <p class="dashboard-note"><AppIcon name="info" /><span>{{ totals.excludedNotes }} nota(s) sem itens com CFOP elegível ficaram fora do cálculo. Uma nota é contada como calculada quando todos os seus itens com CFOP válido não iniciado em 6 têm resultado salvo. Divergências são contadas por item e podem existir em notas já calculadas.</span></p>
    </template>
  </section>
</template>

<style scoped src="../dashboard.css"></style>
