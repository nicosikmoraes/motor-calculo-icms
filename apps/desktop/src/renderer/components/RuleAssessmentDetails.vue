<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { ItemClassificationReasonCode, RuleAssessmentPendingCode, type ItemRuleAssessment } from '@motor/contracts'

const props = defineProps<{ assessment: ItemRuleAssessment | undefined; originalAssessment?: ItemRuleAssessment | undefined }>()

const fieldLabels: Record<string, string> = {
  originState: 'UF de origem', destinationState: 'UF de destino', cfop: 'CFOP',
  issuerRegime: 'CRT', cst: 'CST', merchandiseOrigin: 'origem da mercadoria',
  operationType: 'direção da operação', purpose: 'finalidade',
  companyId: 'empresa', supplierProductId: 'produto vinculado', fiscalProfileId: 'perfil fiscal',
  ncm: 'NCM', cest: 'CEST', finalConsumer: 'consumidor final',
}
enum PendingMessage {
  REGRA_NAO_ENCONTRADA = 'Nenhuma regra aprovada e vigente atende ao item. Revise o catálogo de regras.',
  REGRA_AMBIGUA = 'Duas ou mais regras têm a mesma precedência. Revise as condições ou a prioridade.',
  PRODUTO_NAO_CLASSIFICADO = 'O produto não está vinculado a um perfil fiscal ativo. Revise o cadastro do produto.',
  DIVERGENCIA_CADASTRAL = 'O vínculo ou perfil fiscal do produto está inativo, ausente ou fora da vigência. Revise o cadastro.',
}
const pendingMessage: Record<RuleAssessmentPendingCode, PendingMessage> = {
  [RuleAssessmentPendingCode.REGRA_NAO_ENCONTRADA]: PendingMessage.REGRA_NAO_ENCONTRADA,
  [RuleAssessmentPendingCode.REGRA_AMBIGUA]: PendingMessage.REGRA_AMBIGUA,
  [RuleAssessmentPendingCode.PRODUTO_NAO_CLASSIFICADO]: PendingMessage.PRODUTO_NAO_CLASSIFICADO,
  [RuleAssessmentPendingCode.DIVERGENCIA_CADASTRAL]: PendingMessage.DIVERGENCIA_CADASTRAL,
}
const classificationDetail: Partial<Record<ItemClassificationReasonCode, string>> = {
  [ItemClassificationReasonCode.PRODUCT_CODE_MISSING]: 'Código do produto ausente no XML.',
  [ItemClassificationReasonCode.PRODUCT_NOT_LINKED]: 'Produto sem vínculo cadastrado para este fornecedor e empresa.',
  [ItemClassificationReasonCode.PRODUCT_INACTIVE]: 'Vínculo do produto inativo.',
  [ItemClassificationReasonCode.PROFILE_NOT_FOUND]: 'Perfil associado ao produto não encontrado.',
  [ItemClassificationReasonCode.PROFILE_INACTIVE]: 'Perfil associado ao produto inativo.',
  [ItemClassificationReasonCode.PROFILE_NOT_YET_VALID]: 'Perfil ainda não vigente na emissão da nota.',
  [ItemClassificationReasonCode.PROFILE_EXPIRED]: 'Perfil vencido na emissão da nota.',
}
const matchingDrafts = computed(() => (props.assessment?.evaluated ?? []).filter((rule) =>
  rule.status === 'DRAFT' && rule.exclusionReasons.every((reason) => reason === 'NOT_APPROVED'),
))
const assessedContext = computed(() => Object.entries(props.assessment?.context ?? {})
  .map(([field, value]) => `${fieldLabels[field] || field}: ${value}`).join(' · '))
