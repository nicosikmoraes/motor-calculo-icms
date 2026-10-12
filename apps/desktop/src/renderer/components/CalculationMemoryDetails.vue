<script setup lang="ts">
import { itemCalculationComponents, itemCalculationStatus, taxComponentLabel, type ItemCalculationSummary } from '@motor/contracts'
import { computed } from 'vue'

const props = defineProps<{ calculation: ItemCalculationSummary }>()
const components = computed(() => itemCalculationComponents(props.calculation))
const visibleInputs = (component: ItemCalculationSummary) => component.inputs.filter(input => !['fiscalAnswers', 'answerRequestId', 'answerReuseScope', 'definitionAtSave', 'reuseDefinitionId', 'reuseSourceRunId'].includes(input.name))
const reused = computed(() => props.calculation.inputs.some(input => input.name === 'reuseDefinitionId'))
const comparisonLabels = { MATCH: 'Confere', WITHIN_TOLERANCE: 'Dentro da tolerância', DIFFERENT: 'Divergência', NOT_DECLARED: 'Não informado no XML', INVALID_DECLARED: 'Valor declarado inválido' }
</script>

<template>
  <details class="calculation-memory">
    <summary>{{ itemCalculationStatus(calculation) === 'CALCULATED' ? 'Memória do cálculo' : 'Cálculo fiscal pendente' }}</summary>
    <p v-if="calculation.reviewReason">{{ calculation.reviewReason }}</p>
    <div v-for="component in components" :key="component.component ?? component.result?.component ?? 'ICMS'" class="calculation-body">
      <p><strong>{{ taxComponentLabel(component.component ?? component.result?.component) }}</strong></p>
      <p v-if="component.reason">{{ component.reason }}</p>
      <p v-if="reused">Respostas reaproveitadas de uma definição anterior desta empresa e produto do fornecedor.</p>
      <p v-if="calculation.runId">Execução {{ calculation.runId }} · Motor {{ calculation.engineVersion }}</p>
      <p v-if="component.rule">Regra {{ component.rule.id }} · versão {{ component.rule.version }} · {{ component.rule.legalBasis }}</p>
      <p v-if="visibleInputs(component).length"><strong>Entradas:</strong></p>
      <ul v-if="visibleInputs(component).length">
        <li v-for="input in visibleInputs(component)" :key="input.name">
          {{ input.name }}: {{ input.value ?? 'ausente' }} · {{ input.source }} · {{ input.treatment === 'UNDECIDED' ? 'tratamento pendente' : input.treatment === 'INCLUDED' ? 'incluído' : 'excluído' }}
        </li>
      </ul>
      <p v-if="component.declared">Declarado no XML ({{ taxComponentLabel(component.component ?? component.result?.component) }}): base {{ component.declared.base ?? '—' }} · alíquota {{ component.declared.rate ?? '—' }} · valor {{ component.declared.amount ?? '—' }}</p>
      <ol v-if="component.steps.length">
        <li v-for="(step, index) in component.steps" :key="index">{{ step.name }}: {{ step.operation }} = {{ step.result }}</li>
      </ol>
      <p v-if="component.result"><strong>{{ `${taxComponentLabel(component.result.component)} calculado:` }}</strong> base {{ component.result.base }} · alíquota {{ component.result.rate }} · {{ taxComponentLabel(component.result.component) }} {{ component.result.amount }}</p>
      <p v-else>Nenhum valor calculado foi aprovado para este item.</p>
      <template v-if="component.comparisons?.length">
        <p><strong>Conferência com o XML:</strong> diferença = calculado − declarado.</p>
        <ul><li v-for="comparison in component.comparisons" :key="comparison.component">
          {{ comparison.component === 'BASE' ? 'Base' : comparison.component === 'RATE' ? 'Alíquota (%)' : taxComponentLabel(comparison.component) }}: {{ comparisonLabels[comparison.status] }}
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
