<script setup lang="ts">
import { onMounted, ref } from 'vue'
import {
  RegistrationEntityCode, RegistrationOperationCode,
  type RegistrationAuditEvent, type RegistrationAuditFilter,
} from '@motor/contracts'
import { RendererErrorMessage } from '../error-messages'

const events = ref<readonly RegistrationAuditEvent[]>([])
const entity = ref<RegistrationEntityCode | ''>('')
const operation = ref<RegistrationOperationCode | ''>('')
const entityId = ref('')
const from = ref('')
const until = ref('')
const loading = ref(false)
const error = ref('')

const entityLabels: Record<RegistrationEntityCode, string> = {
  ORGANIZATION: 'Escritório', COMPANY: 'Empresa',
  FISCAL_PROFILE: 'Perfil fiscal', SUPPLIER_PRODUCT: 'Produto do fornecedor',
}
const operationLabels: Record<RegistrationOperationCode, string> = {
  CREATE: 'Criação', UPDATE: 'Edição', INACTIVATE: 'Inativação', REACTIVATE: 'Reativação',
}
const fieldLabels: Record<string, string> = {
  name: 'Nome', legalName: 'Razão social', tradeName: 'Nome fantasia', cnpj: 'CNPJ',
  state: 'UF', active: 'Ativo', validFrom: 'Vigente desde', validUntil: 'Vigente até',
  supplierCnpj: 'CNPJ do fornecedor', productCode: 'Código do produto', profileId: 'Perfil fiscal',
}
function valueLabel(value: string | number | boolean | null): string {
  if (value === null) return '—'
  if (value === true) return 'Sim'
  if (value === false) return 'Não'
  return String(value)
}
function timestamp(value: string): string { return new Date(value).toLocaleString('pt-BR') }
function dateFilter(value: string, end = false): string | undefined {
  return value ? new Date(`${value}T${end ? '23:59:59.999' : '00:00:00.000'}`).toISOString() : undefined
}
async function load(): Promise<void> {
  loading.value = true
  error.value = ''
  try {
    const filter: RegistrationAuditFilter = {
      ...(entity.value ? { entity: entity.value } : {}),
      ...(operation.value ? { operation: operation.value } : {}),
      ...(entityId.value.trim() ? { entityId: entityId.value.trim() } : {}),
      ...(from.value ? { from: dateFilter(from.value)! } : {}),
      ...(until.value ? { until: dateFilter(until.value, true)! } : {}),
    }
    events.value = await window.desktopApi.listRegistrationAudit(filter)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : RendererErrorMessage.REGISTRATIONS_LOAD
  } finally { loading.value = false }
}
onMounted(() => void load())
</script>

<template>
  <section>
    <header class="page-header compact">
      <div><p class="eyebrow">Cadastros</p><h2>Histórico de alterações</h2>
        <p class="lead">Criações e alterações realizadas nesta instalação.</p></div>
    </header>
    <form class="card audit-filters" @submit.prevent="load">
      <label><span>Cadastro</span><select v-model="entity"><option value="">Todos</option>
        <option v-for="(label, code) in entityLabels" :key="code" :value="code">{{ label }}</option></select></label>
      <label><span>Operação</span><select v-model="operation"><option value="">Todas</option>
        <option v-for="(label, code) in operationLabels" :key="code" :value="code">{{ label }}</option></select></label>
      <label><span>ID do cadastro</span><input v-model="entityId" placeholder="Opcional" /></label>
      <label><span>De</span><input v-model="from" type="date" /></label>
      <label><span>Até</span><input v-model="until" type="date" /></label>
      <button class="button primary" type="submit" :disabled="loading">{{ loading ? 'Buscando…' : 'Filtrar' }}</button>
    </form>
    <p v-if="error" class="form-error notice" role="alert">{{ error }}</p>
    <p v-if="!loading && !events.length" class="card empty-state">Nenhuma alteração encontrada.</p>
    <ol v-else class="audit-list">
      <li v-for="event in events" :key="event.id" class="card audit-event">
        <div class="audit-head"><strong>{{ operationLabels[event.operation] }} · {{ entityLabels[event.entity] }}</strong>
          <time :datetime="event.createdAt">{{ timestamp(event.createdAt) }}</time></div>
        <p>Revisão {{ event.revision }} · Seu computador</p>
        <ul><li v-for="(change, field) in event.changes" :key="field">
          <strong>{{ fieldLabels[String(field)] ?? field }}:</strong>
          <span v-if="change.before !== null"> {{ valueLabel(change.before) }} → </span>{{ valueLabel(change.after) }}
        </li></ul>
      </li>
    </ol>
  </section>
</template>

<style scoped>
.audit-filters { display: flex; flex-wrap: wrap; gap: 12px; align-items: end; padding: 20px; margin-bottom: 20px; }
.audit-filters label { display: grid; gap: 5px; min-width: 140px; flex: 1; }
.audit-filters label span { font-size: 12px; color: #66758b; }
.audit-filters input, .audit-filters select { min-width: 0; }
.audit-list { list-style: none; display: grid; gap: 12px; padding: 0; }
.audit-event { padding: 20px; }
.audit-head { display: flex; justify-content: space-between; gap: 12px; }
.audit-event p, .audit-event time { color: #68778b; font-size: 13px; }
.audit-event ul { padding-left: 18px; }
.empty-state { padding: 24px; }
</style>
