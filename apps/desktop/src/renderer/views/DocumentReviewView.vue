<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import type { CompanySummary, DocumentReviewAction, DocumentReviewSummary, DocumentaryStatus } from '@motor/contracts'

const route = useRoute()
const reviews = ref<readonly DocumentReviewSummary[]>([]), companies = ref<readonly CompanySummary[]>([])
const loading = ref(true), saving = ref(false), error = ref(''), notice = ref('')
const search = ref(typeof route.query.key === 'string' ? route.query.key : '')
const companyId = ref(typeof route.query.companyId === 'string' ? route.query.companyId : '')
const batchId = ref(typeof route.query.batchId === 'string' ? route.query.batchId : '')
const status = ref('all'), page = ref(0), pageSize = 20
const selection = ref<{ review: DocumentReviewSummary; action: DocumentReviewAction; requestId: string } | null>(null)
const documentId = ref(''), reason = ref(''), accepted = ref(false)
const labels: Record<DocumentaryStatus, string> = { UNMATCHED: 'Nota não localizada', CONFLICT: 'Conflito de conteúdo',
  ASSOCIATION_PENDING: 'Associação pendente', CANCELED: 'Cancelada', CCE_PENDING: 'Revisão de CC-e pendente',
  CCE_APPROVED: 'CC-e revisada', REVIEW_PENDING: 'Revisão específica pendente', CLEAR: 'Sem pendência documental' }
const actionLabels: Record<DocumentReviewAction, string> = { ASSOCIATE: 'Associação confirmada', APPROVE_CCE: 'Uso do XML original aprovado', REOPEN_CCE: 'Revisão de CC-e reaberta' }
const pending = (r: DocumentReviewSummary) => !['CANCELED', 'CCE_APPROVED', 'CLEAR'].includes(r.status)
const pendingCount = computed(() => reviews.value.filter(pending).length)
const canceledCount = computed(() => new Set(reviews.value.filter(r => r.status === 'CANCELED')
  .map(r => JSON.stringify([r.artifact.environmentCode, r.artifact.accessKey]))).size)
