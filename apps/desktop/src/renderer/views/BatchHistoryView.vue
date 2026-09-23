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
          <small>{{ batch.companyName || 'Empresa não informada' }} · {{ dateTime(batch.receivedAt) }}</small>
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
