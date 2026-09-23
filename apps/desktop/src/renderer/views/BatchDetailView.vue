<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import type { BatchDetail } from '@motor/contracts'

const route = useRoute()
const detail = ref<BatchDetail | null>(null)
const error = ref('')

function environment(code?: string): string {
  return code === '1' ? 'Produção' : code === '2' ? 'Homologação' : code || 'Não informado'
}

onMounted(async () => {
  try {
    detail.value = await window.desktopApi.getBatchDetail(String(route.params.id))
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Não foi possível carregar o lote.'
  }
})
</script>

<template>
  <section>
    <RouterLink class="back-link" to="/lotes">← Voltar ao histórico</RouterLink>
    <p v-if="error" class="form-error notice">{{ error }}</p>
    <p v-else-if="!detail" class="empty-state">Carregando lote…</p>
    <template v-else>
      <header class="page-header compact detail-header">
        <div>
          <p class="eyebrow">Lote {{ detail.batch.status }}</p>
          <h2>{{ detail.batch.originalName || 'Lote fiscal' }}</h2>
          <p class="lead">{{ detail.batch.companyName }} · {{ detail.batch.id }}</p>
        </div>
      </header>

      <div class="indicator-grid">
        <article class="card indicator"><strong>{{ detail.batch.totalDocuments }}</strong><span>Notas</span></article>
        <article class="card indicator"><strong>{{ detail.batch.totalFiles }}</strong><span>Ocorrências</span></article>
        <article class="card indicator"><strong>{{ detail.batch.totalPendencies }}</strong><span>Pendências</span></article>
      </div>

      <section class="detail-section">
        <h3>Documentos fiscais</h3>
        <article v-for="document in detail.documents" :key="document.id" class="card document-card">
          <div class="document-heading">
            <div><strong>NF-e {{ document.number }}</strong><span>Série {{ document.series }} · Modelo {{ document.model }}</span></div>
            <span class="status-pill">{{ environment(document.environmentCode) }}</span>
          </div>
          <dl class="document-data">
            <div><dt>Chave</dt><dd>{{ document.accessKey }}</dd></div>
            <div><dt>Emitente</dt><dd>{{ document.issuerName || document.issuerTaxId || '—' }}</dd></div>
            <div><dt>Destinatário</dt><dd>{{ document.recipientName || document.recipientTaxId || '—' }}</dd></div>
          </dl>
          <details>
            <summary>{{ document.items.length }} item(ns)</summary>
            <div class="table-wrap"><table><thead><tr><th>#</th><th>Produto</th><th>NCM</th><th>CFOP</th><th>Valor</th><th>ICMS declarado</th></tr></thead>
              <tbody><tr v-for="item in document.items" :key="item.itemNumber"><td>{{ item.itemNumber }}</td><td>{{ item.description || item.supplierProductCode || '—' }}</td><td>{{ item.ncm || '—' }}</td><td>{{ item.cfop || '—' }}</td><td>{{ item.productAmount || '—' }}</td><td>{{ item.declaredIcmsAmount || '—' }}</td></tr></tbody>
            </table></div>
          </details>
        </article>
        <p v-if="detail.documents.length === 0" class="empty-state">Nenhum documento normalizado.</p>
      </section>

      <section class="detail-section">
        <h3>Ocorrências e integridade</h3>
        <div class="card table-wrap"><table><thead><tr><th>Arquivo</th><th>Tipo</th><th>Ingestão</th><th>Repetição</th><th>Conflito</th></tr></thead>
          <tbody><tr v-for="occurrence in detail.occurrences" :key="occurrence.id"><td :title="occurrence.contentHash">{{ occurrence.relativePath }}</td><td>{{ occurrence.kind }}</td><td>{{ occurrence.ingestionStatus }}</td><td>{{ occurrence.repetition }}</td><td>{{ occurrence.contentConflict }}</td></tr></tbody>
        </table></div>
      </section>

      <section class="detail-section">
        <h3>Diagnósticos</h3>
        <ul v-if="detail.diagnostics.length" class="card diagnostic-list"><li v-for="diagnostic in detail.diagnostics" :key="diagnostic.id"><strong>{{ diagnostic.code }}</strong><span>{{ diagnostic.source }}</span><p>{{ diagnostic.message }}</p></li></ul>
        <p v-else class="empty-state">Nenhuma pendência registrada.</p>
      </section>
    </template>
  </section>
</template>
