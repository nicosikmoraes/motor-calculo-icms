<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import type { CompanySummary, DashboardBatchSummary, DashboardCounts, WorkspaceState } from '@motor/contracts'
import AppIcon from '../components/AppIcon.vue'
import bannerUrl from '../assets/companies-banner.webp'
import { RendererErrorMessage } from '../error-messages'

const route = useRoute()
const router = useRouter()
const workspace = ref<WorkspaceState>({ companies: [] })
const batches = ref<readonly DashboardBatchSummary[]>([])
const loading = ref(true)
const activityReady = ref(false)
const loadError = ref('')
const activityError = ref('')
const formError = ref('')
const success = ref('')
const revisionConflict = ref(false)
const saving = ref(false)
const search = ref('')
const statusFilter = ref('all')
const stateFilter = ref('')
const legalName = ref('')
const tradeName = ref('')
const cnpj = ref('')
const state = ref('')
const editingRevision = ref(0)
const officeName = ref('')
const officeRevision = ref(0)
const legalInput = ref<HTMLInputElement | null>(null)
const officeInput = ref<HTMLInputElement | null>(null)
const lotsSection = ref<HTMLElement | null>(null)
const states = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']

function message(cause: unknown, fallback: string): string { return cause instanceof Error ? cause.message : fallback }
function displayName(company: CompanySummary): string { return company.tradeName || company.legalName }
function initials(company: CompanySummary): string { return displayName(company).trim().split(/\s+/).slice(0, 2).map(word => word[0]).join('').toLocaleUpperCase('pt-BR') }
function formatCnpj(value: string): string { return value.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') }
function dateTime(value: string): string {
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date) : 'Data não informada'
}
function emptyCounts(): DashboardCounts { return { receivedNotes: 0, calculatedNotes: 0, pendingNotes: 0, excludedNotes: 0, blockedNotes: 0, reviewNotes: 0, pendingItems: 0, divergentItems: 0 } }
const activity = computed(() => {
  const result = new Map<string, { counts: DashboardCounts; batches: DashboardBatchSummary[] }>()
  for (const batch of batches.value) for (const company of batch.companies) {
    if (!company.companyId) continue
    let row = result.get(company.companyId)
    if (!row) { row = { counts: emptyCounts(), batches: [] }; result.set(company.companyId, row) }
    for (const field of Object.keys(row.counts) as (keyof DashboardCounts)[]) row.counts[field] += company[field]
    row.batches.push(batch)
  }
  return result
})
function companyActivity(id: string) { return activity.value.get(id) ?? { counts: emptyCounts(), batches: [] as DashboardBatchSummary[] } }
function attentionItems(id: string): number { const counts = companyActivity(id).counts; return counts.pendingItems + counts.divergentItems }
function hasAttention(id: string): boolean { return attentionItems(id) + companyActivity(id).counts.reviewNotes > 0 }
function count(value: number): string { return activityReady.value ? value.toLocaleString('pt-BR') : '—' }
const activeCount = computed(() => workspace.value.companies.filter(company => company.active).length)
const attentionCompanies = computed(() => workspace.value.companies.filter(company => hasAttention(company.id)).length)
const availableStates = computed(() => [...new Set(workspace.value.companies.map(company => company.state))].sort())
const visibleCompanies = computed(() => {
  const query = search.value.trim().toLocaleLowerCase('pt-BR')
  const numeric = /^[\d.\/\-\s]+$/.test(query) ? query.replace(/\D/g, '') : ''
  return workspace.value.companies.filter(company => {
    const matchesName = [company.legalName, company.tradeName, company.cnpj].some(value => value?.toLocaleLowerCase('pt-BR').includes(query))
    const matchesCnpj = numeric.length > 0 && company.cnpj.replace(/\D/g, '').includes(numeric)
    return (!query || matchesName || matchesCnpj) && (statusFilter.value === 'all' || company.active === (statusFilter.value === 'active')) && (!stateFilter.value || company.state === stateFilter.value)
  }).slice().sort((a, b) => Number(b.active) - Number(a.active) || displayName(a).localeCompare(displayName(b), 'pt-BR'))
})
const selectedCompany = computed(() => workspace.value.companies.find(company => company.id === route.query.companyId))
const screen = computed(() => {
  if (route.query.view === 'create') return 'create'
  if (route.query.view === 'office') return 'office'
  if (route.query.companyId && !selectedCompany.value) return loading.value ? 'loading' : 'missing'
  if (selectedCompany.value) return route.query.view === 'edit' ? 'edit' : 'company'
  return 'cards'
})
const selectedActivity = computed(() => companyActivity(selectedCompany.value?.id ?? ''))
const selectedPercent = computed(() => selectedActivity.value.counts.receivedNotes ? Math.round(selectedActivity.value.counts.calculatedNotes / selectedActivity.value.counts.receivedNotes * 100) : 0)
const pageTitle = computed(() => ({ cards: 'Empresas', create: 'Cadastrar empresa', edit: 'Editar empresa', office: 'Escritório responsável', missing: 'Empresa não encontrada', loading: 'Empresas', company: selectedCompany.value ? displayName(selectedCompany.value) : 'Empresa' })[screen.value])

