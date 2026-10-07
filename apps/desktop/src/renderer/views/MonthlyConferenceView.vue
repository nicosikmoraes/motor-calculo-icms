<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import type { CompanySummary, ConsolidationEvidence, ConsolidationGroup, MonthlyConference } from '@motor/contracts'

const route = useRoute(), router = useRouter()
const companies = ref<readonly CompanySummary[]>([])
const companyId = ref('')
const today = new Date()
const period = ref(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`)
const conference = ref<MonthlyConference | null>(null)
const initializing = ref(true), querying = ref(false), exporting = ref(false)
const busy = computed(() => initializing.value || querying.value || exporting.value)
const error = ref(''), notice = ref('')
const activePanel = ref<'summary' | 'items' | 'batches'>('summary')
const search = ref(''), statusFilter = ref('all'), groupFilter = ref('')
const page = ref(0), pageSize = 20
const counts = computed(() => conference.value?.summary.counts)
const reviewCount = computed(() => counts.value ? counts.value.pending + counts.value.unsupported + counts.value.excluded : 0)
const calculatedPercent = computed(() => counts.value?.items ? Math.round(counts.value.calculated / counts.value.items * 100) : 0)
const batchNames = computed(() => new Map(conference.value?.batches.map(batch => [batch.id, batch.name]) ?? []))
const filteredItems = computed(() => {
  const query = search.value.trim().toLocaleLowerCase('pt-BR')
  return conference.value?.summary.evidence.filter(entry => {
    const matchesGroup = !groupFilter.value || groupKey(entry) === groupFilter.value
    const matchesStatus = statusFilter.value === 'all'
      || (statusFilter.value === 'divergent' && entry.comparison?.status === 'DIFFERENT')
      || (statusFilter.value === 'review' && entry.status !== 'CALCULATED')
      || entry.status === statusFilter.value
    const matchesSearch = !query || [entry.documentNumber, entry.itemNumber, entry.accessKey, entry.batchId,
      entry.batchId ? batchNames.value.get(entry.batchId) : undefined, entry.runId, entry.engineVersion, ...entry.reasons]
      .some(value => value?.toLocaleLowerCase('pt-BR').includes(query))
    return matchesGroup && matchesStatus && matchesSearch
  }) ?? []
})
const pageCount = computed(() => Math.max(1, Math.ceil(filteredItems.value.length / pageSize)))
const displayedItems = computed(() => filteredItems.value.slice(page.value * pageSize, (page.value + 1) * pageSize))
watch([search, statusFilter, groupFilter], () => { page.value = 0 })
watch([companyId, period], () => { conference.value = null; notice.value = ''; error.value = '' })

function currency(value?: string): string {
  if (value === undefined) return '—'
  const [integer, cents = '00'] = value.split('.')
  return `R$ ${integer!.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${cents.padEnd(2, '0')}`
}
function monthLabel(value: string): string {
  const [year, month] = value.split('-')
  const months = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
  return months[Number(month) - 1] ? `${months[Number(month) - 1]} de ${year}` : value
}
function dateTime(value: string): string {
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}
function perspective(value: ConsolidationGroup['perspective']): string {
  return value === 'SALES' ? 'Vendas' : value === 'PURCHASES' ? 'Compras' : 'Operação não identificada'
}
function environment(value: ConsolidationGroup['environment']): string {
  return value === '1' ? 'Produção' : value === '2' ? 'Homologação' : 'Ambiente desconhecido'
}
function groupKey(value: Pick<ConsolidationGroup, 'perspective' | 'environment' | 'authorization'>): string {
  return `${value.perspective}:${value.environment}:${value.authorization}`
}
function groupLabel(value: ConsolidationGroup): string {
  return `${perspective(value.perspective)} · ${environment(value.environment)} · ${value.authorization === 'WITH_PROTOCOL' ? 'Com protocolo' : 'Sem protocolo confirmado'}`
}
function itemStatus(entry: ConsolidationEvidence): string {
  return { CALCULATED: 'Calculado', PENDING: 'Pendente', UNSUPPORTED: 'Fora do escopo', EXCLUDED: 'Excluído' }[entry.status]
}
function batchStatus(value: string): string {
  return ({ RECEBIDO: 'Recebido', VALIDANDO: 'Validando', PROCESSANDO: 'Processando', CONCLUIDO: 'Concluído',
    PENDENTE: 'Pendente', INTERROMPIDO: 'Interrompido', CANCELADO: 'Cancelado', ERRO: 'Erro' } as Record<string, string>)[value] ?? value
}
function batchDocumentCount(id: string): number {
  return conference.value?.documents.filter(document => document.batchId === id).length ?? 0
}
function showItems(status = 'all', group = ''): void {
  search.value = ''; statusFilter.value = status; groupFilter.value = group; page.value = 0; activePanel.value = 'items'
}
async function load(): Promise<void> {
  if (querying.value || exporting.value || !companyId.value || !period.value) return
  error.value = ''; notice.value = ''; conference.value = null; querying.value = true
  activePanel.value = 'summary'; search.value = ''; statusFilter.value = 'all'; groupFilter.value = ''; page.value = 0
  const input = { companyId: companyId.value, period: period.value }
  try {
    conference.value = await window.desktopApi.getMonthlyConference(input)
    await router.replace({ query: { companyId: input.companyId, period: input.period } })
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Não foi possível consultar o mês.' }
  finally { querying.value = false }
}
async function exportExcel(): Promise<void> {
  if (!conference.value || busy.value) return
  const input = { companyId: conference.value.companyId, period: conference.value.period }
  exporting.value = true; error.value = ''; notice.value = ''
  try {
    const result = await window.desktopApi.exportMonthlyExcel(input)
    if (result) notice.value = `Conferência salva em ${result.path}`
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Não foi possível exportar o mês.' }
  finally { exporting.value = false }
}
async function initialize(): Promise<void> {
  initializing.value = true; error.value = ''
  try {
    companies.value = (await window.desktopApi.getWorkspace()).companies
      .slice().sort((a, b) => Number(b.active) - Number(a.active) || a.legalName.localeCompare(b.legalName))
    companyId.value = typeof route.query.companyId === 'string' ? route.query.companyId : companies.value[0]?.id ?? ''
    if (typeof route.query.period === 'string') period.value = route.query.period
    if (route.query.companyId && route.query.period) await load()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Não foi possível carregar as empresas.' }
  finally { initializing.value = false }
}
onMounted(initialize)
</script>

<template>
  <section class="monthly-conference">
    <header class="monthly-header">
      <div><span class="eyebrow">Conferência fiscal</span><h2>Conferência mensal</h2><p>Todos os lotes da empresa, organizados pelo mês de emissão.</p></div>
      <div class="export-action"><button class="button primary" type="button" :disabled="busy || !conference" @click="exportExcel"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m-4-4 4 4 4-4M5 16v5h14v-5" /></svg>{{ exporting ? 'Exportando…' : 'Exportar Excel mensal' }}</button><small>Últimos resultados salvos no momento da exportação</small></div>
    </header>

    <form class="card monthly-filters" @submit.prevent="load">
      <label class="company-field">Empresa analisada<select v-model="companyId" required :disabled="busy"><option value="" disabled>Escolha uma empresa</option><option v-for="company in companies" :key="company.id" :value="company.id">{{ company.legalName }}{{ company.active ? '' : ' (inativa)' }}</option></select></label>
      <label class="period-field">Mês de emissão<input v-model="period" type="month" required :disabled="busy"></label>
      <button class="button secondary" type="submit" :disabled="busy || !companyId || !period"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2 6M20 4v7h-7" /></svg>{{ querying ? 'Consultando…' : 'Consultar mês' }}</button>
    </form>
    <p v-if="error" class="form-error feedback" role="alert">{{ error }} <button v-if="!companies.length && !busy" class="text-button" @click="initialize">Tentar novamente</button></p>
    <p v-if="notice" class="form-success feedback" role="status">{{ notice }}</p>

    <div v-if="initializing || querying" class="card loading-panel" role="status"><span class="loading-dot" aria-hidden="true"></span>{{ initializing ? 'Carregando a conferência…' : 'Consultando notas e resultados salvos…' }}</div>
    <div v-else-if="!conference" class="card initial-panel"><span class="empty-icon" aria-hidden="true">▦</span><h3>{{ companies.length ? 'Escolha o período que deseja conferir' : 'Comece pelo cadastro de uma empresa' }}</h3><p>{{ companies.length ? 'Selecione a empresa e o mês acima. A consulta reúne as notas e os cálculos salvos de todos os lotes relacionados.' : 'As empresas cadastradas ficam disponíveis para a consulta dos resultados mensais.' }}</p><RouterLink v-if="!companies.length" class="button secondary" to="/empresas">Cadastrar empresa</RouterLink></div>

    <template v-else-if="counts">
      <div class="result-heading"><div><h3>{{ conference.companyName }}</h3><p>{{ monthLabel(conference.period) }}<span aria-hidden="true"> · </span>{{ conference.batches.length }} lotes relacionados</p></div><span class="updated-at"><span aria-hidden="true">●</span> Atualizado em {{ dateTime(conference.summary.generatedAt) }}</span></div>
      <div class="monthly-metrics" aria-label="Indicadores do mês">
        <article class="card metric"><span class="metric-caption">Ocorrências de notas<span class="metric-icon" aria-hidden="true">▤</span></span><strong>{{ counts.documents }}</strong><small>{{ counts.items }} itens recebidos no período</small></article>
        <button class="card metric" @click="showItems('CALCULATED')"><span class="metric-caption">Itens calculados<span class="metric-icon green" aria-hidden="true">✓</span></span><strong>{{ counts.calculated }}<span class="metric-denominator"> / {{ counts.items }}</span></strong><small>{{ calculatedPercent }}% dos itens com cálculo elegível</small></button>
        <button class="card metric" @click="showItems('divergent')"><span class="metric-caption">Itens com divergência<span class="metric-icon rose" aria-hidden="true">≠</span></span><strong>{{ counts.divergentItems }}</strong><small>Diferença acima de R$ 0,01 por item</small></button>
        <button class="card metric" @click="showItems('review')"><span class="metric-caption">Pendências e exclusões<span class="metric-icon amber" aria-hidden="true">!</span></span><strong>{{ reviewCount }}</strong><small>Consulte os motivos de cada item</small></button>
      </div>

      <nav class="monthly-navigation" aria-label="Áreas da conferência">
        <button :aria-pressed="activePanel === 'summary'" :class="{ active: activePanel === 'summary' }" @click="activePanel = 'summary'">Resumo do mês</button>
        <button :aria-pressed="activePanel === 'items'" :class="{ active: activePanel === 'items' }" @click="activePanel = 'items'">Itens para conferir <span>{{ counts.items }}</span></button>
        <button :aria-pressed="activePanel === 'batches'" :class="{ active: activePanel === 'batches' }" @click="activePanel = 'batches'">Lotes de origem <span>{{ conference.batches.length }}</span></button>
      </nav>
      <div class="monthly-review-links"><RouterLink class="text-button" :to="{ path: '/conflitos-notas', query: { companyId: conference.companyId } }">Resolver conflitos →</RouterLink>
          <RouterLink class="text-button" :to="{ path: '/revisao-documental', query: { companyId: conference.companyId } }">Revisar eventos relacionados às notas da empresa →</RouterLink></div>

      <section v-show="activePanel === 'summary'" class="panel-stack" aria-label="Resumo do mês">
        <aside class="conference-note"><span class="info-icon" aria-hidden="true">i</span><div><strong>Conferência dos resultados salvos</strong><p>Compras e vendas são conferidas separadamente. Créditos de compras e saldo de ICMS a recolher ainda não são apurados.</p></div></aside>
        <div v-if="!counts.documents" class="card empty-panel"><h4>Nenhuma nota encontrada neste mês</h4><p>Consulte outro período ou confira a empresa e a emissão das notas no Histórico.</p><RouterLink class="button secondary" to="/lotes">Abrir Histórico</RouterLink></div>
        <article v-for="group in conference.summary.groups" :key="groupKey(group)" class="card operation-card">
          <header class="operation-header"><div class="operation-title"><span class="operation-icon" aria-hidden="true">{{ group.perspective === 'SALES' ? '↗' : group.perspective === 'PURCHASES' ? '↙' : '↔' }}</span><div><h4>{{ perspective(group.perspective) }}</h4><p>Ocorrências de notas: {{ group.counts.documents }} · Itens: {{ group.counts.items }}</p></div></div><div class="operation-tags"><span class="badge" :class="group.environment === '1' ? 'badge-blue' : 'badge-amber'">{{ environment(group.environment) }}</span><span class="badge" :class="group.authorization === 'WITH_PROTOCOL' ? 'badge-green' : 'badge-amber'">{{ group.authorization === 'WITH_PROTOCOL' ? 'Com protocolo associado' : 'Subtotal provisório' }}</span></div></header>
          <p v-if="group.authorization !== 'WITH_PROTOCOL'" class="provisional-note">Sem protocolo de autorização confirmado.</p>
          <dl class="operation-values"><div><dt>Base calculada</dt><dd>{{ currency(group.totals.calculatedBase) }}</dd></div><div class="value-highlight"><dt>ICMS calculado</dt><dd>{{ currency(group.totals.calculatedIcms) }}</dd></div><div><dt>ICMS declarado elegível</dt><dd>{{ currency(group.totals.declaredIcms) }}</dd></div><div><dt>ICMS diferido conhecido</dt><dd>{{ currency(group.totals.deferredIcms) }}</dd></div></dl>
          <div class="group-status"><span><i class="dot green" aria-hidden="true"></i>{{ group.counts.calculated }} calculados</span><span><i class="dot amber" aria-hidden="true"></i>{{ group.counts.pending }} pendentes</span><span>{{ group.counts.unsupported }} fora do escopo</span><span>{{ group.counts.excluded }} excluídos</span><button class="text-button" @click="showItems('all', groupKey(group))">Conferir itens →</button></div>
          <details class="comparison-details"><summary><span>Comparação com o XML <small>{{ group.counts.comparableItems }} itens comparáveis</small></span><span class="comparison-result" :class="{ 'has-divergence': group.counts.divergentItems > 0 }">{{ group.counts.divergentItems }} {{ group.counts.divergentItems === 1 ? 'divergência' : 'divergências' }} <span aria-hidden="true">⌄</span></span></summary><div class="comparison-body"><dl class="comparison-values"><div><dt>ICMS calculado comparável</dt><dd>{{ currency(group.totals.comparedCalculatedIcms) }}</dd></div><div><dt>ICMS declarado comparável</dt><dd>{{ currency(group.totals.comparedDeclaredIcms) }}</dd></div><div><dt>Diferença líquida</dt><dd>{{ currency(group.totals.difference) }}</dd></div><div><dt>Soma das diferenças absolutas</dt><dd>{{ currency(group.totals.absoluteDifferences) }}</dd></div></dl><p>Diferença = calculado − declarado. {{ group.counts.divergentItems }} divergências acima de R$ 0,01 por item e {{ group.counts.withinToleranceItems }} diferenças dentro da tolerância.</p><p>Declaração ausente: {{ group.counts.declaredMissing }} · inválida: {{ group.counts.declaredInvalid }} · diferimento sem informação: {{ group.counts.deferredMissing }}.</p><button v-if="group.counts.divergentItems" class="text-button" @click="showItems('divergent', groupKey(group))">Abrir itens com divergência →</button></div></details>
        </article>
        <details class="card methodology"><summary>Critérios da conferência mensal</summary><div><p>Cópias idênticas entram uma vez nos valores; as demais ficam excluídas e rastreáveis. Chaves com conteúdos diferentes ficam fora dos valores até revisão.</p><p>Notas sem empresa ou mês de emissão válido devem ser conferidas no <RouterLink to="/lotes">Histórico de lotes</RouterLink>.</p><p>Os subtotais usam os últimos cálculos salvos e mantêm separados o ambiente e a confirmação do protocolo. O Excel consulta novamente os resultados no momento da exportação.</p></div></details>
      </section>

      <section v-show="activePanel === 'items'" class="panel-stack" aria-label="Itens para conferir">
        <div class="section-heading"><div><h3>Rastreabilidade dos itens</h3><p>Confira a situação e abra a nota no lote de origem para continuar a análise.</p></div><span class="badge badge-neutral">{{ filteredItems.length }} de {{ counts.items }} itens</span></div>
        <div class="card item-toolbar"><label class="search-field"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input v-model="search" aria-label="Buscar notas, chaves e lotes" placeholder="Buscar por nota, chave ou lote"></label><div class="item-filters"><label>Situação<select v-model="statusFilter"><option value="all">Todos os itens</option><option value="divergent">Com divergência</option><option value="review">Pendências e exclusões</option><option value="CALCULATED">Calculados</option><option value="PENDING">Pendentes</option><option value="UNSUPPORTED">Fora do escopo</option><option value="EXCLUDED">Excluídos</option></select></label><label>Grupo da conferência<select v-model="groupFilter"><option value="">Todos os grupos</option><option v-for="group in conference.summary.groups" :key="groupKey(group)" :value="groupKey(group)">{{ groupLabel(group) }}</option></select></label></div></div>
        <div v-if="!filteredItems.length" class="card empty-panel"><h4>{{ counts.items ? 'Nenhum item corresponde aos filtros' : 'Nenhum item disponível neste mês' }}</h4><p>{{ counts.items ? 'Experimente outro termo ou consulte todos os itens.' : 'Escolha outro mês ou confira os documentos no Histórico.' }}</p><button v-if="counts.items" class="button secondary" @click="showItems()">Limpar filtros</button></div>
        <article v-for="entry in displayedItems" :key="`${entry.documentId}:${entry.itemNumber}`" class="card evidence-card">
          <header class="evidence-heading"><div><h4>NF-e {{ entry.documentNumber }} <span>Item {{ entry.itemNumber }}</span></h4><p>{{ entry.batchId ? batchNames.get(entry.batchId) ?? entry.batchId : 'Lote não informado' }} · {{ perspective(entry.perspective) }}</p></div><div class="evidence-actions"><span class="badge" :class="entry.status === 'CALCULATED' ? 'badge-green' : entry.status === 'PENDING' ? 'badge-amber' : 'badge-neutral'">{{ itemStatus(entry) }}</span><span v-if="entry.comparison?.status === 'DIFFERENT'" class="badge badge-rose">Divergência</span><RouterLink v-if="entry.batchId" class="text-button" :to="{ path: `/lotes/${entry.batchId}`, hash: `#item-${entry.documentId}-${entry.itemNumber}` }">Abrir item ↗</RouterLink></div></header>
          <div v-if="entry.status !== 'EXCLUDED'" class="evidence-values"><div><span>ICMS calculado</span><strong>{{ currency(entry.calculatedIcms) }}</strong></div><div><span>ICMS declarado</span><strong>{{ currency(entry.declaredIcms) }}</strong></div><div><span>Diferença</span><strong :class="{ 'difference-alert': entry.comparison?.status === 'DIFFERENT' }">{{ currency(entry.comparison?.difference) }}</strong></div></div>
          <p v-for="reason in entry.reasons" :key="reason" class="evidence-reason">{{ reason }}</p>
          <details class="evidence-trace"><summary>Chave, execução e critérios do item</summary><dl><div class="trace-key"><dt>Chave de acesso</dt><dd class="monospace">{{ entry.accessKey }}</dd></div><div><dt>Ambiente e autorização</dt><dd>{{ environment(entry.environment) }} · {{ entry.authorization === 'WITH_PROTOCOL' ? 'Com protocolo associado' : 'Sem protocolo confirmado' }}</dd></div><div><dt>Execução / motor</dt><dd class="monospace">{{ entry.runId ?? 'Não salva' }} / {{ entry.engineVersion ?? 'Indisponível' }}</dd></div><div><dt>Lote de origem</dt><dd class="monospace">{{ entry.batchId ?? 'Não informado' }}</dd></div><div><dt>ICMS diferido conhecido</dt><dd>{{ currency(entry.deferredIcms) }}</dd></div><div v-if="entry.comparison"><dt>Conferência com o XML</dt><dd>{{ entry.comparison.status === 'DIFFERENT' ? 'Divergência' : entry.comparison.status === 'WITHIN_TOLERANCE' ? 'Dentro da tolerância' : 'Confere' }} · tolerância {{ currency(entry.comparison.tolerance) }}</dd></div></dl></details>
        </article>
        <div v-if="filteredItems.length" class="pagination"><span>{{ page * pageSize + 1 }}–{{ Math.min((page + 1) * pageSize, filteredItems.length) }} de {{ filteredItems.length }} itens</span><div><button class="button secondary" :disabled="page === 0" @click="page--">← Anterior</button><span>Página {{ page + 1 }} de {{ pageCount }}</span><button class="button secondary" :disabled="page + 1 >= pageCount" @click="page++">Próxima →</button></div></div>
      </section>

      <section v-show="activePanel === 'batches'" class="panel-stack" aria-label="Lotes de origem">
        <div class="section-heading"><div><h3>Lotes relacionados à consulta</h3><p>Inclui lotes com notas do mês e ocorrências de outras datas relacionadas por chave ou evento.</p></div><span class="badge badge-neutral">{{ conference.batches.length }} lotes</span></div>
        <RouterLink v-for="batch in conference.batches" :key="batch.id" class="card batch-card" :to="`/lotes/${batch.id}`"><span class="batch-icon" aria-hidden="true">▤</span><div><h4>{{ batch.name }}</h4><p>{{ batchDocumentCount(batch.id) ? `${batchDocumentCount(batch.id)} ocorrências de notas neste mês` : 'Relacionado por chave ou evento, sem notas deste mês' }}</p><small class="monospace">{{ batch.id }}</small></div><span class="badge badge-neutral">{{ batchStatus(batch.status) }}</span><span class="batch-arrow" aria-hidden="true">↗</span></RouterLink>
        <div v-if="!conference.batches.length" class="card empty-panel"><h4>Nenhum lote relacionado</h4><p>Os lotes aparecem aqui quando houver notas ou ocorrências relacionadas ao período.</p><RouterLink class="button secondary" to="/lotes">Abrir Histórico</RouterLink></div>
      </section>
    </template>
  </section>
</template>

<style scoped>
.monthly-review-links { display: flex; gap: 18px; flex-wrap: wrap; margin: 18px 0; }
.monthly-conference { color: #243650; }
.monthly-header { display: flex; justify-content: space-between; align-items: center; gap: 24px; margin-bottom: 28px; }
.monthly-header h2 { margin: 12px 0 10px; color: #15243d; font-size: clamp(26px, 2.6vw, 34px); font-weight: 750; letter-spacing: -.035em; }
.monthly-header p { margin: 0; color: #6b7d95; font-size: 13px; line-height: 1.6; }
.export-action { display: grid; justify-items: end; gap: 9px; flex: none; }
.export-action small { color: #72829a; font-size: 10px; }
.button { gap: 9px; }
.button svg, .search-field svg { width: 17px; height: 17px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.monthly-filters { display: flex; align-items: end; gap: 16px; padding: 22px 24px; margin-bottom: 28px; }
.monthly-filters label { display: grid; gap: 8px; min-width: 0; color: #62758e; font-size: 12px; font-weight: 600; }
.company-field { flex: 1; } .period-field { width: 190px; flex: none; }
.monthly-filters select, .monthly-filters input { font-size: 13px; min-width: 0; }
.monthly-filters .button { flex: none; min-height: 44px; }
.feedback { margin: 0 0 24px; font-size: 12px; }
.feedback .text-button { margin-left: 12px; }
.result-heading { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin: 0 0 22px; }
.result-heading h3 { margin: 0 0 7px; color: #2a3e5b; font-size: 17px; letter-spacing: -.025em; overflow-wrap: anywhere; }
.result-heading p { margin: 0; color: #6b7e98; font-size: 12px; }
.updated-at { color: #74869e; font-size: 10px; flex: none; }
.updated-at > span { color: #429a7e; margin-right: 5px; font-size: 8px; }
.monthly-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 28px; }
.metric { display: flex; flex-direction: column; align-items: stretch; padding: 19px 20px; text-align: left; font-family: inherit; }
button.metric { cursor: pointer; transition: border-color .15s, box-shadow .15s; }
button.metric:hover { border-color: #bbcafa; box-shadow: 0 8px 22px #2439520c; }
.metric-caption { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11px; color: #667a95; }
.metric-icon { display: grid; place-items: center; width: 27px; height: 27px; flex: none; background: #eef2fd; color: #6580d6; border-radius: 8px; font-size: 17px; }
.metric-icon.green { color: #398f73; background: #eaf5f0; } .metric-icon.rose { color: #be6a79; background: #fff0f3; } .metric-icon.amber { color: #b48b3c; background: #fff7e8; }
.metric strong { display: block; margin: 14px 0 8px; color: #22344e; font-size: 29px; font-weight: 750; letter-spacing: -.04em; font-variant-numeric: tabular-nums; }
.metric-denominator { color: #8797ac; font-size: 16px; font-weight: 500; }
.metric small { color: #687a92; font-size: 10px; line-height: 1.6; }
.monthly-navigation { display: flex; gap: 26px; margin-bottom: 24px; border-bottom: 1px solid #dfe6f0; overflow-x: auto; }
.monthly-navigation button { display: flex; align-items: center; gap: 8px; flex: none; padding: 0 1px 15px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: #70839d; font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
.monthly-navigation button.active { color: #455fdb; border-bottom-color: #455fdb; }
.monthly-navigation button span { padding: 2px 6px; border-radius: 5px; background: #eef1f6; font-size: 10px; }
.monthly-navigation button.active span { background: #eaf0ff; }
button.metric:focus-visible, .monthly-navigation button:focus-visible, .text-button:focus-visible, .batch-card:focus-visible { outline: 3px solid #455fdb50; outline-offset: 3px; }
.panel-stack { display: grid; gap: 20px; }
.conference-note { display: flex; align-items: start; gap: 13px; padding: 16px 18px; border: 1px solid #e1e8f5; border-radius: 10px; background: #eef3fc; }
.info-icon { display: grid; place-items: center; flex: none; width: 20px; height: 20px; border: 1px solid #aabbdc; border-radius: 50%; color: #6581b1; font-size: 12px; }
.conference-note strong { color: #50688e; font-size: 12px; }
.conference-note p { margin: 6px 0 0; color: #6b7f9e; font-size: 12px; line-height: 1.65; }
.operation-card { padding: 24px; overflow: hidden; }
.operation-header { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
.operation-title { display: flex; align-items: center; gap: 13px; }
.operation-icon { display: grid; place-items: center; width: 39px; height: 39px; flex: none; border-radius: 10px; color: #6a81c5; background: #f0f4fd; font-size: 21px; }
.operation-header h4 { margin: 0 0 6px; color: #2b405f; font-size: 16px; }
.operation-header p { margin: 0; color: #7387a2; font-size: 11px; }
.operation-tags, .evidence-actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; justify-content: end; }
.badge { display: inline-flex; align-items: center; flex: none; padding: 5px 9px; border-radius: 6px; font-size: 10px; line-height: 1.4; font-weight: 700; }
.badge-neutral { color: #60718a; background: #f0f3f8; } .badge-blue { color: #4266af; background: #edf3ff; }
.badge-green { color: #278367; background: #e9f6f0; } .badge-amber { color: #946c20; background: #fff5df; } .badge-rose { color: #bd5360; background: #fff0f2; }
.provisional-note { margin: 14px 0 0; color: #8a6b35; font-size: 11px; }
.operation-values, .comparison-values { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin: 22px 0 18px; }
.operation-values > div { min-width: 0; padding: 15px; border-radius: 9px; background: #f8fafd; }
.operation-values .value-highlight { background: #edf2ff; }
.operation-values dt, .comparison-values dt { color: #6e809a; font-size: 10px; line-height: 1.5; }
.operation-values dd { margin: 10px 0 0; color: #385272; font-size: clamp(17px, 1.6vw, 22px); font-weight: 700; letter-spacing: -.025em; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.value-highlight dd { color: #4b64cb; }
.group-status { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; color: #71859f; font-size: 11px; }
.group-status > span { display: inline-flex; align-items: center; gap: 6px; }
.dot { width: 6px; height: 6px; border-radius: 50%; } .dot.green { background: #47a083; } .dot.amber { background: #ceaa56; }
.group-status .text-button { margin-left: auto; }
.text-button { padding: 0; border: 0; background: transparent; color: #5572bd; font-family: inherit; font-size: 12px; cursor: pointer; text-decoration: none; }
.text-button:hover { color: #344bc5; text-decoration: underline; }
.comparison-details { margin-top: 20px; border-top: 1px solid #e9eef6; }
.comparison-details > summary { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding-top: 18px; list-style: none; color: #687e9e; font-size: 12px; font-weight: 600; }
.comparison-details > summary::-webkit-details-marker { display: none; }
.comparison-details summary small { margin-left: 10px; color: #7e8fa7; font-size: 10px; font-weight: 400; }
.comparison-result { color: #4f8b77; font-size: 11px; flex: none; }
.comparison-result.has-divergence { color: #bd5360; }
.comparison-result > span { display: inline-block; margin-left: 8px; }
.comparison-details[open] .comparison-result > span { transform: rotate(180deg); }
.comparison-values { margin: 20px 0 15px; }
.comparison-values dd { margin: 7px 0 0; color: #5d7598; font-size: 13px; font-weight: 700; }
.comparison-body p { color: #7185a1; font-size: 11px; line-height: 1.7; margin: 10px 0; }
.comparison-body .text-button { margin-top: 6px; }
.methodology { padding: 20px 24px; font-size: 12px; color: #677e9f; }
.methodology summary { font-weight: 600; }
.methodology p { margin: 14px 0 0; line-height: 1.7; color: #6e829e; }
.section-heading { display: flex; align-items: start; justify-content: space-between; gap: 20px; }
.section-heading h3 { margin: 0 0 8px; color: #263955; font-size: 18px; letter-spacing: -.025em; }
.section-heading p { margin: 0; color: #64768f; font-size: 12px; line-height: 1.65; }
.item-toolbar { padding: 18px; display: grid; gap: 14px; }
.search-field { display: flex; align-items: center; gap: 9px; min-width: 0; color: #899bb5; }
.search-field input { min-width: 0; border: 0; background: transparent; font-size: 13px; }
.item-filters { display: flex; gap: 14px; padding-top: 14px; border-top: 1px solid #edf1f7; }
.item-filters label { display: grid; gap: 7px; min-width: 0; flex: 1; color: #6e819b; font-size: 11px; }
.item-filters select { font-size: 12px; min-width: 0; }
.evidence-card { padding: 22px 24px; }
.evidence-heading { display: flex; justify-content: space-between; align-items: start; gap: 20px; }
.evidence-heading > div:first-child { min-width: 0; }
.evidence-heading h4 { margin: 0 0 7px; color: #344a6b; font-size: 14px; }
.evidence-heading h4 > span { color: #7c90ad; font-size: 11px; font-weight: 500; margin-left: 10px; }
.evidence-heading p { margin: 0; color: #758aa6; font-size: 11px; overflow-wrap: anywhere; }
.evidence-actions .text-button { margin-left: 5px; white-space: nowrap; }
.evidence-values { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin: 18px 0; }
.evidence-values > div { padding: 12px 14px; border-radius: 7px; background: #f8fafd; }
.evidence-values span { color: #6f819b; font-size: 10px; }
.evidence-values strong { display: block; margin-top: 7px; color: #536e92; font-size: 13px; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.evidence-values .difference-alert { color: #b85c69; }
.evidence-reason { color: #8a6b35; background: #fffbf2; border: 1px solid #f0e5c9; border-radius: 7px; padding: 12px 14px; margin: 16px 0; font-size: 12px; line-height: 1.65; overflow-wrap: anywhere; }
.evidence-trace { color: #7287a6; font-size: 11px; }
.evidence-trace dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; margin: 18px 0 0; padding-top: 18px; border-top: 1px solid #edf1f7; }
.trace-key { grid-column: 1 / -1; }
.evidence-trace dt { color: #7b8fa9; font-size: 10px; }
.evidence-trace dd { margin: 6px 0 0; color: #586f90; font-size: 11px; line-height: 1.6; overflow-wrap: anywhere; }
.monospace { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 10px; overflow-wrap: anywhere; }
.pagination { display: flex; justify-content: space-between; align-items: center; gap: 16px; color: #7286a2; font-size: 11px; }
.pagination > div { display: flex; gap: 12px; align-items: center; }
.batch-card { display: flex; align-items: center; gap: 16px; padding: 24px; text-decoration: none; transition: border-color .15s; }
.batch-card:hover { border-color: #b7c7f1; }
.batch-icon { display: grid; place-items: center; width: 42px; height: 44px; flex: none; border-radius: 10px; background: #f0f4fd; color: #6a84c8; font-size: 23px; }
.batch-card > div { flex: 1; min-width: 0; }
.batch-card h4 { color: #344b6d; font-size: 14px; margin: 0 0 7px; overflow-wrap: anywhere; }
.batch-card p { color: #7288a6; font-size: 11px; line-height: 1.6; margin: 0 0 6px; }
.batch-card small { color: #7c90ae; }
.batch-arrow { color: #7a90b5; font-size: 18px; }
.loading-panel { display: flex; align-items: center; gap: 12px; padding: 32px; color: #6e829f; font-size: 13px; }
.loading-dot { width: 9px; height: 9px; border-radius: 50%; background: #7188db; }
.empty-panel, .initial-panel { padding: 38px 28px; text-align: center; }
.empty-panel h4, .initial-panel h3 { color: #3a5275; font-size: 16px; margin: 0 0 10px; }
.empty-panel p, .initial-panel p { color: #6f839f; font-size: 13px; line-height: 1.7; margin: 0 auto 22px; max-width: 530px; }
.initial-panel { padding: 58px 28px; }
.empty-icon { display: grid; place-items: center; width: 54px; height: 54px; margin: 0 auto 22px; border-radius: 14px; background: #f0f4fd; color: #8097c6; font-size: 30px; }
@media (max-width: 1150px) { .monthly-header { align-items: start; } .export-action small { max-width: 210px; text-align: right; line-height: 1.6; } .metric { padding: 16px; } .operation-values { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 1100px) { .monthly-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } .monthly-filters { flex-wrap: wrap; } .company-field { flex-basis: 100%; } .period-field { flex: 1; } .result-heading { align-items: start; flex-direction: column; gap: 10px; } }
@media (max-width: 900px) { .operation-header { align-items: start; flex-direction: column; gap: 16px; } .comparison-values { grid-template-columns: repeat(2, minmax(0, 1fr)); } .comparison-details summary small { display: block; margin: 5px 0 0; } .pagination { align-items: start; flex-direction: column; } }
@media (max-width: 650px) {
  .monthly-header { flex-direction: column; align-items: stretch; } .export-action { justify-items: start; } .export-action small { max-width: none; text-align: left; }
  .monthly-filters { padding: 20px; } .monthly-navigation { gap: 20px; }
  .item-filters { flex-direction: column; } .evidence-heading { flex-direction: column; gap: 14px; } .evidence-actions { justify-content: start; }
  .evidence-values { grid-template-columns: 1fr; } .operation-card, .evidence-card { padding: 20px; }
  .comparison-details > summary { align-items: start; } .comparison-result { font-size: 10px; }
  .evidence-trace dl { grid-template-columns: 1fr; } .batch-card { flex-wrap: wrap; padding: 20px; } .batch-card > div { flex-basis: calc(100% - 58px); }
  .batch-card > .badge { margin-left: 58px; } .pagination > div { flex-wrap: wrap; } .group-status .text-button { margin-left: 0; }
}
</style>
