<script setup lang="ts">
import type { ItemCalculationSummary } from '@motor/contracts'
import { computed } from 'vue'

const props = defineProps<{ calculation: ItemCalculationSummary }>()
const visibleInputs = computed(() => props.calculation.inputs.filter(input => !['fiscalAnswers', 'answerRequestId', 'answerReuseScope', 'definitionAtSave', 'reuseDefinitionId', 'reuseSourceRunId'].includes(input.name)))
const reused = computed(() => props.calculation.inputs.some(input => input.name === 'reuseDefinitionId'))
const comparisonLabels = { MATCH: 'Confere', WITHIN_TOLERANCE: 'Dentro da tolerância', DIFFERENT: 'Divergência', NOT_DECLARED: 'Não informado no XML', INVALID_DECLARED: 'Valor declarado inválido' }
</script>

<template>
  <details class="calculation-memory">
    <summary>{{ calculation.status === 'CALCULATED' ? 'Memória do cálculo' : 'Cálculo fiscal pendente' }}</summary>
    <div class="calculation-body">
      <p v-if="calculation.reason">{{ calculation.reason }}</p>
      <p v-if="reused">Respostas reaproveitadas de uma definição anterior desta empresa e produto do fornecedor.</p>
      <p v-if="calculation.runId">Execução {{ calculation.runId }} · Motor {{ calculation.engineVersion }}</p>
      <p v-if="calculation.rule">Regra {{ calculation.rule.id }} · versão {{ calculation.rule.version }} · {{ calculation.rule.legalBasis }}</p>
      <p v-if="visibleInputs.length"><strong>Entradas:</strong></p>
      <ul v-if="visibleInputs.length">
        <li v-for="input in visibleInputs" :key="input.name">
          {{ input.name }}: {{ input.value ?? 'ausente' }} · {{ input.source }} · {{ input.treatment === 'UNDECIDED' ? 'tratamento pendente' : input.treatment === 'INCLUDED' ? 'incluído' : 'excluído' }}
        </li>
      </ul>
      <p v-if="calculation.declared">Declarado no XML: base {{ calculation.declared.base ?? '—' }} · alíquota {{ calculation.declared.rate ?? '—' }} · ICMS {{ calculation.declared.amount ?? '—' }}</p>
      <ol v-if="calculation.steps.length">
        <li v-for="(step, index) in calculation.steps" :key="index">{{ step.name }}: {{ step.operation }} = {{ step.result }}</li>
      </ol>
      <p v-if="calculation.result"><strong>Calculado:</strong> base {{ calculation.result.base }} · alíquota {{ calculation.result.rate }} · ICMS {{ calculation.result.amount }}</p>
      <p v-else>Nenhum valor calculado foi aprovado para este item.</p>
      <template v-if="calculation.comparisons?.length">
        <p><strong>Conferência com o XML:</strong> diferença = calculado − declarado.</p>
        <ul><li v-for="comparison in calculation.comparisons" :key="comparison.component">
          {{ comparison.component === 'BASE' ? 'Base do ICMS' : 'ICMS devido' }}: {{ comparisonLabels[comparison.status] }}
          · calculado {{ comparison.calculated }} · declarado {{ comparison.declared ?? '—' }}
          · diferença {{ comparison.difference ?? '—' }} · tolerância {{ comparison.tolerance }}
        </li></ul>
        <p>A tolerância é apenas de conferência; não altera o imposto calculado.</p>
      </template>
    </div>
  </details>
</template>

<style scoped>
.calculation-memory { margin-top: 8px; min-width: 0; overflow-wrap: anywhere; }
.calculation-memory summary { color: #71551c; font-size: 11px; font-weight: 700; cursor: pointer; }
.calculation-body { margin-top: 7px; padding: 10px; border: 1px solid #e8dfc9; border-radius: 8px; background: #fffaf0; font-size: 11px; line-height: 1.5; }
.calculation-body p { margin: 0 0 7px; }
.calculation-body p:last-child { margin-bottom: 0; }
.calculation-body ul, .calculation-body ol { margin: 0 0 7px; padding-left: 18px; }
</style>