async function load(): Promise<void> {
  loading.value = true; loadError.value = ''; activityError.value = ''
  const [savedWorkspace, savedBatches] = await Promise.allSettled([window.desktopApi.getWorkspace(), window.desktopApi.getDashboard()])
  if (savedWorkspace.status === 'fulfilled') workspace.value = savedWorkspace.value
  else loadError.value = message(savedWorkspace.reason, RendererErrorMessage.REGISTRATIONS_LOAD)
  if (savedBatches.status === 'fulfilled') { batches.value = savedBatches.value; activityReady.value = true }
  else { activityReady.value = false; activityError.value = message(savedBatches.reason, 'Não foi possível consultar o histórico das empresas.') }
  loading.value = false
}
async function prepareForm(): Promise<void> {
  formError.value = ''; revisionConflict.value = false
  if (screen.value === 'edit' && selectedCompany.value) {
    const company = selectedCompany.value
    legalName.value = company.legalName; tradeName.value = company.tradeName ?? ''; cnpj.value = company.cnpj; state.value = company.state; editingRevision.value = company.revision
  } else if (screen.value === 'create') { legalName.value = ''; tradeName.value = ''; cnpj.value = ''; state.value = '' }
  else if (screen.value === 'office') { officeName.value = workspace.value.organization?.name ?? ''; officeRevision.value = workspace.value.organization?.revision ?? 1 }
  await nextTick()
  if (screen.value === 'create' || screen.value === 'edit') legalInput.value?.focus()
  if (screen.value === 'office') officeInput.value?.focus()
  if (screen.value === 'company' && route.query.aba === 'lotes') lotsSection.value?.scrollIntoView({ block: 'start' })
}
async function navigate(query: Record<string, string> = {}): Promise<void> { if (!saving.value) { success.value = ''; await router.push({ path: '/empresas', query }) } }
async function openCompany(company: CompanySummary, tab?: string): Promise<void> { await navigate({ companyId: company.id, ...(tab ? { aba: tab } : {}) }) }
async function reloadConflict(): Promise<void> { await load(); if (!loadError.value) await prepareForm() }
function updateLocalCompany(company: CompanySummary): void {
  const exists = workspace.value.companies.some(entry => entry.id === company.id)
  workspace.value = { ...workspace.value, companies: exists ? workspace.value.companies.map(entry => entry.id === company.id ? company : entry) : [...workspace.value.companies, company] }
}
async function saveCompany(): Promise<void> {
  if (saving.value) return
  formError.value = ''; success.value = ''; revisionConflict.value = false
  if (!legalName.value.trim()) { formError.value = 'Informe a razão social da empresa.'; legalInput.value?.focus(); return }
  const editing = screen.value === 'edit', company = selectedCompany.value
  if (!editing && cnpj.value.replace(/\D/g, '').length !== 14) { formError.value = 'Informe os 14 dígitos do CNPJ.'; return }
  if (editing && !company) return
  saving.value = true
  let saved: CompanySummary
  try {
    saved = editing && company ? await window.desktopApi.updateCompany({ id: company.id, expectedRevision: editingRevision.value, legalName: legalName.value.trim(), tradeName: tradeName.value.trim(), state: state.value })
      : await window.desktopApi.createCompany({ legalName: legalName.value.trim(), ...(tradeName.value.trim() ? { tradeName: tradeName.value.trim() } : {}), cnpj: cnpj.value, state: state.value })
  } catch (cause) { formError.value = message(cause, editing ? RendererErrorMessage.OPERATION_FAILED : RendererErrorMessage.COMPANY_CREATE); revisionConflict.value = formError.value.includes('Recarregue os dados'); return }
  finally { saving.value = false }
  updateLocalCompany(saved)
  await router.push({ path: '/empresas', query: { companyId: saved.id } })
  await load()
  success.value = editing ? 'Cadastro atualizado.' : `${saved.legalName} foi cadastrada.`
}
async function saveOffice(): Promise<void> {
  if (saving.value) return
  saving.value = true; formError.value = ''; success.value = ''; revisionConflict.value = false
  try {
    const organization = await window.desktopApi.renameOrganization({ name: officeName.value.trim(), expectedRevision: officeRevision.value })
    workspace.value = { ...workspace.value, organization }
  } catch (cause) { formError.value = message(cause, RendererErrorMessage.OFFICE_UPDATE); revisionConflict.value = formError.value.includes('Recarregue os dados'); return }
  finally { saving.value = false }
  await router.push('/empresas'); await load(); success.value = 'Nome do escritório atualizado.'
}
async function changeCompanyStatus(company: CompanySummary): Promise<void> {
  if (saving.value) return
  saving.value = true; formError.value = ''; success.value = ''; revisionConflict.value = false
  try {
    const input = { id: company.id, expectedRevision: company.revision }
    const saved = company.active ? await window.desktopApi.inactivateCompany(input) : await window.desktopApi.reactivateCompany(input)
    updateLocalCompany(saved)
    success.value = saved.active ? 'Empresa reativada para novas importações.' : 'Empresa inativada. O histórico foi preservado.'
  } catch (cause) { formError.value = message(cause, RendererErrorMessage.OPERATION_FAILED); revisionConflict.value = formError.value.includes('Recarregue os dados') }
  finally { saving.value = false }
  if (!formError.value) await load()
}
function cardStatus(company: CompanySummary): string {
  if (!activityReady.value) return 'Histórico indisponível no momento.'
  if (!company.active) return 'Histórico disponível. Fora das novas importações.'
  const row = companyActivity(company.id), counts = row.counts
  if (!row.batches.length) return 'Nenhum lote importado para esta empresa.'
  if (hasAttention(company.id)) return `${counts.pendingItems} item(ns) pendente(s) · ${counts.divergentItems} divergente(s)${counts.reviewNotes ? ` · ${counts.reviewNotes} nota(s) em revisão` : ''}`
  if (counts.blockedNotes) return `${counts.blockedNotes} nota(s) fora dos totais pela política documental.`
  return 'Sem itens de cálculo pendentes nos lotes importados.'
}
function batchCounts(batch: DashboardBatchSummary) { return batch.companies.find(company => company.companyId === selectedCompany.value?.id) ?? emptyCounts() }
function batchRoute(batch: DashboardBatchSummary) {
  const counts = batchCounts(batch)
  return { path: `/lotes/${batch.id}`, query: counts.pendingItems + counts.divergentItems > 0 ? { painel: 'pending' } : {} }
}
watch([() => route.query.view, () => route.query.companyId, () => route.query.aba], prepareForm)
onMounted(async () => { await load(); await prepareForm() })
</script>

