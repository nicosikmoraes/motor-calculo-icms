<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import type { CompanySummary, DocumentConflictSummary, ConflictVersion } from '@motor/contracts'
const route = useRoute()
const conflicts = ref<readonly DocumentConflictSummary[]>([]), companies = ref<readonly CompanySummary[]>([])
const loading = ref(true), saving = ref(false), error = ref(''), notice = ref('')
const search = ref(typeof route.query.key === 'string' ? route.query.key : '')
const companyId = ref(typeof route.query.companyId === 'string' ? route.query.companyId : '')
const batchId = ref(typeof route.query.batchId === 'string' ? route.query.batchId : '')
const status = ref('all'), page = ref(0), pageSize = 20
const expanded = ref(''), leftId = ref(''), rightId = ref(''), differencesOnly = ref(true)
const decision = ref<{ conflict: DocumentConflictSummary; documentId: string; action: 'SELECT' | 'REOPEN'; requestId: string } | null>(null)
const reason = ref(''), confirmed = ref(false)
const labels = { PENDING: 'Escolha pendente', RESOLVED: 'Versão escolhida', STALE: 'Nova versão para revisar' }
const groupKey = (r: DocumentConflictSummary) => JSON.stringify([r.accessKey, r.environmentCode])
const counts = computed(() => ({ pending: conflicts.value.filter(c => c.status !== 'RESOLVED').length, resolved: conflicts.value.filter(c => c.status === 'RESOLVED').length, stale: conflicts.value.filter(c => c.status === 'STALE').length }))
const filtered = computed(() => {
  const query = search.value.trim().toLocaleLowerCase('pt-BR')
  return conflicts.value.filter(r => (!companyId.value || r.versions.some(d => d.companyId === companyId.value))
    && (!batchId.value || r.versions.some(d => d.batchId === batchId.value))
    && (status.value === 'all' || (status.value === 'pending' ? r.status !== 'RESOLVED' : r.status === status.value))
    && (!query || [r.accessKey, ...r.versions.flatMap(v => [v.number, v.companyName, v.batchName, v.fileName, v.contentHash])].some(v => v?.toLocaleLowerCase('pt-BR').includes(query))))
})
const pages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)))
const displayed = computed(() => filtered.value.slice(page.value * pageSize, (page.value + 1) * pageSize))
watch([search, companyId, batchId, status], () => { page.value = 0 })
const busy = computed(() => loading.value || saving.value)
const locked = computed(() => busy.value || !!decision.value)
function pair(r: DocumentConflictSummary): ConflictVersion[] { return [r.versions.find(v => v.id === leftId.value), r.versions.find(v => v.id === rightId.value)].filter((v): v is ConflictVersion => !!v) }
function fields(r: DocumentConflictSummary) {
  const [left, right] = pair(r).map(v => r.versions.findIndex(candidate => candidate.id === v.id))
  return r.fields.map(f => ({ ...f, left: f.values[left!], right: f.values[right!], different: f.values[left!] !== f.values[right!] }))
    .filter(f => !differencesOnly.value || f.different)
}
function date(value?: string): string { return value ? new Date(value).toLocaleString('pt-BR') : 'Não informado' }
function environment(value: string): string { return value === '1' ? 'Produção' : value === '2' ? 'Homologação' : 'Não identificado' }
function compare(r: DocumentConflictSummary): void {
  expanded.value = expanded.value === groupKey(r) ? '' : groupKey(r)
  const first = r.versions.find(v => v.id === r.chosenDocumentId) ?? r.versions[0]!
  leftId.value = first.id; rightId.value = (r.versions.find(v => v.contentHash !== first.contentHash) ?? r.versions.find(v => v.id !== first.id))!.id
  differencesOnly.value = true
}
function begin(r: DocumentConflictSummary, documentId: string, action: 'SELECT' | 'REOPEN'): void {
  decision.value = { conflict: r, documentId, action, requestId: crypto.randomUUID() }
  reason.value = ''; confirmed.value = false; error.value = ''; notice.value = ''
}
function cancel(): void { decision.value = null; reason.value = ''; confirmed.value = false }
async function load(): Promise<void> {
  if (saving.value) return
  loading.value = true; error.value = ''
  try {
    const [workspace, rows] = await Promise.all([window.desktopApi.getWorkspace(), window.desktopApi.listDocumentConflicts()])
    companies.value = workspace.companies; conflicts.value = rows; cancel(); expanded.value = ''
    page.value = Math.min(page.value, pages.value - 1)
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Não foi possível carregar os conflitos.' }
  finally { loading.value = false }
}
async function save(): Promise<void> {
  const selected = decision.value
  if (!selected || busy.value || !reason.value.trim() || (selected.action === 'SELECT' && !confirmed.value)) return
  saving.value = true; error.value = ''; notice.value = ''
  try {
    const updated = await window.desktopApi.saveConflictResolution({ accessKey: selected.conflict.accessKey, environmentCode: selected.conflict.environmentCode,
      documentId: selected.documentId, action: selected.action, reason: reason.value, expectedSnapshot: selected.conflict.snapshot, requestId: selected.requestId })
    conflicts.value = conflicts.value.map(r => groupKey(r) === groupKey(updated) ? updated : r)
    cancel(); notice.value = `${selected.action === 'SELECT' ? 'Escolha registrada' : 'Conflito reaberto'}. Atualize a conferência mensal para consultar os totais atuais.`
    conflicts.value = await window.desktopApi.listDocumentConflicts(); page.value = Math.min(page.value, pages.value - 1)
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Não foi possível registrar a decisão.' }
  finally { saving.value = false }
}
function clear(): void { search.value = ''; companyId.value = ''; batchId.value = ''; status.value = 'all' }
onMounted(load)
</script>

<template>
  <section class="document-conflicts">
    <header class="page-header"><div><span class="eyebrow">Versões da mesma nota</span><h2>Conflitos de notas</h2><p>Compare os arquivos e registre qual conteúdo deve ser usado na conferência.</p></div><button class="button secondary" :disabled="busy" @click="load">{{ loading ? 'Atualizando…' : 'Atualizar conflitos' }}</button></header>
    <div class="metrics" aria-label="Situação dos conflitos"><button class="card metric" :disabled="locked" @click="status = 'all'"><span>Notas com conflito</span><strong>{{ conflicts.length }}</strong><small>Mesma chave e ambiente com arquivos diferentes</small></button><button class="card metric amber" :disabled="locked" @click="status = 'pending'"><span>Para decidir</span><strong>{{ counts.pending }}</strong><small>Aguardam escolha ou nova revisão</small></button><button class="card metric green" :disabled="locked" @click="status = 'RESOLVED'"><span>Escolhas registradas</span><strong>{{ counts.resolved }}</strong><small>Versão de referência com justificativa</small></button><button class="card metric amber" :disabled="locked" @click="status = 'STALE'"><span>Novas versões</span><strong>{{ counts.stale }}</strong><small>Importações que exigem outra decisão</small></button></div>
    <aside class="context-note">A escolha resolve o conflito de conteúdo. Cancelamentos, denegações, revisão de CC-e e pendências fiscais continuam sendo verificados. Os arquivos e cálculos anteriores permanecem preservados.</aside>
    <div class="card filters"><label class="search">Buscar nota ou arquivo<input v-model="search" :disabled="locked" placeholder="Chave, número, empresa ou arquivo"></label><label>Empresa<select v-model="companyId" :disabled="locked"><option value="">Todas as empresas</option><option v-for="company in companies" :key="company.id" :value="company.id">{{ company.legalName }}{{ company.active ? '' : ' (inativa)' }}</option></select></label><label>Situação<select v-model="status" :disabled="locked"><option value="all">Todos os conflitos</option><option value="pending">Para decidir</option><option v-for="(label, code) in labels" :key="code" :value="code">{{ label }}</option></select></label></div>
    <p v-if="batchId" class="scope">Conflitos relacionados ao lote selecionado. <button class="text-button" :disabled="locked" @click="batchId = ''">Mostrar todos os lotes</button></p>
    <p v-if="error" class="form-error" role="alert">{{ error }} <button class="text-button" :disabled="busy" @click="load">Atualizar lista</button></p><p v-if="notice" class="form-success" role="status">{{ notice }}</p>
    <p v-if="loading" class="card empty" role="status">Buscando versões e decisões…</p>
    <template v-else>
      <div class="list-heading"><span>{{ filtered.length }} de {{ conflicts.length }} conflitos</span><span>Decisões com histórico</span></div>
      <div v-if="!displayed.length" class="card empty"><h3>{{ conflicts.length ? 'Nenhum conflito corresponde aos filtros' : 'Nenhum conflito de notas' }}</h3><p>{{ conflicts.length ? 'Altere a busca, empresa ou situação para continuar.' : 'Quando arquivos diferentes da mesma nota forem importados, as versões aparecerão aqui para comparação.' }}</p><button v-if="conflicts.length" class="button secondary" :disabled="locked" @click="clear">Limpar filtros</button><RouterLink v-else class="button secondary" to="/lotes">Abrir histórico</RouterLink></div>
      <article v-for="conflict in displayed" :key="groupKey(conflict)" class="card conflict-card">
        <header class="conflict-heading"><div><span class="eyebrow">{{ environment(conflict.environmentCode) }} · {{ conflict.versions.length }} ocorrências · {{ new Set(conflict.versions.map(v => v.contentHash)).size }} conteúdos</span><h3>Nota {{ conflict.versions[0]?.number }} · Série {{ conflict.versions[0]?.series }}</h3><p class="key">{{ conflict.accessKey }}</p></div><span class="badge" :class="{ good: conflict.status === 'RESOLVED' }">{{ labels[conflict.status] }}</span></header>
        <p v-if="conflict.status === 'STALE'" class="warning">Uma nova versão diferente chegou depois da escolha. Compare novamente; os valores ficam fora dos totais até outra decisão.</p>
        <p v-if="conflict.chosenDocumentId" class="choice">Versão escolhida: <RouterLink :to="{ path: `/lotes/${conflict.versions.find(v => v.id === conflict.chosenDocumentId)!.batchId}`, hash: `#nota-${conflict.chosenDocumentId}` }">{{ conflict.versions.find(v => v.id === conflict.chosenDocumentId)?.fileName }}</RouterLink>. Cópias idênticas são contadas uma vez por empresa na conferência mensal.</p>
        <div class="actions"><button class="button" :class="expanded === groupKey(conflict) ? 'secondary' : 'primary'" :disabled="locked" @click="compare(conflict)">{{ expanded === groupKey(conflict) ? 'Fechar comparação' : 'Comparar versões' }}</button><button v-if="conflict.canReopen" class="button secondary" :disabled="locked" @click="begin(conflict, conflict.chosenDocumentId!, 'REOPEN')">Reabrir conflito</button><RouterLink class="text-button" :to="{ path: '/revisao-documental', query: { key: conflict.accessKey } }">Conferir eventos da nota</RouterLink></div>
        <section v-if="expanded === groupKey(conflict)" class="comparison" aria-label="Comparação entre versões">
          <div class="pair-selectors"><label>Primeira versão<select v-model="leftId" :disabled="locked"><option v-for="version in conflict.versions" :key="version.id" :value="version.id">{{ version.fileName }} · {{ version.batchName }} · {{ version.contentHash.slice(0, 8) }} · {{ version.id.slice(0, 8) }}</option></select></label><label>Segunda versão<select v-model="rightId" :disabled="locked"><option v-for="version in conflict.versions" :key="version.id" :value="version.id">{{ version.fileName }} · {{ version.batchName }} · {{ version.contentHash.slice(0, 8) }} · {{ version.id.slice(0, 8) }}</option></select></label></div>
          <div class="version-cards"><section v-for="(version, index) in pair(conflict)" :key="`${version.id}-${index}`" class="version-card"><span class="version-label">{{ index === 0 ? 'Primeira versão' : 'Segunda versão' }}</span><h4>{{ version.fileName }}</h4><p>{{ version.companyName ?? 'Empresa não identificada' }}</p><RouterLink :to="{ path: `/lotes/${version.batchId}`, hash: `#nota-${version.id}` }">{{ version.batchName }} →</RouterLink><dl><div><dt>Recebimento</dt><dd>{{ date(version.receivedAt) }}</dd></div><div><dt>Emissão</dt><dd>{{ date(version.issuedAt) }}</dd></div><div><dt>Itens</dt><dd>{{ version.itemCount }}</dd></div><div><dt>Identificação do conteúdo</dt><dd class="hash">{{ version.contentHash }}</dd></div></dl><p v-if="version.blockedReason" class="warning">{{ version.blockedReason }}</p><span v-if="version.contentHash === conflict.chosenContentHash" class="selected-note">Conteúdo escolhido</span><button v-else-if="conflict.status !== 'RESOLVED'" class="button primary" :disabled="locked || !version.canSelect" @click="begin(conflict, version.id, 'SELECT')">{{ index === 0 ? 'Escolher primeira versão' : 'Escolher segunda versão' }}</button></section></div>
          <label class="difference-toggle"><input v-model="differencesOnly" type="checkbox" :disabled="locked">Mostrar somente diferenças</label>
          <p v-if="leftId === rightId" class="hint">Você selecionou a mesma ocorrência nos dois lados. Escolha outra para comparar.</p>
          <div class="comparison-table"><table><thead><tr><th>Campo</th><th>Primeira versão</th><th>Segunda versão</th></tr></thead><tbody><tr v-for="field in fields(conflict)" :key="field.path" :class="{ different: field.different }"><th>{{ field.label }}</th><td>{{ field.left === null || field.left === undefined ? 'Não informado' : field.left === '' ? 'Vazio' : field.left }}</td><td>{{ field.right === null || field.right === undefined ? 'Não informado' : field.right === '' ? 'Vazio' : field.right }}</td></tr></tbody></table></div><p v-if="!fields(conflict).length" class="hint">Não há diferenças nos campos normalizados deste par. Os arquivos têm identidades próprias; confira a origem e os protocolos antes de decidir.</p>
        </section>
        <form v-if="decision && groupKey(decision.conflict) === groupKey(conflict)" class="decision-form" @submit.prevent="save"><h4>{{ decision.action === 'SELECT' ? 'Registrar a versão válida' : 'Reabrir a análise do conflito' }}</h4><p>{{ decision.action === 'SELECT' ? `Arquivo escolhido: ${conflict.versions.find(v => v.id === decision!.documentId)?.fileName}. A decisão vale para este conteúdo nas ocorrências da mesma chave e ambiente.` : 'Todas as versões voltam a ficar fora dos totais. A escolha anterior permanece no histórico.' }}</p><fieldset :disabled="saving"><legend class="visually-hidden">Decisão sobre o conflito</legend><label>Justificativa da decisão<textarea v-model="reason" rows="3" required maxlength="2000" placeholder="Registre as diferenças conferidas e por que esta versão é válida"></textarea></label><label v-if="decision.action === 'SELECT'" class="confirmation"><input v-model="confirmed" type="checkbox" required>Conferi as diferenças e escolho esta versão para a conferência.</label><div class="decision-actions"><button class="button secondary" type="button" @click="cancel">Cancelar</button><button class="button primary" type="submit" :disabled="!reason.trim() || (decision.action === 'SELECT' && !confirmed)">{{ saving ? 'Registrando…' : 'Registrar decisão' }}</button></div></fieldset></form>
        <details v-if="conflict.history.length" class="audit"><summary>Histórico das decisões ({{ conflict.history.length }})</summary><ol><li v-for="entry in conflict.history" :key="entry.id"><strong>{{ entry.action === 'SELECT' ? 'Versão escolhida' : 'Conflito reaberto' }}</strong><p>{{ entry.reason }}</p><p class="audit-file">Arquivo: {{ conflict.versions.find(v => v.id === entry.documentId)?.fileName ?? entry.documentId }} · {{ conflict.versions.find(v => v.id === entry.documentId)?.batchName }}</p><small>Revisão {{ entry.revision }} · {{ date(entry.createdAt) }} · {{ entry.computer }} · {{ entry.systemUser }}</small></li></ol></details>
      </article>
      <div v-if="pages > 1" class="pagination"><button class="button secondary" :disabled="locked || page === 0" @click="page--">Anterior</button><span>Página {{ page + 1 }} de {{ pages }}</span><button class="button secondary" :disabled="locked || page + 1 >= pages" @click="page++">Próxima</button></div>
    </template>
  </section>
</template>

<style scoped>
.document-conflicts { min-width: 0; color: #263955; }
.page-header, .conflict-heading { display: flex; align-items: start; justify-content: space-between; gap: 20px; }.page-header { margin-bottom: 28px; align-items: center; }
.page-header h2 { font-family: inherit; font-size: clamp(26px, 2.6vw, 34px); font-weight: 750; letter-spacing: -.035em; margin: 12px 0 10px; color: #15243d; }
.page-header p { font-size: 13px; line-height: 1.7; color: #6b7d95; margin: 0; }.page-header button { flex: none; }
.metrics { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 14px; margin-bottom: 22px; }.metric { display: grid; gap: 12px; padding: 20px; text-align: left; font: inherit; color: #667a95; cursor: pointer; }.metric span { font-size: 12px; }.metric strong { font-size: 29px; color: #22344e; }.metric small { font-size: 10px; line-height: 1.6; }.metric.amber strong { color: #a17a2c; }.metric.green strong { color: #298267; }
.context-note { padding: 16px 18px; border: 1px solid #e1e8f5; border-radius: 10px; background: #eef3fc; font-size: 12px; line-height: 1.8; color: #60789b; margin-bottom: 22px; }
.filters { display: flex; align-items: end; gap: 16px; padding: 20px; margin-bottom: 18px; }.filters label { min-width: 0; flex: 1; }.filters .search { flex: 1.5; }
label { display: grid; gap: 8px; color: #667e9e; font-size: 11px; }input, select, textarea { min-width: 0; font: inherit; font-size: 12px; }textarea { padding: 12px; border: 1px solid #d6deeb; border-radius: 8px; resize: vertical; color: #243650; }
.text-button { border: 0; padding: 0; background: transparent; color: #506cc4; font: inherit; font-size: 12px; text-decoration: none; cursor: pointer; }.text-button:hover { text-decoration: underline; }
.list-heading, .scope { color: #7a8fa9; font-size: 11px; line-height: 1.7; }.list-heading { display: flex; justify-content: space-between; gap: 15px; margin: 22px 0 18px; }
.conflict-card { padding: 25px; margin-bottom: 20px; min-width: 0; }.conflict-heading h3 { margin: 10px 0; font-size: 18px; color: #304968; }.conflict-heading .eyebrow { font-size: 10px; letter-spacing: .03em; }.key { font: 11px/1.8 ui-monospace, monospace; color: #788fac; overflow-wrap: anywhere; margin: 0; }
.badge { flex: none; font-size: 10px; font-weight: 600; padding: 6px 10px; border-radius: 7px; background: #fff5df; color: #946c20; }.badge.good { background: #e9f6f0; color: #278367; }
.choice, .hint { font-size: 12px; line-height: 1.8; color: #6f85a4; }.choice { margin-top: 20px; }.choice a, .version-card a { color: #506cc4; text-decoration: none; }.warning { padding: 13px 15px; background: #fffbf2; border: 1px solid #f0e3c3; border-radius: 8px; color: #8a6b35; font-size: 12px; line-height: 1.7; }
.actions { display: flex; gap: 15px; align-items: center; flex-wrap: wrap; margin-top: 22px; }.comparison { border-top: 1px solid #e8edf5; padding-top: 22px; margin-top: 22px; }.pair-selectors, .version-cards { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 16px; }.pair-selectors { margin-bottom: 20px; }.version-card { padding: 20px; border: 1px solid #e1e8f4; border-radius: 10px; background: #f8fafd; min-width: 0; }.version-label { font-size: 10px; color: #8195b1; }.version-card h4 { font-size: 13px; overflow-wrap: anywhere; color: #365477; margin: 12px 0; }.version-card p, .version-card a { font-size: 11px; line-height: 1.8; }.version-card > p { color: #7b90ae; }.version-card dl { display: grid; gap: 13px; margin: 20px 0; }.version-card dt { font-size: 10px; color: #8498b4; }.version-card dd { font-size: 11px; line-height: 1.7; color: #5c779b; margin: 6px 0 0; }.hash { font-family: ui-monospace, monospace; overflow-wrap: anywhere; }.selected-note { font-size: 12px; color: #298267; }
.difference-toggle, .confirmation { display: flex; align-items: start; gap: 10px; line-height: 1.8; }.difference-toggle { margin: 22px 0 14px; }.difference-toggle input, .confirmation input { width: auto; min-height: auto; margin-top: 3px; }
.comparison-table { overflow-x: auto; border: 1px solid #e3eaf5; border-radius: 9px; }table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 11px; }th,td { text-align: left; padding: 13px; border-bottom: 1px solid #e8eef7; overflow-wrap: anywhere; line-height: 1.7; }thead th { background: #edf2fa; color: #647e9f; font-weight: 600; }tbody th { color: #637d9e; font-weight: 500; }td { color: #516e95; white-space: pre-wrap; }tr.different td { background: #fffcf5; }tr:last-child th,tr:last-child td { border-bottom: 0; }
.decision-form { padding: 22px; margin-top: 22px; border: 1px solid #cddbf5; border-radius: 10px; background: #f8faff; }.decision-form h4 { font-size: 14px; margin: 0 0 10px; }.decision-form p { font-size: 12px; line-height: 1.8; color: #6e85a5; }fieldset { display: grid; gap: 18px; border: 0; padding: 0; margin: 20px 0 0; min-width: 0; }.decision-actions { display: flex; justify-content: end; gap: 12px; flex-wrap: wrap; }
.audit { border-top: 1px solid #e8edf5; margin-top: 22px; padding-top: 18px; color: #6a82a5; font-size: 12px; }.audit ol { list-style: none; padding: 0; margin: 18px 0 0; display: grid; gap: 18px; }.audit li { border-left: 2px solid #d7e3f7; padding-left: 15px; }.audit p { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.7; }.audit small, .audit-file { color: #8799b3; font-size: 10px; }
.empty { text-align: center; padding: 36px; color: #7186a5; }.empty h3 { font-size: 17px; color: #3d5678; }.empty p { font-size: 12px; line-height: 1.8; }.pagination { display: flex; justify-content: center; align-items: center; gap: 20px; color: #7c90ad; font-size: 12px; }.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
.metric:focus-visible,.text-button:focus-visible,textarea:focus-visible { outline: 3px solid #455fdb50; outline-offset: 3px; }
@media(max-width:1100px) { .metrics { grid-template-columns: repeat(2,minmax(0,1fr)); }.filters { flex-wrap: wrap; }.filters .search { flex-basis: 100%; } }
@media(max-width:650px) { .page-header,.conflict-heading { flex-wrap: wrap; }.pair-selectors,.version-cards { grid-template-columns: 1fr; }.conflict-card { padding: 20px; } }
</style>
