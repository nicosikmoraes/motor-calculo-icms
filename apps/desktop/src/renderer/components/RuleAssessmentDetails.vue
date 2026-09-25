<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import type { ItemRuleAssessment } from '@motor/contracts'

const props = defineProps<{ assessment: ItemRuleAssessment }>()

const fieldLabels: Record<string, string> = {
  originState: 'UF de origem', destinationState: 'UF de destino', cfop: 'CFOP',
  issuerRegime: 'CRT', cst: 'CST', merchandiseOrigin: 'origem da mercadoria',
  operationType: 'direção da operação', purpose: 'finalidade',
}
const matchingDrafts = computed(() => props.assessment.evaluated.filter((rule) =>
  rule.status === 'DRAFT' && rule.exclusionReasons.every((reason) => reason === 'NOT_APPROVED'),
))
const heading = computed(() => {
  if (props.assessment.kind === 'DRAFT_MATCH') return `${matchingDrafts.value.length} regra(s) compatível(is), cálculo pendente`
  if (props.assessment.kind === 'SELECTED') return 'Regra aprovada selecionada'
  if (props.assessment.kind === 'AMBIGUOUS') return 'Regras empatadas: revisão necessária'
  return 'Nenhuma proposta corresponde a este item'
})
</script>

<template>
  <details class="rule-assessment">
    <summary>{{ heading }}</summary>
    <div class="rule-assessment-body">
      <p>Avaliação atual do pacote {{ assessment.packId }} · versão {{ assessment.packVersion }}. Esta avaliação não calcula imposto.</p>
      <ul>
        <li v-for="rule in assessment.evaluated" :key="rule.ruleId">
          <strong>{{ rule.ruleName }}</strong>
          <span v-if="rule.mismatchedConditions.length">Não corresponde: {{ rule.mismatchedConditions.map((field) => fieldLabels[field] || field).join(', ') }}.</span>
          <span v-else-if="rule.status === 'REVOKED'">Regra revogada.</span>
          <span v-else-if="rule.status === 'DRAFT'">Condições correspondem; alíquota de {{ rule.proposedRate }}% revisada. Cálculo aguarda base, exceções e arredondamento.</span>
          <span v-else-if="rule.exclusionReasons.includes('EXPIRED')">Fora da vigência.</span>
          <span v-else-if="rule.exclusionReasons.includes('NOT_YET_VALID')">Ainda não vigente.</span>
          <span v-else>Condições correspondem à regra aprovada.</span>
        </li>
      </ul>
      <RouterLink to="/regras">Ver propostas e fundamentos</RouterLink>
    </div>
  </details>
</template>

<style scoped>
.rule-assessment { min-width: 0; margin-top: 8px; overflow-wrap: anywhere; }
.rule-assessment summary { color: #71551c; font-size: 11px; font-weight: 700; line-height: 1.35; cursor: pointer; }
.rule-assessment-body { margin-top: 7px; padding: 10px; border: 1px solid #e8dfc9; border-radius: 8px; background: #fffaf0; font-size: 11px; line-height: 1.5; }
.rule-assessment-body p { margin: 0 0 8px; color: #776a52; }
.rule-assessment-body ul { display: grid; gap: 8px; margin: 0 0 9px; padding-left: 15px; }
.rule-assessment-body li > * { display: block; }
.rule-assessment-body li strong { color: #4b3b23; }
.rule-assessment-body li span { color: #706550; }
.rule-assessment-body a { color: #3659a0; font-weight: 700; }
</style>
