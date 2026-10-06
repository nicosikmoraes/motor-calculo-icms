<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { computed, ref } from 'vue'
import type { BatchConsolidation } from '@motor/contracts'
const props = defineProps<{ summary: BatchConsolidation; monthly?: boolean }>()
const company = ref(''), period = ref('')
const companies = computed(() => [...new Map(props.summary.groups.filter(g => g.companyId).map(g => [g.companyId!, g.companyName ?? g.companyId!])).entries()])
const periods = computed(() => [...new Set(props.summary.groups.flatMap(g => g.period ? [g.period] : []))].sort())
const groups = computed(() => props.summary.groups.filter(g => (!company.value || g.companyId === company.value) && (!period.value || g.period === period.value)))
const evidence = computed(() => props.summary.evidence.filter(e => (!company.value || e.companyId === company.value) && (!period.value || e.period === period.value)))
function currency(value: string): string {
  const [integer, cents] = value.split('.')
  return `R$ ${integer!.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${cents ?? '00'}`
}
</script>
<template>
  <section class="section-stack" :aria-label="monthly ? 'Conferência mensal' : 'Consolidação do lote'">
    <h2>Conferência por empresa e mês</h2>
    <p>Últimos cálculos salvos {{ monthly ? 'dos lotes da empresa' : 'deste lote' }}, pelo mês de emissão. Compras e vendas são conferidas separadamente. Créditos de compras e saldo de ICMS a recolher ainda não são apurados.</p>
    <div v-if="!monthly" class="card">
      <label>Empresa <select v-model="company"><option value="">Todas</option><option v-for="[id, name] in companies" :key="id" :value="id">{{ name }}</option></select></label>
      <label>Mês <select v-model="period"><option value="">Todos</option><option v-for="month in periods" :key="month" :value="month">{{ month }}</option></select></label>
    </div>
    <article v-for="(group, index) in groups" :key="index" class="card">
      <h3>{{ group.companyName ?? 'Empresa não identificada' }} · {{ group.period ?? 'Emissão inválida' }} · {{ group.perspective === 'SALES' ? 'Vendas' : group.perspective === 'PURCHASES' ? 'Compras' : 'Operação não identificada' }}</h3>
      <p>{{ group.environment === '1' ? 'Produção' : group.environment === '2' ? 'Homologação' : 'Ambiente desconhecido' }} · {{ group.authorization === 'WITH_PROTOCOL' ? 'Com protocolo de autorização associado' : 'Sem protocolo de autorização confirmado — subtotal provisório' }}</p>
      <div class="table-wrap"><table><thead><tr><th>Base calculada</th><th>ICMS calculado</th><th>ICMS declarado elegível</th><th>ICMS diferido conhecido</th></tr></thead><tbody><tr><td>{{ currency(group.totals.calculatedBase) }}</td><td>{{ currency(group.totals.calculatedIcms) }}</td><td>{{ currency(group.totals.declaredIcms) }}</td><td>{{ currency(group.totals.deferredIcms) }}</td></tr></tbody></table></div>
      <p>{{ group.counts.documents }} {{ monthly ? 'ocorrências de notas' : 'notas' }} · {{ group.counts.calculated }} itens calculados · {{ group.counts.pending }} pendentes · {{ group.counts.unsupported }} fora do escopo · {{ group.counts.excluded }} excluídos</p>
      <p>Comparação de {{ group.counts.comparableItems }} itens com ambos os valores: calculado {{ currency(group.totals.comparedCalculatedIcms) }}; declarado {{ currency(group.totals.comparedDeclaredIcms) }}. Diferença líquida {{ currency(group.totals.difference) }}; soma das diferenças absolutas {{ currency(group.totals.absoluteDifferences) }}.</p>
      <p>{{ group.counts.divergentItems }} divergências acima de R$ 0,01 por item · {{ group.counts.withinToleranceItems }} diferenças dentro da tolerância. Declaração ausente: {{ group.counts.declaredMissing }}; inválida: {{ group.counts.declaredInvalid }}; diferimento sem informação: {{ group.counts.deferredMissing }}.</p>
    </article>
    <details class="card"><summary>Rastreabilidade dos {{ evidence.length }} itens selecionados</summary>
      <ul><li v-for="entry in evidence" :key="`${entry.documentId}:${entry.itemNumber}`">Nota {{ entry.documentNumber }}, item {{ entry.itemNumber }} — {{ entry.status }}<br><RouterLink v-if="monthly && entry.batchId" :to="{ path: `/lotes/${entry.batchId}`, hash: `#item-${entry.documentId}-${entry.itemNumber}` }">Abrir nota e item no lote de origem</RouterLink><br>Chave {{ entry.accessKey }} · execução {{ entry.runId ?? 'não salva' }} · motor {{ entry.engineVersion ?? 'indisponível' }}<br><span v-for="reason in entry.reasons" :key="reason">{{ reason }} </span><span v-if="entry.comparison">Diferença: {{ currency(entry.comparison.difference ?? '0.00') }}</span></li></ul>
    </details>
  </section>
</template>
