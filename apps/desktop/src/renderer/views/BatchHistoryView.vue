<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import type { BatchListItem } from '@motor/contracts'

const batches = ref<readonly BatchListItem[]>([])
const loading = ref(true)
const error = ref('')

function dateTime(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
}

function environment(code?: string): string {
  return code === '1' ? 'Produção' : code === '2' ? 'Homologação' : 'Ambiente não informado'
}

onMounted(async () => {
  try {
    batches.value = await window.desktopApi.listBatches()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Não foi possível carregar os lotes.'
  } finally {
    loading.value = false
  }
})
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