<template>
  <section class="companies-view" :aria-busy="loading">
    <header class="cmp-heading">
      <div><p class="eyebrow">{{ workspace.organization?.name || 'Meu escritório' }}</p><h2>{{ pageTitle }}</h2></div>
      <div class="cmp-heading-actions">
        <button v-if="screen === 'cards' || screen === 'company'" class="cmp-button" type="button" :disabled="loading || saving" @click="load"><AppIcon name="refresh" />Atualizar</button>
        <button v-if="screen === 'cards'" class="cmp-button" type="button" :disabled="saving" @click="navigate({ view: 'office' })"><AppIcon name="briefcase" />Escritório</button>
        <button v-if="screen === 'company' && selectedCompany" class="cmp-button" type="button" :disabled="saving" @click="navigate({ companyId: selectedCompany.id, view: 'edit' })"><AppIcon name="pencil" />Editar cadastro</button>
      </div>
    </header>

    <p v-if="loadError" class="form-error notice" role="alert">{{ loadError }} <button class="cmp-link" type="button" :disabled="loading" @click="load">Recarregar dados</button></p>
    <p v-if="activityError" class="cmp-warning" role="status">Os cadastros continuam disponíveis, mas os resumos dos lotes não puderam ser atualizados. <button class="cmp-link" type="button" :disabled="loading" @click="load">Tentar novamente</button></p>
    <p v-if="success" class="form-success notice" role="status">{{ success }}</p>
    <p v-if="formError" class="form-error notice" role="alert">{{ formError }} <button v-if="revisionConflict" class="cmp-link" type="button" :disabled="loading || saving" @click="reloadConflict">Recarregar cadastro</button></p>

    <template v-if="screen === 'cards'">
      <section class="cmp-banner" aria-label="Gestão das empresas">
        <img :src="bannerUrl" alt="Contadora e empresário conferindo documentos em uma reunião" width="2172" height="724" fetchpriority="high" />
        <div class="cmp-banner-copy"><h3>Cada empresa,<br>com seu espaço.</h3><p>Cadastros, documentos e histórico organizados pelo CNPJ.</p><div class="cmp-banner-actions"><button type="button" class="cmp-button" :disabled="saving" @click="navigate({ view: 'create' })"><AppIcon name="plus" />Cadastrar empresa</button><RouterLink class="cmp-button cmp-transparent" to="/lotes/novo">Importar notas</RouterLink></div></div>
      </section>
      <div class="cmp-summary" aria-live="polite"><div><span>Empresas ativas</span><strong>{{ loading && !workspace.organization ? '—' : activeCount }}</strong></div><div><span>Com pontos a conferir</span><strong>{{ count(attentionCompanies) }}</strong></div><div><span>Empresas inativas</span><strong>{{ loading && !workspace.organization ? '—' : workspace.companies.length - activeCount }}</strong></div></div>
      <div class="cmp-filters"><label class="cmp-field"><span>Buscar empresa ou CNPJ</span><span class="cmp-search"><AppIcon name="search" /><input v-model="search" type="search" placeholder="Nome, razão social ou CNPJ" /></span></label><label class="cmp-field"><span>Situação</span><select v-model="statusFilter"><option value="all">Todas</option><option value="active">Ativas</option><option value="inactive">Inativas</option></select></label><label class="cmp-field"><span>Estado</span><select v-model="stateFilter"><option value="">Todos</option><option v-for="uf in availableStates" :key="uf" :value="uf">{{ uf }}</option></select></label></div>
      <div class="cmp-results-heading"><h3>{{ visibleCompanies.length }} empresa(s) encontrada(s)</h3><span>Sua carteira, em um só lugar</span></div>
      <p v-if="loading && !workspace.organization" class="cmp-empty" role="status">Carregando empresas…</p>
      <div v-else-if="!visibleCompanies.length" class="cmp-panel cmp-empty"><p>{{ workspace.companies.length ? 'Nenhuma empresa corresponde aos filtros selecionados.' : 'Cadastre a primeira empresa para organizar suas notas pelo CNPJ.' }}</p><button v-if="workspace.companies.length" class="cmp-link" type="button" @click="search = ''; statusFilter = 'all'; stateFilter = ''">Limpar filtros</button><button v-else class="cmp-button cmp-primary" type="button" @click="navigate({ view: 'create' })">Cadastrar empresa</button></div>
      <div v-else class="cmp-card-grid">
        <article v-for="company in visibleCompanies" :key="company.id" class="cmp-company-card">
          <div class="cmp-card-body">
            <div class="cmp-card-heading"><div class="cmp-avatar" :class="{ inactive: !company.active }">{{ initials(company) }}</div><div><h3>{{ displayName(company) }}</h3><small>{{ formatCnpj(company.cnpj) }}</small></div></div>
            <div class="cmp-card-meta"><span class="cmp-badge" :class="{ inactive: !company.active }">{{ company.active ? 'Ativa' : 'Inativa' }}</span><span>{{ company.state }} · {{ company.legalName }}</span></div>
            <div class="cmp-card-facts"><div><b>{{ count(companyActivity(company.id).counts.receivedNotes) }}</b><span>notas</span></div><div><b>{{ count(companyActivity(company.id).batches.length) }}</b><span>lotes</span></div><div><b>{{ count(attentionItems(company.id)) }}</b><span>itens a conferir</span></div></div>
            <p class="cmp-card-status"><AppIcon :name="!company.active ? 'archive' : hasAttention(company.id) ? 'document-check' : 'check'" /><span>{{ cardStatus(company) }}</span></p>
          </div>
          <footer class="cmp-card-footer"><button class="cmp-button" type="button" :disabled="saving" @click="openCompany(company)">Abrir empresa</button><button class="cmp-link" type="button" :disabled="saving" @click="openCompany(company, 'lotes')">Ver lotes</button><button class="cmp-link" type="button" :disabled="saving" @click="navigate({ companyId: company.id, view: 'edit' })">Editar</button></footer>
        </article>
      </div>
      <aside class="cmp-office-panel"><div><strong>{{ workspace.organization?.name || 'Meu escritório' }}</strong><small>Escritório responsável por esta carteira</small></div><button class="cmp-link" type="button" :disabled="saving" @click="navigate({ view: 'office' })">Editar escritório</button></aside>
      <p class="cmp-note"><AppIcon name="info" /><span>Os resumos mostram todo o histórico dos lotes. Empresas inativas mantêm seus cadastros e documentos disponíveis.</span></p>
    </template>

    <template v-else-if="screen === 'create' || screen === 'edit'">
      <button class="cmp-link cmp-back" type="button" :disabled="saving" @click="navigate()">Voltar às empresas</button>
      <section class="cmp-panel"><header class="cmp-panel-heading"><div><h3>{{ screen === 'edit' ? 'Dados cadastrais' : 'Nova empresa' }}</h3><p>O CNPJ conecta o cadastro às notas importadas.</p></div></header>
        <form class="cmp-form" @submit.prevent="saveCompany"><fieldset :disabled="saving">
          <label class="cmp-field"><span>Razão social</span><input ref="legalInput" v-model="legalName" required maxlength="200" autocomplete="organization" placeholder="Razão social da empresa" /></label>
          <label class="cmp-field"><span>Nome fantasia <small>(opcional)</small></span><input v-model="tradeName" maxlength="200" placeholder="Como você identifica esta empresa" /></label>
          <div class="cmp-form-two"><label class="cmp-field"><span>CNPJ</span><input v-model="cnpj" inputmode="numeric" :readonly="screen === 'edit'" placeholder="00.000.000/0000-00" required maxlength="18" /><small>{{ screen === 'edit' ? 'O CNPJ é o vínculo com as notas e não pode ser alterado.' : 'Informe os 14 dígitos do CNPJ.' }}</small></label><label class="cmp-field"><span>UF</span><select v-model="state" required><option value="" disabled>Selecione</option><option v-for="uf in states" :key="uf" :value="uf">{{ uf }}</option></select></label></div>
          <div class="cmp-form-actions"><button class="cmp-button cmp-primary" type="submit">{{ saving ? 'Salvando…' : screen === 'edit' ? 'Salvar alterações' : 'Cadastrar empresa' }}</button><button class="cmp-button" type="button" @click="selectedCompany ? openCompany(selectedCompany) : navigate()">Cancelar</button></div>
        </fieldset></form>
      </section>
    </template>

    <template v-else-if="screen === 'office'">
      <button class="cmp-link cmp-back" type="button" :disabled="saving" @click="navigate()">Voltar às empresas</button>
      <section class="cmp-panel"><header class="cmp-panel-heading"><div><h3>Identificação do escritório</h3><p>Este nome aparece nas telas do seu espaço de trabalho.</p></div></header><form class="cmp-form" @submit.prevent="saveOffice"><fieldset :disabled="saving"><label class="cmp-field"><span>Nome do escritório</span><input ref="officeInput" v-model="officeName" maxlength="160" required /></label><div class="cmp-form-actions"><button class="cmp-button cmp-primary" type="submit">{{ saving ? 'Salvando…' : 'Salvar nome' }}</button><button class="cmp-button" type="button" @click="navigate()">Cancelar</button></div></fieldset></form></section>
    </template>

    <template v-else-if="screen === 'company' && selectedCompany">
      <button class="cmp-link cmp-back" type="button" :disabled="saving" @click="navigate()">Todas as empresas</button>
      <section class="cmp-panel"><header class="cmp-panel-heading"><div><h3>{{ selectedCompany.legalName }}</h3><p>{{ formatCnpj(selectedCompany.cnpj) }} · {{ selectedCompany.state }}</p></div><span class="cmp-badge" :class="{ inactive: !selectedCompany.active }">{{ selectedCompany.active ? 'Ativa' : 'Inativa' }}</span></header><div class="cmp-detail-body"><div class="cmp-detail-facts"><div><b>{{ count(selectedActivity.counts.receivedNotes) }}</b><span>notas recebidas</span></div><div><b>{{ count(selectedActivity.batches.length) }}</b><span>lotes</span></div><div><b>{{ count(attentionItems(selectedCompany.id)) }}</b><span>itens a conferir</span></div></div><template v-if="activityReady"><div class="cmp-progress-label"><span>Notas calculadas</span><span>{{ selectedActivity.counts.calculatedNotes }} de {{ selectedActivity.counts.receivedNotes }}</span></div><div class="cmp-progress" role="progressbar" aria-label="Percentual de notas calculadas" :aria-valuenow="selectedPercent" aria-valuemin="0" aria-valuemax="100"><span :style="{ width: `${selectedPercent}%` }"></span></div><p class="cmp-note"><AppIcon name="info" /><span>{{ selectedActivity.counts.excludedNotes }} nota(s) sem itens com CFOP elegível · {{ selectedActivity.counts.blockedNotes }} fora dos totais · {{ selectedActivity.counts.reviewNotes }} em revisão documental. Cálculos e pendências referem-se às memórias salvas.</span></p></template></div></section>
      <div class="cmp-detail-grid">
        <section class="cmp-panel"><header class="cmp-panel-heading"><h3>Dados cadastrais</h3></header><dl class="cmp-data-list"><div><dt>Razão social</dt><dd>{{ selectedCompany.legalName }}</dd></div><div><dt>Nome fantasia</dt><dd>{{ selectedCompany.tradeName || 'Não informado' }}</dd></div><div><dt>CNPJ</dt><dd>{{ formatCnpj(selectedCompany.cnpj) }}</dd></div><div><dt>UF e situação</dt><dd>{{ selectedCompany.state }} · {{ selectedCompany.active ? 'Ativa' : 'Inativa' }}</dd></div></dl><footer class="cmp-panel-actions"><button class="cmp-link" type="button" :disabled="saving || loading" @click="changeCompanyStatus(selectedCompany)">{{ saving ? 'Salvando…' : selectedCompany.active ? 'Inativar empresa' : 'Reativar empresa' }}</button></footer></section>
        <section ref="lotsSection" class="cmp-panel cmp-company-lots"><header class="cmp-panel-heading"><div><h3>Histórico desta empresa</h3><p>Contagens da empresa em cada lote</p></div><RouterLink v-if="selectedCompany.active" class="cmp-link" :to="{ path: '/lotes/novo', query: { companyCnpj: selectedCompany.cnpj } }">Importar notas</RouterLink></header><p v-if="!activityReady" class="cmp-empty">O histórico não está disponível. Use Atualizar para consultar novamente.</p><p v-else-if="!selectedActivity.batches.length" class="cmp-empty">Nenhum lote importado para esta empresa.</p><div v-else class="cmp-lots-list"><article v-for="batch in selectedActivity.batches" :key="batch.id" class="cmp-lot"><strong>{{ batch.originalName || 'Lote sem nome' }}</strong><small>{{ dateTime(batch.receivedAt) }} · {{ batchCounts(batch).receivedNotes }} nota(s) · {{ batchCounts(batch).calculatedNotes }} calculada(s)</small><div class="cmp-lot-actions"><span class="cmp-badge" :class="{ warning: batchCounts(batch).pendingItems + batchCounts(batch).divergentItems + batchCounts(batch).reviewNotes > 0 }">{{ batchCounts(batch).pendingItems + batchCounts(batch).divergentItems }} item(ns) a conferir<template v-if="batchCounts(batch).reviewNotes"> · {{ batchCounts(batch).reviewNotes }} nota(s) em revisão</template></span><RouterLink class="cmp-link" :to="batchRoute(batch)">Abrir lote</RouterLink></div></article></div></section>
      </div>
      <p v-if="!selectedCompany.active" class="cmp-note"><AppIcon name="archive" /><span>Esta empresa está inativa para novas importações. Seu histórico continua disponível.</span></p>
    </template>
    <p v-else-if="screen === 'loading'" class="cmp-empty" role="status">Carregando empresa…</p>
    <section v-else class="cmp-panel cmp-empty"><p>Esta empresa não está disponível no cadastro atual.</p><button class="cmp-link" type="button" @click="navigate()">Voltar às empresas</button></section>
  </section>
</template>

<style scoped src="../companies.css"></style>
