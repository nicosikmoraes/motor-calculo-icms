<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import type { PackConflictChoice, PackImportPreview, PackEntity } from '@motor/contracts'
import { RendererErrorMessage } from '../error-messages'
const busy = ref(false), error = ref(''), success = ref('')
const preview = ref<PackImportPreview | null>(null)
const choices = ref<Record<string, PackConflictChoice>>({})
const entityLabels: Record<PackEntity, string> = { companies: 'Empresas', profiles: 'Perfis fiscais', products: 'Produtos de fornecedor', rules: 'Regras locais' }
const statusLabels = { NEW: 'Novo', SAME: 'Já existente', CONFLICT: 'Conflito', BLOCKED: 'Bloqueado' }
const fieldLabels: Record<string, string> = { legalName: 'Razão social', tradeName: 'Nome fantasia', cnpj: 'CNPJ', state: 'UF',
  active: 'Situação', companyId: 'Empresa', name: 'Nome', validFrom: 'Vigente desde', validUntil: 'Vigente até',
  supplierCnpj: 'CNPJ do fornecedor', productCode: 'Código do produto', profileId: 'Perfil fiscal',
  familyId: 'Família', version: 'Versão', status: 'Estado', level: 'Nível', priority: 'Prioridade',
  priorityReason: 'Justificativa', legalBasis: 'Fundamento legal', conditions: 'Condições' }
const blocked = computed(() => preview.value?.rows.some((row) => row.status === 'BLOCKED') ?? false)
const conflicts = computed(() => preview.value?.rows.filter((row) => row.status === 'CONFLICT').length ?? 0)
const filter = ref('ALL'), page = ref(0)
const filteredRows = computed(() => preview.value?.rows.filter((row) => filter.value === 'ALL' || row.status === filter.value) ?? [])
const pageCount = computed(() => Math.max(1, Math.ceil(filteredRows.value.length / 30)))
const visibleRows = computed(() => filteredRows.value.slice(page.value * 30, (page.value + 1) * 30))
watch(filter, () => { page.value = 0 })
const newcomers = computed(() => preview.value?.rows.filter((row) => row.status === 'NEW').length ?? 0)
function localTime(value: string): string { return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value)) }
function message(cause: unknown): string { return cause instanceof Error ? cause.message : RendererErrorMessage.OPERATION_FAILED }
async function exportPackage(): Promise<void> {
  busy.value = true; error.value = ''; success.value = ''
  try {
    const result = await window.desktopApi.exportPack()
    if (result) success.value = `Pacote exportado para ${result.path}.`
  } catch (cause) { error.value = message(cause) }
  finally { busy.value = false }
}
async function selectPackage(): Promise<void> {
  busy.value = true; error.value = ''; success.value = ''
  try {
    const selected = await window.desktopApi.previewPack()
    if (selected) {
      preview.value = selected
      filter.value = 'ALL'; page.value = 0
      choices.value = Object.fromEntries(selected.rows.filter((row) => row.status === 'CONFLICT').map((row) => [row.key, 'KEEP_LOCAL']))
    }
  } catch (cause) { error.value = message(cause) }
  finally { busy.value = false }
}
async function cancelPreview(): Promise<void> {
  const token = preview.value?.token
  preview.value = null; choices.value = {}
  if (token) await window.desktopApi.discardPack(token).catch(() => {})
}
async function importPackage(): Promise<void> {
  if (!preview.value || blocked.value) return
  busy.value = true; error.value = ''; success.value = ''
  try {
    const result = await window.desktopApi.importPack({ token: preview.value.token, choices: { ...choices.value } })
    preview.value = null; choices.value = {}
    success.value = `Importação concluída: ${result.created} cadastro(s) criado(s), ${result.updated} atualizado(s) e ${result.kept} mantido(s).`
  } catch (cause) { error.value = message(cause) }
  finally { busy.value = false }
}
onUnmounted(() => { void cancelPreview() })
</script>