const changedFromOriginal = computed(() => {
  if (!props.assessment || !props.originalAssessment) return false
  return JSON.stringify({ kind: props.assessment.kind, selectedRuleId: props.assessment.selectedRuleId,
    selectedRuleVersion: props.assessment.selectedRuleVersion, tiedRuleIds: props.assessment.tiedRuleIds,
    pendingCodes: props.assessment.pendingCodes, pendingDetail: props.assessment.pendingDetail,
    evaluated: props.assessment.evaluated }) !== JSON.stringify({
    kind: props.originalAssessment.kind, selectedRuleId: props.originalAssessment.selectedRuleId,
    selectedRuleVersion: props.originalAssessment.selectedRuleVersion, tiedRuleIds: props.originalAssessment.tiedRuleIds,
    pendingCodes: props.originalAssessment.pendingCodes, pendingDetail: props.originalAssessment.pendingDetail,
    evaluated: props.originalAssessment.evaluated,
  })
})
const heading = computed(() => {
  if (!props.assessment) return 'Avaliação histórica indisponível'
  if (props.assessment.kind === 'DRAFT_MATCH') return `${matchingDrafts.value.length} regra(s) compatível(is), cálculo pendente`
  if (props.assessment.kind === 'SELECTED') return 'Regra aprovada selecionada'
  if (props.assessment.kind === 'AMBIGUOUS') return 'Regras empatadas: revisão necessária'
  return 'Nenhuma regra aprovada corresponde a este item'
})
</script>

<template>
  <details class="rule-assessment">
    <summary>{{ heading }}</summary>
    <div v-if="assessment" class="rule-assessment-body">
      <p>Avaliação registrada em {{ new Date(assessment.assessedAt).toLocaleString('pt-BR') }} · pacote {{ assessment.packId }} · versão {{ assessment.packVersion }}. Esta avaliação não calcula imposto.</p>
      <p v-if="originalAssessment">Comparação com a importação: {{ changedFromOriginal ? 'resultado alterado' : 'mesmo resultado' }} · pacote original {{ originalAssessment.packId }} v{{ originalAssessment.packVersion }}.</p>
      <p v-if="assessedContext">Dados usados: {{ assessedContext }}.</p>
      <div v-if="assessment.pendingCodes?.length" class="pending-reasons">
        <strong>Pendências desta avaliação</strong>
        <ul>
          <li v-for="code in assessment.pendingCodes" :key="code"><code>{{ code }}</code>: {{ pendingMessage[code] }}</li>
        </ul>
        <p v-if="assessment.pendingDetail && classificationDetail[assessment.pendingDetail]">{{ classificationDetail[assessment.pendingDetail] }}</p>
      </div>
      <ul>
        <li v-for="rule in assessment.evaluated" :key="rule.ruleId">
          <strong>{{ rule.ruleName }} <small>v{{ rule.version ?? 1 }} · {{ rule.source === 'LOCAL' ? 'catálogo local' : 'proposta embarcada' }}</small></strong>
          <span v-if="rule.exclusionReasons.includes('SUPERSEDED')">Versão substituída por uma versão mais nova desta família.</span>
          <span v-else-if="rule.status === 'REVOKED'">Versão revogada; não participa da seleção.</span>
          <span v-else-if="rule.exclusionReasons.includes('NOT_YET_VALID')">Ainda não vigente.</span>
          <span v-else-if="rule.exclusionReasons.includes('EXPIRED')">Fora da vigência.</span>
          <span v-else-if="rule.mismatchedConditions.length">Não corresponde: {{ rule.mismatchedConditions.map((field) => fieldLabels[field] || field).join(', ') }}.</span>
          <span v-else-if="rule.status === 'DRAFT'">Condições correspondem, mas a versão é rascunho. {{ rule.proposedRate ? 'Alíquota proposta de ' + rule.proposedRate + '%. ' : '' }}Nenhum cálculo é liberado.</span>
          <span v-else-if="assessment.selectedRuleId === rule.ruleId">Selecionada pela precedência: nível {{ rule.level }}, {{ Object.keys(rule.conditions ?? {}).length }} condição(ões), prioridade {{ rule.priority }}.</span>
          <span v-else-if="assessment.tiedRuleIds?.includes(rule.ruleId)">Empatada na maior precedência; seleção pendente.</span>
          <span v-else>Compatível, mas com precedência inferior à selecionada.</span>
        </li>
      </ul>
      <RouterLink to="/regras">Ver catálogo de regras</RouterLink>
    </div>
    <p v-else class="rule-assessment-body">Este lote foi criado antes do registro das avaliações por item. O resultado original não pode ser reconstruído com segurança.</p>
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
.pending-reasons { margin-bottom: 10px; padding: 8px; border-radius: 6px; background: #fff1d3; color: #5d431c; }
.pending-reasons ul { margin: 5px 0; }
.pending-reasons code { font-size: 10px; }
.rule-assessment-body a { color: #3659a0; font-weight: 700; }
</style>
