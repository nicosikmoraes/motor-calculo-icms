<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import type { CompanySummary, MonthlyConference } from '@motor/contracts'
import BatchConsolidationSummary from '../components/BatchConsolidationSummary.vue'

const route = useRoute(), router = useRouter()
const companies = ref<readonly CompanySummary[]>([])
const companyId = ref('')
const today = new Date()
const period = ref(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`)
const conference = ref<MonthlyConference | null>(null)
const busy = ref(false), error = ref(''), notice = ref('')
watch([companyId, period], () => { conference.value = null; notice.value = ''; error.value = '' })

async function load(): Promise<void> {
  error.value = ''; notice.value = ''; conference.value = null; busy.value = true
  const input = { companyId: companyId.value, period: period.value }
  try {
    conference.value = await window.desktopApi.getMonthlyConference(input)
    await router.replace({ query: { companyId: input.companyId, period: input.period } })
  }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'Não foi possível consultar o mês.' }
  finally { busy.value = false }
}
async function exportExcel(): Promise<void> {
  if (!conference.value) return
  busy.value = true; error.value = ''; notice.value = ''
  try {
    const result = await window.desktopApi.exportMonthlyExcel({ companyId: companyId.value, period: period.value })
    if (result) notice.value = `Conferência salva em ${result.path}`
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Não foi possível exportar o mês.' }
  finally { busy.value = false }
}
onMounted(async () => {
  busy.value = true
  try {
    companies.value = (await window.desktopApi.getWorkspace()).companies
      .slice().sort((a, b) => Number(b.active) - Number(a.active) || a.legalName.localeCompare(b.legalName))
    companyId.value = typeof route.query.companyId === 'string' ? route.query.companyId : companies.value[0]?.id ?? ''
    if (typeof route.query.period === 'string') period.value = route.query.period
    if (route.query.companyId && route.query.period) await load()
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Não foi possível carregar as empresas.' }
  finally { busy.value = false }
})
</script>

<template>
  <section class="section-stack">
    <header class="page-header"><div><p class="eyebrow">Conferência mensal</p><h2>Notas da empresa em todos os lotes</h2>
      <p class="lead">Escolha a empresa e o mês de emissão para conferir os resultados salvos.</p></div></header>
    <form class="card monthly-filters" @submit.prevent="load">
      <label>Empresa <select v-model="companyId" required :disabled="busy"><option value="" disabled>Escolha uma empresa</option>
        <option v-for="company in companies" :key="company.id" :value="company.id">{{ company.legalName }}{{ company.active ? '' : ' (inativa)' }}</option></select></label>
      <label>Mês de emissão <input v-model="period" type="month" required :disabled="busy"></label>
      <button class="button primary" type="submit" :disabled="busy || !companyId || !period">{{ busy ? 'Aguarde…' : 'Consultar / atualizar' }}</button>
      <button class="button secondary" type="button" :disabled="busy || !conference" @click="exportExcel">Exportar Excel mensal</button>
    </form>
    <p v-if="error" class="form-error notice" role="alert">{{ error }}</p>
    <p v-if="notice" class="notice" role="status">{{ notice }}</p>
    <p v-if="!busy && !companies.length" class="empty-state">Cadastre uma empresa para consultar suas notas.</p>
    <template v-if="conference">
      <p>Consulta: {{ conference.companyName }} · {{ conference.period }} · {{ conference.batches.length }} lotes · {{ conference.summary.counts.documents }} ocorrências de notas.
        Atualizado em {{ new Date(conference.summary.generatedAt).toLocaleString('pt-BR') }}.</p>
      <p>Cópias idênticas entram uma vez nos valores; as demais ficam excluídas e rastreáveis. Chaves com conteúdos diferentes ficam fora dos valores até revisão.
        Notas sem empresa ou mês de emissão válido devem ser conferidas no histórico de lotes.</p>
      <p>O Excel consulta novamente os últimos resultados salvos no momento da exportação.</p>
      <p v-if="!conference.summary.counts.documents" class="empty-state">Nenhuma nota encontrada para esta empresa e mês.</p>
      <BatchConsolidationSummary v-else :summary="conference.summary" monthly />
      <details v-if="conference.batches.length" class="card"><summary>Lotes de origem</summary><ul>
        <li v-for="batch in conference.batches" :key="batch.id"><RouterLink :to="`/lotes/${batch.id}`">{{ batch.name }}</RouterLink> · {{ batch.status }} · {{ batch.id }}</li>
      </ul></details>
    </template>
  </section>
</template>

<style scoped>
.monthly-filters { display: flex; align-items: end; gap: 16px; flex-wrap: wrap; padding: 24px; }
.monthly-filters label { display: grid; gap: 8px; flex: 1; min-width: 180px; }
</style>