const approvedCount = computed(() => reviews.value.filter(r => r.status === 'CCE_APPROVED').length)
const filtered = computed(() => {
  const query = search.value.trim().toLocaleLowerCase('pt-BR')
  return reviews.value.filter(r => (!companyId.value || r.candidates.some(d => d.companyId === companyId.value))
    && (!batchId.value || r.artifact.sourceBatchId === batchId.value || r.candidates.some(d => d.batchId === batchId.value))
    && (status.value === 'all' || (status.value === 'pending' ? pending(r) : r.status === status.value))
    && (!query || [r.artifact.accessKey, r.artifact.eventType, r.artifact.protocolNumber, r.artifact.sourceBatchName,
      r.artifact.correctionText, r.artifact.justification, ...r.candidates.flatMap(d => [d.number, d.companyName, d.batchName])]
      .some(value => value?.toLocaleLowerCase('pt-BR').includes(query))))
})
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize)))
const displayed = computed(() => filtered.value.slice(page.value * pageSize, (page.value + 1) * pageSize))
watch([search, companyId, batchId, status], () => { page.value = 0 })
const busy = computed(() => loading.value || saving.value)
function eventName(value?: string): string {
  return ({ '110111': 'Cancelamento', '110110': 'Carta de Correção Eletrônica' } as Record<string, string>)[value ?? ''] ?? `Evento ${value ?? 'não identificado'}`
}
function date(value?: string): string { return value ? new Date(value).toLocaleString('pt-BR') : 'Não informado' }
function environment(value?: string): string { return value === '1' ? 'Produção' : value === '2' ? 'Homologação' : 'Não identificado' }
function target(r: DocumentReviewSummary) { return r.candidates.find(d => d.id === r.documentId) ?? r.candidates[0] }
function open(r: DocumentReviewSummary, action: DocumentReviewAction): void {
  selection.value = { review: r, action, requestId: crypto.randomUUID() }
  documentId.value = r.documentId ?? r.candidates[0]?.id ?? ''
  reason.value = ''; accepted.value = false; error.value = ''; notice.value = ''
}
function cancel(): void { selection.value = null; reason.value = ''; accepted.value = false }
async function load(): Promise<void> {
  if (saving.value) return
  loading.value = true; error.value = ''
  try {
    const [workspace, events] = await Promise.all([window.desktopApi.getWorkspace(), window.desktopApi.listDocumentReviews()])
    companies.value = workspace.companies
    reviews.value = events
    page.value = Math.min(page.value, pageCount.value - 1)
    cancel()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Não foi possível carregar os eventos.' }
  finally { loading.value = false }
}
async function save(): Promise<void> {
  const selected = selection.value
  if (!selected || busy.value || !reason.value.trim() || (selected.action === 'APPROVE_CCE' && !accepted.value)) return
  saving.value = true; error.value = ''; notice.value = ''
  try {
    const updated = await window.desktopApi.saveDocumentReview({ artifactId: selected.review.artifact.id,
      documentId: documentId.value, action: selected.action, reason: reason.value,
      expectedSnapshot: selected.review.snapshot, requestId: selected.requestId })
    reviews.value = reviews.value.map(r => r.artifact.id === updated.artifact.id ? updated : r)
    cancel(); notice.value = `${actionLabels[selected.action]}. Consulte novamente a conferência mensal para ver os totais atuais.`
    // Todas as ocorrências da mesma chave podem ter mudado de situação.
    reviews.value = await window.desktopApi.listDocumentReviews()
    page.value = Math.min(page.value, pageCount.value - 1)
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Não foi possível registrar a revisão.' }
  finally { saving.value = false }
}
function clearFilters(): void { search.value = ''; status.value = 'all'; companyId.value = ''; batchId.value = '' }
onMounted(load)
</script>

<template>
  <section class="document-review">
    <header class="page-header"><div><span class="eyebrow">Notas e eventos entre lotes</span><h2>Revisão documental</h2><p>Confira os vínculos e registre as decisões que determinam a participação das notas nos totais.</p></div><button class="button secondary" :disabled="busy" @click="load">{{ loading ? 'Atualizando…' : 'Atualizar eventos' }}</button></header>
    <div class="metrics" aria-label="Situação dos eventos">
      <button class="card metric" :disabled="busy || !!selection" @click="status = 'all'"><span>Eventos importados</span><strong>{{ reviews.length }}</strong><small>Inclui cópias de eventos recebidas em outros lotes</small></button>
      <button class="card metric amber" :disabled="busy || !!selection" @click="status = 'pending'"><span>Para revisar</span><strong>{{ pendingCount }}</strong><small>Associação, consistência ou efeito documental pendente</small></button>
      <button class="card metric" :disabled="busy || !!selection" @click="status = 'CANCELED'"><span>Notas canceladas</span><strong>{{ canceledCount }}</strong><small>Eventos relacionados a notas excluídas dos totais</small></button>
      <button class="card metric green" :disabled="busy || !!selection" @click="status = 'CCE_APPROVED'"><span>CC-e revisadas</span><strong>{{ approvedCount }}</strong><small>Uso do XML original autorizado na conferência</small></button>
    </div>
    <aside class="context-note">A revisão usa os arquivos importados neste computador. Confirmação de vínculo não verifica assinatura nem consulta a SEFAZ. O XML e as memórias de cálculo permanecem preservados.</aside>
    <div class="card filters"><label class="search">Buscar evento<input v-model="search" placeholder="Chave, nota, protocolo ou texto da correção" :disabled="saving || !!selection"></label><label>Empresa<select v-model="companyId" :disabled="saving || !!selection"><option value="">Todas as empresas</option><option v-for="company in companies" :key="company.id" :value="company.id">{{ company.legalName }}{{ company.active ? '' : ' (inativa)' }}</option></select></label><label>Situação<select v-model="status" :disabled="saving || !!selection"><option value="all">Todos os eventos</option><option value="pending">Para revisar</option><option v-for="(label, code) in labels" :key="code" :value="code">{{ label }}</option></select></label></div>
    <p v-if="batchId" class="filter-scope">Mostrando eventos relacionados ao lote selecionado. <button class="text-button" :disabled="saving || !!selection" @click="batchId = ''">Mostrar todos os lotes</button></p>
    <p v-if="error" class="form-error" role="alert">{{ error }} <button class="text-button" :disabled="busy" @click="load">Atualizar lista</button></p>
    <p v-if="notice" class="form-success" role="status">{{ notice }}</p>
    <p v-if="loading" class="card empty" role="status">Buscando eventos e notas relacionadas…</p>
    <template v-else>
      <div class="list-heading"><span>{{ filtered.length }} de {{ reviews.length }} eventos</span><span>Decisões locais com histórico</span></div>
      <div v-if="!displayed.length" class="card empty"><h3>{{ reviews.length ? 'Nenhum evento corresponde aos filtros' : 'Nenhum evento importado' }}</h3><p>{{ reviews.length ? 'Altere o termo, a empresa ou a situação para continuar.' : 'Importe os XMLs de eventos para localizar as notas relacionadas, mesmo em outro lote.' }}</p><button v-if="reviews.length" class="button secondary" :disabled="saving || !!selection" @click="clearFilters">Limpar filtros</button><RouterLink v-else class="button secondary" to="/lotes/novo">Importar arquivos</RouterLink></div>
      <article v-for="review in displayed" :key="review.artifact.id" class="card event-card">
        <header class="event-heading"><div><span class="event-kicker">{{ review.artifact.eventType }} · Sequência {{ review.artifact.sequence ?? '—' }}</span><h3>{{ eventName(review.artifact.eventType) }}</h3><p>{{ environment(review.artifact.environmentCode) }} · {{ date(review.artifact.occurredAt) }}</p></div><span class="badge" :class="{ good: review.status === 'CCE_APPROVED', canceled: review.status === 'CANCELED' }">{{ labels[review.status] }}</span></header>
        <dl class="event-identity"><div class="full"><dt>Chave da nota</dt><dd class="monospace">{{ review.artifact.accessKey }}</dd></div><div><dt>Protocolo do evento</dt><dd>{{ review.artifact.protocolNumber ?? 'Não informado' }}</dd></div><div><dt>Retorno SEFAZ</dt><dd>{{ review.artifact.statusCode ?? 'Não informado' }}{{ review.artifact.statusReason ? ` · ${review.artifact.statusReason}` : '' }}</dd></div></dl>
        <p v-if="review.blockedReason" class="warning">{{ review.blockedReason }} <RouterLink v-if="review.status === 'CONFLICT'" class="text-button" :to="{ path: '/conflitos-notas', query: { key: review.artifact.accessKey } }">Comparar versões da nota</RouterLink></p>
        <div v-if="review.artifact.correctionText || review.artifact.justification" class="event-text"><h4>{{ review.artifact.correctionText ? 'Texto da correção no XML' : 'Justificativa no XML' }}</h4><p>{{ review.artifact.correctionText ?? review.artifact.justification }}</p></div>
        <div class="event-origin"><div><span>Arquivo do evento</span><RouterLink :to="{ path: `/lotes/${review.artifact.sourceBatchId}`, query: { painel: 'files' } }">{{ review.artifact.sourceBatchName }}</RouterLink></div><div v-if="target(review)"><span>{{ review.documentId ? 'Nota associada' : 'Nota localizada para conferência' }}</span><RouterLink :to="{ path: `/lotes/${target(review)!.batchId}`, hash: `#nota-${target(review)!.id}` }">Nota {{ target(review)!.number }} · {{ target(review)!.companyName ?? 'Empresa não identificada' }}</RouterLink><small>{{ target(review)!.batchName }}</small></div></div>
        <p v-if="review.candidates.length > 1" class="hint">{{ review.candidates.length }} ocorrências da nota localizadas. Cópias de conteúdo idêntico compartilham o efeito documental; a conferência mensal continua contando apenas a ocorrência elegível.</p>
        <p class="effect" :class="{ cleared: review.status === 'CCE_APPROVED' }">{{ review.effect }}</p>
        <div class="actions"><button v-if="review.canAssociate" class="button primary" :disabled="busy || !!selection" @click="open(review, 'ASSOCIATE')">Conferir associação</button><button v-if="review.canApproveCce" class="button primary" :disabled="busy || !!selection" @click="open(review, 'APPROVE_CCE')">Concluir revisão de CC-e</button><button v-if="review.canReopenCce" class="button secondary" :disabled="busy || !!selection" @click="open(review, 'REOPEN_CCE')">Reabrir revisão</button><RouterLink v-if="target(review)?.companyId" class="text-button" :to="{ path: '/conferencia-mensal', query: { companyId: target(review)!.companyId, period: target(review)!.issuedAt?.slice(0, 7) } }">Abrir conferência mensal</RouterLink></div>
        <form v-if="selection?.review.artifact.id === review.artifact.id" class="decision-form" @submit.prevent="save">
          <h4>{{ selection.action === 'ASSOCIATE' ? 'Confirmar vínculo do evento' : selection.action === 'APPROVE_CCE' ? 'Revisar o uso do XML original' : 'Reabrir a pendência da CC-e' }}</h4>
          <p>{{ selection.action === 'ASSOCIATE' ? 'Confira chave, ambiente, protocolo e nota de origem. Cancelamentos confirmados mantêm os valores fora dos totais; CC-e exige revisão adicional.' : selection.action === 'APPROVE_CCE' ? 'Leia o texto da correção e confira a nota. Esta decisão permite usar os dados originais na conferência; outras pendências continuam sendo verificadas.' : 'A nota voltará a ficar fora dos totais até uma nova conclusão da revisão. A decisão anterior continua no histórico.' }}</p>
          <fieldset :disabled="saving"><legend class="visually-hidden">Decisão documental</legend><label v-if="selection.action === 'ASSOCIATE'">Nota de referência<select v-model="documentId" required><option v-for="candidate in review.candidates" :key="candidate.id" :value="candidate.id">Nota {{ candidate.number }} · {{ candidate.batchName }} · {{ candidate.id }}</option></select></label><label>Justificativa da decisão<textarea v-model="reason" rows="3" required maxlength="2000" placeholder="Registre o que foi conferido e o motivo da decisão"></textarea></label><label v-if="selection.action === 'APPROVE_CCE'" class="acceptance"><input v-model="accepted" type="checkbox" required><span>Revisei a CC-e e autorizo usar o XML original na conferência.</span></label><div class="decision-actions"><button class="button secondary" type="button" @click="cancel">Cancelar</button><button class="button primary" type="submit" :disabled="!reason.trim() || (selection.action === 'APPROVE_CCE' && !accepted)">{{ saving ? 'Registrando…' : 'Registrar decisão' }}</button></div></fieldset>
        </form>
        <details v-if="review.history.length" class="audit"><summary>Histórico das decisões ({{ review.history.length }})</summary><ol><li v-for="entry in review.history" :key="entry.id"><strong>{{ actionLabels[entry.action] }}</strong><p>{{ entry.reason }}</p><small>Revisão {{ entry.revision }} · {{ date(entry.createdAt) }} · {{ entry.computer }} · {{ entry.systemUser }}</small></li></ol></details>
      </article>
      <div v-if="pageCount > 1" class="pagination"><button class="button secondary" :disabled="saving || !!selection || page === 0" @click="page--">Anterior</button><span>Página {{ page + 1 }} de {{ pageCount }}</span><button class="button secondary" :disabled="saving || !!selection || page + 1 >= pageCount" @click="page++">Próxima</button></div>
    </template>
  </section>
</template>

<style scoped>
.document-review { min-width: 0; color: #263955; }
.page-header { display: flex; justify-content: space-between; align-items: center; gap: 20px; margin-bottom: 28px; }
.page-header h2 { font-family: inherit; font-weight: 750; margin: 12px 0 10px; font-size: clamp(26px, 2.6vw, 34px); color: #15243d; letter-spacing: -.035em; }
.page-header p { color: #6b7d95; font-size: 13px; line-height: 1.7; margin: 0; }
.page-header button { flex: none; }
.metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 22px; }
.metric { display: grid; gap: 12px; padding: 20px; text-align: left; color: #667a95; font: inherit; cursor: pointer; }
.metric span { font-size: 12px; } .metric strong { color: #22344e; font-size: 29px; } .metric small { font-size: 10px; line-height: 1.6; }
.metric.amber strong { color: #a17a2c; } .metric.green strong { color: #298267; }
.context-note { padding: 16px 18px; border-radius: 10px; border: 1px solid #e1e8f5; background: #eef3fc; color: #60789b; font-size: 12px; line-height: 1.7; margin-bottom: 22px; }
.filters { display: flex; align-items: end; gap: 16px; padding: 20px; margin-bottom: 18px; }
.filters label { min-width: 0; flex: 1; }.filters .search { flex: 1.5; }
label { display: grid; gap: 8px; color: #667e9e; font-size: 11px; }
input, select, textarea { min-width: 0; font: inherit; font-size: 12px; }
textarea { padding: 12px; border: 1px solid #d6deeb; border-radius: 8px; color: #243650; resize: vertical; }
.text-button { border: 0; padding: 0; background: transparent; color: #506cc4; font: inherit; font-size: 12px; text-decoration: none; cursor: pointer; }
.text-button:hover { text-decoration: underline; }
.text-button:disabled { opacity: .5; }
.filter-scope, .list-heading { color: #7a8fa9; font-size: 11px; line-height: 1.7; }
.list-heading { display: flex; justify-content: space-between; gap: 15px; margin: 22px 0 18px; }
.event-card { padding: 25px; margin-bottom: 20px; }
.event-heading { display: flex; justify-content: space-between; gap: 20px; align-items: start; }
.event-heading h3 { margin: 8px 0; color: #304968; font-size: 17px; }.event-heading p { margin: 0; color: #7d90ac; font-size: 11px; }
.event-kicker { font-size: 10px; color: #8295b1; }
.badge { padding: 6px 10px; border-radius: 7px; font-size: 10px; font-weight: 600; background: #fff5df; color: #946c20; }
.badge.good { background: #e9f6f0; color: #278367; }.badge.canceled { background: #fbeef0; color: #a25668; }
.event-identity { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; margin: 22px 0; }.event-identity .full { grid-column: 1 / -1; }
dt { color: #8497b1; font-size: 10px; }dd { margin: 7px 0 0; color: #536f94; font-size: 12px; overflow-wrap: anywhere; line-height: 1.7; }
.monospace { font-family: ui-monospace, monospace; font-size: 11px; }
.warning { padding: 13px 15px; background: #fffbf2; border: 1px solid #f0e3c3; border-radius: 8px; color: #8a6b35; font-size: 12px; line-height: 1.7; }
.event-text { padding: 18px; border: 1px solid #e5ebf5; border-radius: 9px; background: #f8fafd; }
.event-text h4 { margin: 0 0 10px; color: #6982a3; font-size: 11px; }.event-text p { margin: 0; color: #526e94; line-height: 1.8; font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
.event-origin { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; margin-top: 22px; }.event-origin > div { display: grid; gap: 7px; min-width: 0; }
.event-origin span, .event-origin small { color: #8799b2; font-size: 10px; }.event-origin a { color: #506cc4; font-size: 12px; text-decoration: none; overflow-wrap: anywhere; }
.hint, .effect { color: #788eac; font-size: 11px; line-height: 1.8; }.effect { border-top: 1px solid #e9eef6; padding-top: 18px; margin-top: 20px; }.effect.cleared { color: #398b70; }
.actions { display: flex; align-items: center; flex-wrap: wrap; gap: 18px; margin-top: 18px; }
.decision-form { padding: 22px; margin-top: 22px; border: 1px solid #cddbf5; border-radius: 10px; background: #f8faff; }
.decision-form h4 { font-size: 14px; margin: 0 0 10px; }.decision-form p { color: #6e85a5; font-size: 12px; line-height: 1.7; }
fieldset { display: grid; gap: 18px; border: 0; padding: 0; margin: 20px 0 0; min-width: 0; }
.acceptance { display: flex; align-items: start; gap: 12px; line-height: 1.8; }.acceptance input { width: auto; min-height: auto; margin-top: 4px; }
.decision-actions { display: flex; justify-content: end; gap: 12px; flex-wrap: wrap; }
.audit { border-top: 1px solid #e8edf5; margin-top: 22px; padding-top: 18px; color: #6a82a5; font-size: 12px; }.audit ol { list-style: none; margin: 18px 0 0; padding: 0; display: grid; gap: 18px; }.audit li { border-left: 2px solid #d7e3f7; padding-left: 15px; }.audit p { white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.7; }.audit small { color: #8799b3; font-size: 10px; }
.empty { text-align: center; padding: 36px; color: #7186a5; }.empty h3 { font-size: 17px; color: #3d5678; }.empty p { line-height: 1.8; font-size: 12px; }
.pagination { display: flex; justify-content: center; align-items: center; gap: 20px; color: #7c90ad; font-size: 12px; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
.metric:focus-visible, .text-button:focus-visible, textarea:focus-visible { outline: 3px solid #455fdb50; outline-offset: 3px; }
@media (max-width: 1100px) { .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }.filters { flex-wrap: wrap; }.filters .search { flex-basis: 100%; } }
@media (max-width: 650px) { .page-header { flex-direction: column; align-items: start; }.event-card { padding: 20px; }.event-heading { flex-wrap: wrap; }.event-origin { grid-template-columns: 1fr; }.list-heading { flex-wrap: wrap; } }
</style>
