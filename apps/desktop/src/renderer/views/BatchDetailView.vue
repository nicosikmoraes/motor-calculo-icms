<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import type { BatchDetail, FiscalProfileSummary, FiscalItemSummary, FiscalDocumentSummary } from '@motor/contracts'

const route = useRoute()
const detail = ref<BatchDetail | null>(null)
const error = ref('')
const notice = ref('')
const saving = ref(false)
const profilesByCompany = ref<Record<string, readonly FiscalProfileSummary[]>>({})
const selectedProfiles = ref<Record<string, string>>({})

function itemKey(document: FiscalDocumentSummary, item: FiscalItemSummary): string {
  return `${document.id}:${item.itemNumber}`
}

async function loadDetail(): Promise<void> {
  const loaded = await window.desktopApi.getBatchDetail(String(route.params.id))
  detail.value = loaded
  const companyIds = [...new Set(loaded.documents.map((document) => document.companyId).filter((id): id is string => Boolean(id)))]
  const entries = await Promise.all(companyIds.map(async (id) => [id, await window.desktopApi.listFiscalProfiles(id)] as const))
  profilesByCompany.value = Object.fromEntries(entries)
}

async function linkItem(document: FiscalDocumentSummary, item: FiscalItemSummary): Promise<void> {
  if (!document.companyId || !document.issuerTaxId || !item.supplierProductCode) return
  error.value = ''
  notice.value = ''
  saving.value = true
  try {
    await window.desktopApi.saveSupplierProduct({
      companyId: document.companyId,
      supplierCnpj: document.issuerTaxId,
      productCode: item.supplierProductCode,
      profileId: selectedProfiles.value[itemKey(document, item)] || '',
    })
    await loadDetail()
    notice.value = 'Produto vinculado ao perfil. A situação dos itens foi atualizada.'
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Não foi possível vincular o produto.'
  } finally {
    saving.value = false
  }
}

function environment(code?: string): string {
  return code === '1' ? 'Produção' : code === '2' ? 'Homologação' : code || 'Não informado'
}

onMounted(async () => {
  try {
    await loadDetail()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Não foi possível carregar o lote.'
  }
})
</script>

<template>
  <section>
    <RouterLink class="back-link" to="/lotes">← Voltar ao histórico</RouterLink>
    <p v-if="error" class="form-error notice">{{ error }}</p>
    <p v-if="notice" class="form-success notice">{{ notice }}</p>
    <p v-else-if="!detail" class="empty-state">Carregando lote…</p>
    <template v-else>
      <header class="page-header compact detail-header">
        <div>
          <p class="eyebrow">Lote {{ detail.batch.status }}</p>
          <h2>{{ detail.batch.originalName || 'Lote fiscal' }}</h2>
          <p class="lead">{{ detail.batch.companyName }} · {{ environment(detail.batch.environmentCode) }} · {{ detail.batch.id }}</p>
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
            <span class="status-pill">
              {{ document.eligibleForProcessing ? 'Apta para cálculo' : 'Pendente' }} · {{ environment(document.environmentCode) }}

            </span>
          </div>
          <dl class="document-data">
            <div><dt>Chave</dt><dd>{{ document.accessKey }}</dd></div>
            <div><dt>Empresa analisada</dt><dd>{{ document.companyName || '—' }}</dd></div>
            <div><dt>Emitente</dt><dd>{{ document.issuerName || document.issuerTaxId || '—' }}</dd></div>
            <div><dt>Destinatário</dt><dd>{{ document.recipientName || document.recipientTaxId || '—' }}</dd></div>
          </dl>
          <p v-if="document.pendingReason" class="form-error notice">
            {{ document.pendingReason }}
          </p>
          <details>
            <summary>{{ document.items.length }} item(ns)</summary>
            <p>Classificação cadastral, sem cálculo de imposto. <RouterLink to="/perfis">Gerenciar perfis fiscais</RouterLink>.</p>
            <div class="table-wrap"><table>
              <thead><tr><th>#</th><th>Produto</th><th>NCM</th><th>CFOP</th><th>Valor</th><th>ICMS declarado</th><th>Classificação</th></tr></thead>
              <tbody>
                <tr v-for="item in document.items" :key="item.itemNumber">
                  <td>{{ item.itemNumber }}</td>
                  <td>{{ item.description || item.supplierProductCode || '—' }}<small v-if="item.supplierProductCode"> · {{ item.supplierProductCode }}</small></td>
                  <td>{{ item.ncm || '—' }}</td>
                  <td>{{ item.cfop || '—' }}</td>
                  <td>{{ item.productAmount || '—' }}</td>
                  <td>{{ item.declaredIcmsAmount || '—' }}</td>
                  <td>
                    <strong>{{ item.classification === 'CLASSIFICADO' ? item.fiscalProfileName : item.classification === 'FORA_DA_VIGENCIA' ? 'Fora da vigência' : 'Pendente' }}</strong>
                    <p v-if="item.classification === 'FORA_DA_VIGENCIA'">{{ item.fiscalProfileName }}</p>
                    <div v-if="document.companyId && document.issuerTaxId?.length === 14 && item.supplierProductCode && profilesByCompany[document.companyId]?.length" class="catalog-inline-action">
                      <select v-model="selectedProfiles[itemKey(document, item)]" aria-label="Perfil fiscal do produto">
                        <option value="">Escolher perfil</option>
                        <option v-for="profile in profilesByCompany[document.companyId]" :key="profile.id" :value="profile.id">{{ profile.name }}</option>
                      </select>
                      <button class="button secondary" type="button" :disabled="saving || !selectedProfiles[itemKey(document, item)]" @click="linkItem(document, item)">Vincular</button>
                    </div>
                  </td>
                </tr>
              </tbody>
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