<template>
  <section class="transfer-page">
    <header class="page-header"><p class="eyebrow">Transferência de cadastros</p><h1>Exportar e importar</h1>
      <p>Leve empresas, perfis fiscais, vínculos de produtos e regras locais aprovadas para outro computador.</p></header>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p>
    <p v-if="success" class="success-message" role="status">{{ success }}</p>
    <div class="transfer-actions">
      <article class="card"><h2>Exportar cadastros</h2><p>Escolha onde salvar o pacote .icmspack com os cadastros deste dispositivo.</p>
        <button class="button secondary" :disabled="busy" @click="exportPackage">Exportar pacote</button></article>
      <article class="card"><h2>Importar cadastros</h2><p>Selecione um pacote, confira as novidades e resolva os conflitos antes de confirmar.</p>
        <button class="button primary" :disabled="busy" @click="selectPackage">{{ busy ? 'Aguarde…' : preview ? 'Selecionar outro pacote' : 'Selecionar pacote' }}</button></article>
    </div>
    <section v-if="preview" class="card preview" aria-labelledby="preview-title">
      <header><h2 id="preview-title">Revisar {{ preview.fileName }}</h2><p>Gerado em {{ localTime(preview.createdAt) }} · aplicativo {{ preview.appVersion }}</p></header>
      <dl class="counts"><div v-for="(count, entity) in preview.counts" :key="entity"><dt>{{ entityLabels[entity] }}</dt><dd>{{ count }}</dd></div></dl>
      <p>{{ newcomers }} cadastro(s) novo(s) e {{ conflicts }} conflito(s). Cadastros iguais serão mantidos.</p>
      <p class="hint">Novas regras aprovadas poderão ser selecionadas em futuras avaliações. As avaliações já registradas permanecem preservadas.</p>
      <p v-if="blocked" class="form-error" role="alert">Há colisões de identidade que impedem a importação. Corrija o pacote de origem e selecione-o novamente.</p>
      <label class="resolution"><span>Exibir cadastros</span><select v-model="filter"><option value="ALL">Todos</option><option value="CONFLICT">Conflitos</option><option value="NEW">Novos</option><option value="BLOCKED">Bloqueados</option><option value="SAME">Já existentes</option></select></label>
      <div class="preview-rows">
        <article v-for="row in visibleRows" :key="row.key" class="preview-row">
          <div class="row-heading"><div><small>{{ entityLabels[row.entity] }}</small><h3>{{ row.label }}</h3></div><span class="badge" :class="row.status.toLowerCase()">{{ statusLabels[row.status] }}</span></div>
          <p v-if="row.reason" class="hint">{{ row.reason }}</p>
          <details v-if="row.differences.length" :open="row.status === 'CONFLICT'">
            <summary>{{ row.status === 'NEW' ? 'Ver cadastro recebido' : 'Comparar valores' }}</summary>
            <div class="table-scroll"><table><thead><tr><th>Campo</th><th>Neste dispositivo</th><th>No pacote</th></tr></thead>
              <tbody><tr v-for="difference in row.differences" :key="difference.field"><th>{{ fieldLabels[difference.field] ?? difference.field }}</th><td>{{ difference.local }}</td><td>{{ difference.incoming }}</td></tr></tbody></table></div>
          </details>
          <label v-if="row.status === 'CONFLICT'" class="resolution"><span>Resolução para {{ row.label }}</span><select v-model="choices[row.key]" :disabled="busy">
            <option value="KEEP_LOCAL">Manter cadastro local</option><option v-if="row.canUsePackage" value="USE_PACKAGE">Usar valores do pacote</option></select></label>
        </article>
      </div>
      <div v-if="pageCount > 1" class="buttons"><button class="button secondary" :disabled="page === 0" @click="page--">Anterior</button><span>Página {{ page + 1 }} de {{ pageCount }}</span><button class="button secondary" :disabled="page + 1 >= pageCount" @click="page++">Próxima</button></div>
      <p v-if="!filteredRows.length && preview.rows.length" class="hint">Nenhum cadastro neste filtro.</p>
      <p v-if="!preview.rows.length" class="hint">Este pacote está vazio.</p>
      <div class="buttons"><button class="button primary" :disabled="busy || blocked || !preview.rows.length" @click="importPackage">Confirmar importação</button>
        <button class="button secondary" :disabled="busy" @click="cancelPreview">Cancelar revisão</button></div>
    </section>
  </section>
</template>

<style scoped>
.page-header { display: block; }
.page-header h1 { margin: 8px 0 12px; font-size: 32px; letter-spacing: -.04em; }
.page-header p:last-child,.card p { color: #617087; line-height: 1.6; }
.transfer-actions { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 18px; margin: 24px 0; }
.card { padding: 24px; }
.card h2 { margin: 0 0 10px; font-size: 20px; }
.success-message { padding: 14px; background: #e5f6ec; border-radius: 10px; color: #205c3d; overflow-wrap: anywhere; }
.counts { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: 12px; }
.counts div { background: #f0f4fa; padding: 12px; border-radius: 8px; }
.counts dt { color: #617087; font-size: 12px; }.counts dd { margin: 8px 0 0; font-size: 24px; font-weight: 700; }
.preview-rows { display: grid; gap: 12px; margin: 22px 0; }
.preview-row { min-width: 0; border: 1px solid #dfe7f2; border-radius: 10px; padding: 16px; }
.row-heading { display: flex; gap: 14px; justify-content: space-between; align-items: start; }
.row-heading > div { min-width: 0; }
.row-heading h3 { margin: 5px 0 12px; font-size: 15px; overflow-wrap: anywhere; }
.row-heading small { color: #617087; }
.badge { padding: 5px 9px; border-radius: 8px; background: #edf2fa; font-size: 12px; flex-shrink: 0; }
.badge.conflict { background: #fff0ce; }.badge.blocked { background: #ffe0e0; }.badge.new { background: #e4f5ec; }
.table-scroll { max-width: 100%; overflow-x: auto; }table { border-collapse: collapse; table-layout: fixed; width: 100%; margin: 12px 0; font-size: 12px; }
th,td { text-align: left; white-space: normal; vertical-align: top; padding: 9px; border-bottom: 1px solid #e2e8f2; overflow-wrap: anywhere; max-width: 320px; }
summary { cursor: pointer; color: #445776; font-size: 13px; }
.resolution { display: grid; gap: 7px; margin-top: 15px; font-size: 12px; }.resolution select { padding: 10px; border: 1px solid #cbd6e5; border-radius: 8px; background: white; max-width: 360px; }
.hint { font-size: 13px; }.buttons { display: flex; gap: 12px; flex-wrap: wrap; }
@media (max-width: 900px) { .counts { grid-template-columns: repeat(2,minmax(0,1fr)); } }
@media (max-width: 650px) { .transfer-actions { grid-template-columns: 1fr; } .card { padding: 18px; } }
</style>
