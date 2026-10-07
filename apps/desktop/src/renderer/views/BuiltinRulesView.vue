<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import type { BuiltinRulePackSummary, VersionedRuleSummary } from '@motor/contracts'
import { RULE_CONDITION_FIELDS } from '@motor/tax-engine'
import { RendererErrorMessage } from '../error-messages'
import VersionedRulesPanel from '../components/VersionedRulesPanel.vue'

const pack = ref<BuiltinRulePackSummary | null>(null)
const error = ref(''), loading = ref(true)
const activePanel = ref<'local' | 'builtin'>('local')
const localRules = ref<readonly VersionedRuleSummary[] | null>(null)
const localPanel = ref<InstanceType<typeof VersionedRulesPanel> | null>(null)
const editing = ref(false)
const search = ref(''), destination = ref('')
const drafts = computed(() => localRules.value?.filter(rule => rule.status === 'DRAFT').length)
const approved = computed(() => localRules.value?.filter(rule => rule.status === 'APPROVED').length)
const destinations = computed(() => [...new Set(pack.value?.rules.flatMap(rule => rule.conditions.destinationState ? [rule.conditions.destinationState] : []) ?? [])].sort())
const visibleProposals = computed(() => {
  const query = search.value.trim().toLocaleLowerCase('pt-BR').replace(',', '.')
  return pack.value?.rules.filter(rule => (!destination.value || rule.conditions.destinationState === destination.value)
    && (!query || [rule.id, rule.name, rule.legalBasis, rule.proposedRate, ...Object.values(rule.conditions)]
      .some(value => value.toLocaleLowerCase('pt-BR').includes(query)))) ?? []
})
const conditionLabels: Record<string, string> = {
  originState: 'UF de origem', destinationState: 'UF de destino', cfop: 'CFOP', issuerRegime: 'CRT do emitente',
  cst: 'CST do ICMS', merchandiseOrigin: 'Origem da mercadoria', operationType: 'Direção da operação', purpose: 'Finalidade da NF-e',
}
function date(value: string): string {
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}
function conditionValue(key: string, value: string): string {
  const option = RULE_CONDITION_FIELDS.find(field => field.key === key)?.options?.find(([code]) => code === value)
  return option && option[1] !== value ? `${value} · ${option[1]}` : value
}
async function loadPack(): Promise<void> {
  loading.value = true; error.value = ''
  try { pack.value = await window.desktopApi.getBuiltinRulePack() }
  catch (cause) { error.value = cause instanceof Error ? cause.message : RendererErrorMessage.RULE_PACK_LOAD }
  finally { loading.value = false }
}
async function startNew(): Promise<void> {
  activePanel.value = 'local'
  await nextTick()
  localPanel.value?.startNew()
}
function showLocal(status = 'all'): void {
  activePanel.value = 'local'
  localPanel.value?.filterStatus(status)
}
function clearFilters(): void { search.value = ''; destination.value = '' }
onMounted(loadPack)
</script>

