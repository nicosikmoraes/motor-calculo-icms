<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import type { BatchDetail, FiscalProfileSummary, FiscalItemSummary, FiscalDocumentSummary } from '@motor/contracts'
import ItemClassificationDetails from '../components/ItemClassificationDetails.vue'
import RuleAssessmentDetails from '../components/RuleAssessmentDetails.vue'
import CalculationMemoryDetails from '../components/CalculationMemoryDetails.vue'

const route = useRoute()
const detail = ref<BatchDetail | null>(null)
const error = ref('')
const notice = ref('')
const saving = ref(false)
const profilesByCompany = ref<Record<string, readonly FiscalProfileSummary[]>>({})
const selectedProfiles = ref<Record<string, string>>({})
const pendingItems = computed(() => detail.value?.documents.flatMap((document) =>
  document.items
    .filter((item) => item.classification !== 'CLASSIFICADO')
    .map((item) => ({ document, item })),
) ?? [])

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
            <p>Classificação cadastral, sem cálculo de imposto. O pacote de regras propostas é avaliado separadamente, sem cálculo de imposto. <RouterLink to="/perfis">Gerenciar perfis fiscais</RouterLink>.</p>
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
                    <ItemClassificationDetails :item="item" />
                    <RuleAssessmentDetails :assessment="item.ruleAssessment" />
                    <CalculationMemoryDetails :calculation="item.calculation" />
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
        <h3>Pendências cadastrais <small>{{ pendingItems.length }}</small></h3>
        <p v-if="!pendingItems.length" class="empty-state">Nenhum item com classificação cadastral pendente.</p>
        <div v-else class="item-pendency-grid">
          <article v-for="{ document, item } in pendingItems" :key="itemKey(document, item)" class="card item-pendency-card">
            <p class="item-pendency-context">NF-e {{ document.number }} · Item {{ item.itemNumber }} · {{ item.description || item.supplierProductCode || 'Produto sem descrição' }}</p>
            <ItemClassificationDetails :item="item" expanded />
            <RuleAssessmentDetails :assessment="item.ruleAssessment" />
            <CalculationMemoryDetails :calculation="item.calculation" />
          </article>
        </div>
      </section>

      <section class="detail-section">
        <h3>Diagnósticos de ingestão</h3>
        <ul v-if="detail.diagnostics.length" class="card diagnostic-list"><li v-for="diagnostic in detail.diagnostics" :key="diagnostic.id"><strong>{{ diagnostic.code }}</strong><span>{{ diagnostic.source }}</span><p>{{ diagnostic.message }}</p></li></ul>
        <p v-else class="empty-state">Nenhum diagnóstico de ingestão registrado.</p>
      </section>
    </template>
  </section>
</template>

<style scoped>
.item-pendency-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr)); gap: 14px; }
.item-pendency-card { min-width: 0; padding: 18px 20px; }
.item-pendency-context { margin: 0 0 12px; color: #56647a; font-size: 12px; font-weight: 700; overflow-wrap: anywhere; }
.detail-section h3 small { margin-left: 6px; color: #69788d; font-size: 13px; }
.back-link { display: inline-block; margin-bottom: 24px; color: #8b4b2b; font-weight: 700; text-decoration: none; }
.detail-header { margin-bottom: 28px; }
.detail-header .lead { font-size: 14px; word-break: break-all; }
.document-card { margin-bottom: 14px; padding: 24px; }
.document-heading { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
.document-heading > div { display: grid; gap: 4px; }
.document-heading strong { font: 700 21px Georgia, serif; }
.document-heading span { color: #69736d; font-size: 13px; }
.document-data { display: grid; grid-template-columns: 1.5fr 1fr 1fr; gap: 16px; margin: 20px 0; }
.document-data div { min-width: 0; }
.document-data dt { color: #7b847f; font-size: 11px; font-weight: 800; text-transform: uppercase; }
.document-data dd { overflow: hidden; margin: 5px 0 0; color: #36423b; text-overflow: ellipsis; }
.diagnostic-list { margin: 0; padding: 8px 24px; list-style: none; }
.diagnostic-list li { display: grid; grid-template-columns: 210px 1fr; gap: 5px 16px; padding: 16px 0; border-bottom: 1px solid #e4dfd4; }
.diagnostic-list li:last-child { border-bottom: 0; }
.diagnostic-list span { color: #69736d; font-size: 12px; }
.diagnostic-list p { grid-column: 1 / -1; margin: 0; color: #4e5a53; }
@media (max-width: 850px) {
  .document-data { grid-template-columns: 1fr; }
}
.document-data { grid-template-columns: 1.4fr 1.3fr 1fr 1fr; }
.document-heading strong { color: #1d2e4c; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
.diagnostic-list li { border-bottom-color: #e8edf4; }
@media (max-width: 900px) {
  .document-data { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 650px) {
  .document-data { grid-template-columns: 1fr; }
}
.catalog-inline-action { display: flex; align-items: center; gap: 7px; margin-top: 9px; min-width: 260px; }
.catalog-inline-action select { flex: 1; min-width: 150px; min-height: 34px; font-size: 12px; }
.catalog-inline-action .button { flex: none; padding: 8px 10px; font-size: 11px; }
.document-card td small { display: block; margin-top: 3px; color: #7a879b; }
.document-data dd { overflow: visible; text-overflow: clip; overflow-wrap: anywhere; }
.document-heading > div { min-width: 0; }
.document-heading strong, .diagnostic-list li > * { overflow-wrap: anywhere; }
.document-heading .status-pill { max-width: 50%; white-space: normal; text-align: center; }
.diagnostic-list li { grid-template-columns: minmax(0, 210px) minmax(0, 1fr); }
.catalog-inline-action { flex-wrap: wrap; min-width: 0; }
.catalog-inline-action select { flex: 1 1 150px; min-width: 0; }
.document-card td:nth-child(2), .document-card td:last-child { max-width: 280px; white-space: normal; overflow-wrap: anywhere; }
@media (max-width: 650px) {
  .document-heading { align-items: flex-start; flex-direction: column; }
}
@media (max-width: 650px) {
  .document-heading .status-pill { max-width: 100%; }
}
@media (max-width: 650px) {
  .diagnostic-list li { grid-template-columns: 1fr; }
}
@media (max-width: 650px) {
  .diagnostic-list p { grid-column: 1; }
}
</style>
