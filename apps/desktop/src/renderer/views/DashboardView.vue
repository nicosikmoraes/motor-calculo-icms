<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import type { BatchListItem, WorkspaceState } from '@motor/contracts'

const batches = ref<readonly BatchListItem[]>([])
const workspace = ref<WorkspaceState>({ companies: [] })
const error = ref('')
const indicators = computed(() => [
  { label: 'Lotes importados', value: batches.value.length },
  { label: 'Notas identificadas', value: batches.value.reduce((total, batch) => total + batch.totalDocuments, 0) },
  { label: 'Pendências', value: batches.value.reduce((total, batch) => total + batch.totalPendencies, 0) },
])

onMounted(async () => {
  try {
    const [savedBatches, savedWorkspace] = await Promise.all([
      window.desktopApi.listBatches(),
      window.desktopApi.getWorkspace(),
    ])
    batches.value = savedBatches
    workspace.value = savedWorkspace
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Não foi possível carregar os indicadores.'
  }
})
</script>

<template>
  <section>
    <header class="page-header">
      <div>
        <p class="eyebrow">Visão geral</p>
        <h2>Documentos em ordem. Decisões com clareza.</h2>
        <p class="lead">
          Importe NF-e e NFC-e, associe cada nota à empresa correta e acompanhe
          os resultados em um só lugar.
        </p>
      </div>
      <RouterLink class="button primary" to="/lotes/novo">+ Novo lote</RouterLink>
    </header>

    <p v-if="error" class="form-error notice">{{ error }}</p>
    <div class="indicator-grid">
      <article v-for="indicator in indicators" :key="indicator.label" class="card indicator">
        <strong>{{ indicator.value }}</strong>
        <span>{{ indicator.label }}</span>
      </article>
    </div>

    <article class="card getting-started">
      <p class="eyebrow">Seu espaço de trabalho</p>
      <h3>{{ workspace.companies.length }} empresa(s) cadastrada(s)</h3>
      <p>Comece um novo lote para conferir os CNPJs e os documentos. Cada nota pode ser associada à sua própria empresa.</p>
      <div class="dashboard-actions">
        <RouterLink class="button secondary" to="/empresas">Gerenciar empresas</RouterLink>
        <RouterLink class="button secondary" to="/lotes">Ver histórico</RouterLink>
      </div>
    </article>
  </section>
</template>