<template>
  <section class="rules-page">
    <header class="rules-header"><div><span class="eyebrow">Catálogo e revisão fiscal</span><h2>Regras propostas</h2><p>Organize os critérios das operações e acompanhe cada versão da regra.</p></div><button class="button primary" type="button" :disabled="!localRules" @click="startNew"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>{{ editing ? 'Abrir editor' : 'Nova regra' }}</button></header>
    <div class="rules-metrics" aria-label="Situação das regras">
      <button class="card metric" @click="showLocal()"><span class="metric-caption">Versões locais<span class="metric-icon" aria-hidden="true">▤</span></span><strong>{{ localRules?.length ?? '—' }}</strong><small>Histórico de todas as famílias de regras</small></button>
      <button class="card metric" @click="showLocal('DRAFT')"><span class="metric-caption">Em rascunho<span class="metric-icon amber" aria-hidden="true">✎</span></span><strong>{{ drafts ?? '—' }}</strong><small>Versões disponíveis para edição</small></button>
      <button class="card metric" @click="showLocal('APPROVED')"><span class="metric-caption">Aprovadas<span class="metric-icon green" aria-hidden="true">✓</span></span><strong>{{ approved ?? '—' }}</strong><small>Inclui versões históricas aprovadas</small></button>
      <button class="card metric" @click="activePanel = 'builtin'"><span class="metric-caption">Propostas incluídas<span class="metric-icon violet" aria-hidden="true">◇</span></span><strong>{{ pack?.rules.length ?? '—' }}</strong><small>Recortes do pacote do aplicativo</small></button>
    </div>
    <nav class="rules-navigation" aria-label="Áreas das regras"><button :aria-pressed="activePanel === 'local'" :class="{ active: activePanel === 'local' }" @click="activePanel = 'local'">Catálogo local <span>{{ localRules?.length ?? '—' }}</span></button><button :aria-pressed="activePanel === 'builtin'" :class="{ active: activePanel === 'builtin' }" @click="activePanel = 'builtin'">Propostas do aplicativo <span>{{ pack?.rules.length ?? '—' }}</span></button></nav>
    <VersionedRulesPanel v-show="activePanel === 'local'" ref="localPanel" @loaded="localRules = $event" @editing="editing = $event" />

    <section v-show="activePanel === 'builtin'" class="proposals-panel" aria-label="Propostas do aplicativo">
      <div class="section-heading"><div><h3>Pacote incluído no aplicativo</h3><p>Recortes e alíquotas revisados, com os critérios e o fundamento preservados para conferência.</p></div><span v-if="pack" class="badge badge-neutral">Pacote v{{ pack.version }}</span></div>
      <aside class="review-context"><span class="info-icon" aria-hidden="true">i</span><div><strong>Recorte aprovado, cálculo ainda em revisão</strong><p>Estas propostas são avaliadas contra os itens importados. A composição da base, as exceções, o arredondamento e os exemplos homologados ainda precisam de revisão; o pacote proposto não gera cálculo de ICMS.</p></div></aside>
      <p v-if="error" class="form-error feedback" role="alert">{{ error }} <button class="text-button" @click="loadPack">Tentar novamente</button></p>
      <p v-else-if="loading" class="card loading-panel" role="status"><span class="loading-dot" aria-hidden="true"></span>Carregando propostas…</p>
      <template v-else-if="pack">
        <div class="card proposal-toolbar"><label class="search-field"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input v-model="search" aria-label="Buscar propostas do aplicativo" placeholder="Buscar por recorte, CFOP ou fundamento"></label><label class="destination-field">UF de destino<select v-model="destination"><option value="">Todos os destinos</option><option v-for="state in destinations" :key="state" :value="state">{{ state }}</option></select></label></div>
        <div class="proposal-count"><span>{{ visibleProposals.length }} de {{ pack.rules.length }} propostas</span><span class="monospace">{{ pack.id }} · v{{ pack.version }}</span></div>
        <div v-if="!visibleProposals.length" class="card empty-panel"><h4>{{ pack.rules.length ? 'Nenhuma proposta corresponde aos filtros' : 'Nenhuma proposta neste pacote' }}</h4><p v-if="pack.rules.length">Experimente outro termo ou escolha todos os destinos.</p><button v-if="pack.rules.length" class="button secondary" @click="clearFilters">Limpar filtros</button></div>
        <div class="proposal-grid">
          <article v-for="rule in visibleProposals" :key="`${rule.id}:${rule.version}`" class="card proposal-card">
            <header class="proposal-heading"><div><span class="proposal-route">{{ rule.conditions.originState || '—' }} <span aria-hidden="true">→</span> {{ rule.conditions.destinationState || '—' }}</span><h4>{{ rule.name.replace(/\s*·\s*proposta$/, '') }}</h4></div><span class="badge badge-amber">Cálculo em revisão</span></header>
            <div class="proposal-rate"><div><span>Alíquota proposta revisada</span><strong>{{ rule.proposedRate.replace('.', ',') }}<small>%</small></strong></div><span class="reviewed-at">Revisada em<br>{{ date(rule.reviewedOn) }}</span></div>
            <dl class="proposal-codes"><div><dt>CFOP</dt><dd>{{ rule.conditions.cfop || '—' }}</dd></div><div><dt>CST do ICMS</dt><dd>{{ rule.conditions.cst || '—' }}</dd></div><div><dt>CRT do emitente</dt><dd>{{ rule.conditions.issuerRegime || '—' }}</dd></div></dl>
            <details class="proposal-conditions"><summary>Condições do recorte <span>{{ Object.keys(rule.conditions).length }} campos <span aria-hidden="true">⌄</span></span></summary><dl><div v-for="(value, key) in rule.conditions" :key="key"><dt>{{ conditionLabels[String(key)] || key }}</dt><dd>{{ conditionValue(String(key), value) }}</dd></div></dl></details>
            <div class="rule-source"><h5>Fundamento proposto</h5><p>{{ rule.legalBasis }}</p><small>{{ rule.sourceUrl }}</small></div>
            <details class="proposal-review"><summary>Pontos para revisão <span aria-hidden="true">⌄</span></summary><p>{{ rule.reviewNote }}</p></details>
            <footer class="proposal-footer"><span class="monospace">{{ rule.id }} · v{{ rule.version }}</span><p>Cobertura técnica a partir de {{ date(rule.validFrom) }}{{ rule.validUntil ? ` até ${date(rule.validUntil)}` : '' }}. Essa data não representa o início de vigência da lei.</p></footer>
          </article>
        </div>
      </template>
    </section>
  </section>
