<script setup lang="ts">
import { RendererErrorMessage } from '../error-messages'
import { onMounted, onUnmounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import type { BatchListItem, RecoverableImport, BatchOperationProgress } from '@motor/contracts'

const recoveries = ref<readonly RecoverableImport[]>([])
const resuming = ref('')
const operationId = ref('')
const progress = ref<BatchOperationProgress>()
let unsubscribe: (() => void) | undefined
const batches = ref<readonly BatchListItem[]>([])
const loading = ref(true)
const error = ref('')

function dateTime(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

function environment(code?: string): string {
  return code === '1' ? 'Produção' : code === '2' ? 'Homologação' : 'Ambiente não informado'
}

async function load(): Promise<void> {
  try {
    [batches.value, recoveries.value] = await Promise.all([
      window.desktopApi.listBatches(), window.desktopApi.listRecoverableImports(),
    ])
  } catch (cause) { error.value = cause instanceof Error ? cause.message : RendererErrorMessage.BATCH_LIST_LOAD }
  finally { loading.value = false }
}
async function resume(id: string): Promise<void> {
  error.value = ''; resuming.value = id; operationId.value = crypto.randomUUID()
  try { await window.desktopApi.resumeImport(id, operationId.value) }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'Não foi possível retomar o lote.' }
  finally { resuming.value = ''; operationId.value = ''; progress.value = undefined; await load() }
}
async function pause(): Promise<void> {
  try { await window.desktopApi.pauseBatchOperation(operationId.value) }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'Não foi possível pausar.' }
}
onMounted(() => {
  unsubscribe = window.desktopApi.onBatchProgress((value) => {
    if (value.operationId === operationId.value) progress.value = value
  })
  void load()
})
onUnmounted(() => unsubscribe?.())

</script>

<template>
  <section>
    <header class="page-header">
      <div>
        <p class="eyebrow">Histórico</p>
        <h2>Lotes importados</h2>
        <p class="lead">Consulte os inventários e diagnósticos preservados nesta instalação.</p>
      </div>
      <RouterLink class="button primary" to="/lotes/novo">Novo lote</RouterLink>
    </header>
    <p v-if="error" class="form-error notice">{{ error }}</p>
    <article v-for="recovery in recoveries" :key="recovery.id" class="card recovery-card">
      <h3>Importação pendente</h3>
      <p>{{ recovery.originalName }}</p>
      <p>{{ recovery.stagedEntries }} entrada(s) preservada(s) · {{ recovery.totalEntries }} entrada(s) previstas</p>
      <p>Os arquivos de origem precisam continuar no mesmo local e com o mesmo conteúdo.</p>
      <p v-if="recovery.error" role="alert">{{ recovery.error }}</p>
      <button class="button primary" type="button" :disabled="!!resuming || !!recovery.error" @click="resume(recovery.id)">Retomar importação</button>
      <template v-if="resuming === recovery.id">
        <p role="status">{{ progress?.phase === 'SAVING' ? 'Salvando lote…' : 'Retomando…' }} {{ progress?.completed ?? 0 }} / {{ progress?.total ?? recovery.totalEntries }}</p>
        <button class="button secondary" type="button" :disabled="progress?.phase === 'SAVING'" @click="pause">Pausar</button>
      </template>
    </article>
    <p v-if="loading" class="empty-state">Carregando lotes…</p>
    <article v-else-if="batches.length === 0" class="card empty-list-card">
      <h3>Nenhum lote criado</h3>
      <p>Crie o primeiro lote para iniciar o histórico auditável.</p>
    </article>
    <div v-else class="batch-list">
      <RouterLink v-for="batch in batches" :key="batch.id" class="card batch-list-row" :to="`/lotes/${batch.id}`">
        <div>
          <span class="status-pill">{{ batch.status }}</span>
          <strong>{{ batch.originalName || 'Lote sem nome' }}</strong>
          <small>{{ batch.companyName || 'Empresa não informada' }} · {{ environment(batch.environmentCode) }} · {{ dateTime(batch.receivedAt) }}</small>
        </div>
        <div class="batch-counts">
          <span><b>{{ batch.totalDocuments }}</b> notas</span>
          <span><b>{{ batch.totalFiles }}</b> arquivos</span>
          <span><b>{{ batch.totalPendencies }}</b> pendências</span>
        </div>
      </RouterLink>
    </div>
  </section>
</template>

<style scoped>
.recovery-card { padding: 24px; margin-bottom: 16px; overflow-wrap: anywhere; }
.empty-list-card { padding: 32px; }
.batch-list { display: grid; gap: 12px; }
.batch-list-row { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 22px; color: inherit; text-decoration: none; transition: border-color .15s, transform .15s; }
.batch-list-row:hover { border-color: #b45d30; transform: translateY(-1px); }
.batch-list-row > div:first-child { display: grid; gap: 6px; }
.batch-list-row strong { font: 700 20px Georgia, serif; }
.batch-list-row small { color: #69736d; }
.batch-counts { display: flex; gap: 18px; color: #69736d; font-size: 13px; }
.batch-counts span { display: grid; gap: 2px; text-align: center; }
.batch-counts b { color: #173d32; font-size: 20px; }
@media (max-width: 850px) {
  .batch-list-row { align-items: start; flex-direction: column; }
}
.batch-list-row strong { color: #1d2e4c; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
.batch-list-row > div:first-child { min-width: 0; }
.batch-list-row strong, .batch-list-row small { overflow-wrap: anywhere; }
.batch-counts { flex-wrap: wrap; }
@media (max-width: 650px) {
  .batch-counts { width: 100%; justify-content: space-between; }
}
</style>