</template>

<style scoped>
.rules-page { min-width: 0; color: #243650; }
.rules-header { display: flex; justify-content: space-between; align-items: center; gap: 24px; margin-bottom: 28px; }
.rules-header h2 { margin: 12px 0 10px; color: #15243d; font-size: clamp(26px, 2.6vw, 34px); font-weight: 750; letter-spacing: -.035em; }
.rules-header p { margin: 0; color: #6b7d95; font-size: 13px; line-height: 1.6; }
.rules-header .button { gap: 9px; flex: none; }
.rules-header svg, .search-field svg { width: 17px; height: 17px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.rules-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 28px; }
.metric { display: flex; flex-direction: column; align-items: stretch; padding: 19px 20px; text-align: left; font-family: inherit; cursor: pointer; transition: border-color .15s, box-shadow .15s; }
.metric:hover { border-color: #bbcafa; box-shadow: 0 8px 22px #2439520c; }
.metric-caption { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11px; color: #667a95; }
.metric-icon { display: grid; place-items: center; width: 27px; height: 27px; flex: none; background: #eef2fd; color: #6580d6; border-radius: 8px; font-size: 17px; }
.metric-icon.green { color: #398f73; background: #eaf5f0; } .metric-icon.violet { color: #8b78c7; background: #f3effb; } .metric-icon.amber { color: #b48b3c; background: #fff7e8; }
.metric strong { display: block; margin: 14px 0 8px; color: #22344e; font-size: 29px; font-weight: 750; letter-spacing: -.04em; font-variant-numeric: tabular-nums; }
.metric small { color: #687a92; font-size: 10px; line-height: 1.6; }
.rules-navigation { display: flex; gap: 26px; margin-bottom: 24px; border-bottom: 1px solid #dfe6f0; overflow-x: auto; }
.rules-navigation button { display: flex; align-items: center; gap: 8px; flex: none; padding: 0 1px 15px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: #70839d; font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
.rules-navigation button.active { color: #455fdb; border-bottom-color: #455fdb; }
.rules-navigation button span { padding: 2px 6px; border-radius: 5px; background: #eef1f6; font-size: 10px; }
.rules-navigation button.active span { background: #eaf0ff; }
.metric:focus-visible, .rules-navigation button:focus-visible, .text-button:focus-visible { outline: 3px solid #455fdb50; outline-offset: 3px; }
.proposals-panel { display: grid; gap: 20px; }
.section-heading { display: flex; align-items: start; justify-content: space-between; gap: 20px; }
.section-heading h3 { margin: 0 0 8px; color: #263955; font-size: 18px; letter-spacing: -.025em; }
.section-heading p { margin: 0; color: #64768f; font-size: 12px; line-height: 1.65; }
.badge { display: inline-flex; align-items: center; flex: none; padding: 5px 9px; border-radius: 6px; font-size: 10px; line-height: 1.4; font-weight: 700; }
.badge-neutral { color: #60718a; background: #f0f3f8; } .badge-amber { color: #946c20; background: #fff5df; }
.review-context { display: flex; align-items: start; gap: 13px; padding: 16px 18px; border: 1px solid #e1e8f5; border-radius: 10px; background: #eef3fc; }
.info-icon { display: grid; place-items: center; flex: none; width: 20px; height: 20px; border: 1px solid #aabbdc; border-radius: 50%; color: #6581b1; font-size: 12px; }
.review-context strong { color: #50688e; font-size: 12px; }
.review-context p { margin: 6px 0 0; color: #6b7f9e; font-size: 12px; line-height: 1.65; }
.feedback { margin: 0; font-size: 12px; }
.feedback .text-button { margin-left: 10px; }
.text-button { padding: 0; border: 0; background: transparent; color: #5572bd; font-family: inherit; font-size: 12px; cursor: pointer; }
.proposal-toolbar { display: flex; align-items: center; gap: 18px; padding: 18px 20px; }
.search-field { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; color: #8b9bb2; }
.search-field input { min-width: 0; border: 0; background: transparent; font-size: 12px; }
.destination-field { display: flex; align-items: center; gap: 12px; color: #6f839f; font-size: 11px; }
.destination-field select { min-height: 38px; padding: 8px 10px; width: 170px; font-size: 12px; }
.proposal-count { display: flex; justify-content: space-between; align-items: center; gap: 15px; color: #7b8fa9; font-size: 11px; }
.monospace { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 10px; overflow-wrap: anywhere; }
.proposal-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; align-items: start; }
.proposal-card { padding: 24px; overflow-wrap: anywhere; min-width: 0; }
.proposal-heading { display: flex; justify-content: space-between; align-items: start; gap: 15px; }
.proposal-route { display: inline-flex; gap: 10px; align-items: center; color: #6e85af; font-size: 11px; font-weight: 600; }
.proposal-route > span { color: #9cacc6; }
.proposal-heading h4 { margin: 10px 0 0; color: #2e4568; font-size: 16px; line-height: 1.5; letter-spacing: -.015em; }
.proposal-heading > .badge { font-size: 9px; }
.proposal-rate { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin: 24px 0 18px; }
.proposal-rate > div > span { display: block; color: #778aa6; font-size: 10px; }
.proposal-rate strong { display: block; margin-top: 8px; color: #4b64cb; font-size: 31px; font-weight: 750; letter-spacing: -.04em; }
.proposal-rate strong small { margin-left: 4px; font-size: 17px; font-weight: 600; }
.reviewed-at { color: #7c90ad; font-size: 10px; line-height: 1.7; text-align: right; }
.proposal-codes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; margin: 0 0 20px; }
.proposal-codes > div { padding: 12px; border-radius: 8px; background: #f8fafd; }
.proposal-codes dt, .proposal-conditions dt { color: #7a8ca6; font-size: 10px; }
.proposal-codes dd { margin: 6px 0 0; color: #526d95; font-size: 14px; font-weight: 600; }
.proposal-conditions summary, .proposal-review summary { display: flex; align-items: center; justify-content: space-between; gap: 14px; color: #6982a8; font-size: 11px; font-weight: 600; list-style: none; }
.proposal-conditions summary::-webkit-details-marker, .proposal-review summary::-webkit-details-marker { display: none; }
.proposal-conditions summary > span { color: #8a9ebc; font-size: 10px; font-weight: 400; }
.proposal-conditions summary > span > span { display: inline-block; margin-left: 5px; }
.proposal-conditions[open] summary > span > span, .proposal-review[open] summary > span { transform: rotate(180deg); }
.proposal-conditions dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; padding: 16px; margin: 16px 0 0; border-radius: 9px; background: #f8fafd; }
.proposal-conditions dd { margin: 6px 0 0; color: #627d9f; font-size: 11px; line-height: 1.6; }
.rule-source { margin-top: 22px; padding-top: 20px; border-top: 1px solid #edf1f7; }
.rule-source h5 { color: #677f9f; font-size: 11px; margin: 0 0 10px; }
.rule-source p { color: #7086a4; font-size: 12px; line-height: 1.7; margin: 0 0 10px; }
.rule-source small { display: block; color: #8a9db8; font-size: 10px; line-height: 1.6; }
.proposal-review { margin-top: 20px; padding: 13px 14px; border: 1px solid #f0e4c8; border-radius: 8px; background: #fffbf2; }
.proposal-review summary { color: #9a7c43; }
.proposal-review p { margin: 13px 0 0; color: #937441; font-size: 11px; line-height: 1.7; }
.proposal-footer { margin-top: 20px; color: #8799b4; }
.proposal-footer p { color: #7f92ae; font-size: 10px; line-height: 1.7; margin: 10px 0 0; }
.empty-panel { padding: 36px 24px; text-align: center; }
.empty-panel h4 { margin: 0 0 10px; color: #3a5275; font-size: 16px; }
.empty-panel p { margin: 0 0 22px; color: #6f839f; font-size: 12px; line-height: 1.7; }
.loading-panel { margin: 0; display: flex; align-items: center; gap: 12px; padding: 30px; color: #6e829f; font-size: 13px; }
.loading-dot { width: 9px; height: 9px; border-radius: 50%; background: #7188db; }
@media (max-width: 1150px) { .metric { padding: 16px; } .proposal-grid { grid-template-columns: 1fr; } }
@media (max-width: 1100px) { .rules-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 650px) {
  .rules-header { flex-direction: column; align-items: stretch; } .rules-header .button { align-self: start; }
  .proposal-toolbar { flex-direction: column; align-items: stretch; } .destination-field { justify-content: space-between; } .destination-field select { flex: 1; }
  .proposal-card { padding: 20px; } .proposal-heading { gap: 10px; } .proposal-count { flex-wrap: wrap; }
}
</style>
