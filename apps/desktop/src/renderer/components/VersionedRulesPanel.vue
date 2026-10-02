<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { RuleDraftFields, VersionedRuleSummary, RuleAuditSummary } from '@motor/contracts'
import { detectPotentialRuleOverlaps, RULE_CONDITION_FIELDS, normalizeRuleConditions, RuleLevelCode, type FamilyRule, type RuleLevel } from '@motor/tax-engine'
import { RendererErrorMessage } from '../error-messages'

const rules = ref<readonly VersionedRuleSummary[]>([])
const audit = ref<readonly RuleAuditSummary[]>([])
const auditId = ref('')
const error = ref('')
const success = ref('')
const busy = ref(false)
const editId = ref('')
const editRevision = ref(0)
const revokeId = ref('')
const revokeReason = ref('')
const conditionKey = ref('')
const conditionValue = ref('')
const levels = [
  [RuleLevelCode.DEFAULT_OPERATION, 'Operação padrão'],
  [RuleLevelCode.NCM, 'NCM'],
  [RuleLevelCode.NCM_CEST, 'NCM e CEST'],
  [RuleLevelCode.FISCAL_PROFILE, 'Perfil fiscal'],
  [RuleLevelCode.COMPANY, 'Empresa'],
  [RuleLevelCode.PRODUCT_COMPANY_EXCEPTION, 'Exceção de produto e empresa'],
] as const
const conditionFields = RULE_CONDITION_FIELDS
const selectedCondition = computed(() => conditionFields.find((field) => field.key === conditionKey.value))
const labels = new Map(conditionFields.map((field) => [field.key as string, field.label]))
function selectionRule(rule: VersionedRuleSummary): FamilyRule {
  return { id: rule.id, familyId: rule.familyId, version: rule.version,
    name: rule.name, status: rule.status, level: rule.level as RuleLevel,
    priority: rule.priority, validFrom: rule.validFrom,
    ...(rule.validUntil ? { validUntil: rule.validUntil } : {}),
    legalBasis: rule.legalBasis ?? '', conditions: rule.conditions }
}
const overlaps = computed(() => detectPotentialRuleOverlaps(rules.value.map(selectionRule)))
const previewOverlaps = computed(() => {
  if (!Object.keys(form.value.conditions).length || !form.value.validFrom) return []
  const previous = rules.value.find((rule) => rule.id === editId.value)
  const preview: FamilyRule = {
    id: 'preview', familyId: previous?.familyId ?? 'preview-family',
    version: previous?.version ?? 1, name: form.value.name,
    status: 'APPROVED', level: form.value.level as RuleLevel,
    priority: form.value.priority, validFrom: form.value.validFrom,
    ...(form.value.validUntil ? { validUntil: form.value.validUntil } : {}),
    legalBasis: form.value.legalBasis ?? '', conditions: form.value.conditions,
  }
  return detectPotentialRuleOverlaps([...rules.value.map(selectionRule), preview])
    .filter((overlap) => overlap.leftId === preview.id || overlap.rightId === preview.id)
    .map((overlap) => ({ ...overlap,
      other: rules.value.find((rule) => rule.id === (overlap.leftId === preview.id ? overlap.rightId : overlap.leftId)),
    }))
})
function overlapsFor(id: string): readonly string[] {
  return overlaps.value.filter((overlap) => overlap.leftId === id || overlap.rightId === id)
    .map((overlap) => {
      const otherId = overlap.leftId === id ? overlap.rightId : overlap.leftId
      const other = rules.value.find((rule) => rule.id === otherId)
      return (other?.name ?? otherId) + (overlap.tiePossible ? ' · empate possível' : ' · precedência resolve')
    })
}

function emptyForm(): RuleDraftFields {
  return { name: '', level: RuleLevelCode.DEFAULT_OPERATION, priority: 0,
    validFrom: new Date().toISOString().slice(0, 10), legalBasis: '', conditions: {} }
}
const form = ref<RuleDraftFields>(emptyForm())
function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : RendererErrorMessage.OPERATION_FAILED
}
async function reload(): Promise<void> { rules.value = await window.desktopApi.listVersionedRules() }
function addCondition(): void {
  if (!conditionKey.value || !conditionValue.value.trim()) return
  try {
    const conditions = normalizeRuleConditions({ ...form.value.conditions, [conditionKey.value]: conditionValue.value })
    form.value = { ...form.value, conditions }
    conditionValue.value = ''; error.value = ''
  } catch (cause) { error.value = message(cause) }

}
function removeCondition(key: string): void {
  const conditions = { ...form.value.conditions }
  delete conditions[key]
  form.value = { ...form.value, conditions }
}
function edit(rule: VersionedRuleSummary): void {
  editId.value = rule.id
  editRevision.value = rule.revision
  form.value = { name: rule.name, level: rule.level, priority: rule.priority,
    priorityReason: rule.priorityReason ?? '', validFrom: rule.validFrom,
    validUntil: rule.validUntil ?? '', legalBasis: rule.legalBasis ?? '',
    conditions: { ...rule.conditions } }
  error.value = ''
}
async function save(): Promise<void> {
  busy.value = true; error.value = ''; success.value = ''
  try {
    if (editId.value) {
      await window.desktopApi.updateRuleDraft({ ...form.value, id: editId.value,
        expectedRevision: editRevision.value })
      success.value = 'Rascunho atualizado.'
    } else {
      await window.desktopApi.createRuleDraft(form.value)
      success.value = 'Rascunho criado.'
    }
    editId.value = ''; form.value = emptyForm()
    await reload()
  } catch (cause) { error.value = message(cause) }
  finally { busy.value = false }
}
async function act(rule: VersionedRuleSummary, action: 'approve' | 'version' | 'revoke'): Promise<void> {
  busy.value = true; error.value = ''; success.value = ''
  try {
    const input = { id: rule.id, expectedRevision: rule.revision }
    if (action === 'approve') {
      await window.desktopApi.approveRule(input)
      success.value = 'Versão aprovada. Ela será considerada em novas avaliações; o cálculo fiscal continua pendente.'
    } else if (action === 'version') {
      const created = await window.desktopApi.createRuleVersion(input)
      success.value = 'Nova versão em rascunho.'
      await reload()
      const latest = rules.value.find((item) => item.id === created.id)
      if (latest) edit(latest)
    } else {
      await window.desktopApi.revokeRule({ ...input, reason: revokeReason.value })
      revokeId.value = ''; revokeReason.value = ''
      success.value = 'Versão revogada.'
    }
    await reload()
  } catch (cause) { error.value = message(cause) }
  finally { busy.value = false }
}
async function showAudit(id: string): Promise<void> {
  if (auditId.value === id) { auditId.value = ''; audit.value = []; return }
  try { audit.value = await window.desktopApi.listRuleAudit(id); auditId.value = id }
  catch (cause) { error.value = message(cause) }
}
onMounted(() => void reload().catch((cause) => { error.value = message(cause) }))
</script>

<template>
  <section class="versioned-panel card" aria-labelledby="versioned-title">
    <header>
      <p class="eyebrow">Catálogo local</p>
      <h2 id="versioned-title">Regras versionadas</h2>
      <p>Rascunhos, aprovações e revogações ficam registrados neste computador. A versão aprovada mais nova de cada família entra nas novas avaliações dos lotes. As avaliações já salvas permanecem intactas. Revogar a versão mais nova não reativa a anterior; nenhum cálculo de ICMS é liberado nesta etapa.</p>
    </header>
    <p v-if="error" class="form-error" role="alert">{{ error }}
      <button v-if="error.includes('Recarregue os dados')" class="button secondary" type="button" @click="reload">Recarregar</button>
    </p>
    <p v-if="success" role="status">{{ success }}</p>
    <form class="rule-editor" @submit.prevent="save">
      <h3>{{ editId ? 'Editar rascunho' : 'Novo rascunho' }}</h3>
      <div class="fields">
        <label><span>Nome</span><input v-model="form.name" required maxlength="200" /></label>
        <label><span>Nível</span><select v-model="form.level"><option v-for="[code, label] in levels" :key="code" :value="code">{{ label }}</option></select></label>
        <label><span>Vigente desde</span><input v-model="form.validFrom" type="date" required /></label>
        <label><span>Vigente até</span><input v-model="form.validUntil" type="date" /></label>
        <label><span>Prioridade</span><input v-model.number="form.priority" type="number" min="0" step="1" required /></label>
        <label v-if="form.priority > 0"><span>Justificativa da prioridade</span><input v-model="form.priorityReason" required /></label>
        <label class="wide"><span>Fundamento legal</span><textarea v-model="form.legalBasis" rows="2" placeholder="Obrigatório para aprovação"></textarea></label>
      </div>
      <h4>Condições estruturadas</h4>
      <div class="condition-add">
        <select v-model="conditionKey" aria-label="Campo da condição" @change="conditionValue = ''"><option value="" disabled>Escolha um campo</option><option v-for="field in conditionFields" :key="field.key" :value="field.key">{{ field.label }}</option></select>
        <select v-if="selectedCondition?.options" v-model="conditionValue" aria-label="Valor da condição"><option value="" disabled>Escolha um valor</option><option v-for="[code, label] in selectedCondition.options" :key="code" :value="code">{{ code }} · {{ label }}</option></select>
        <input v-else v-model="conditionValue" aria-label="Valor da condição" :pattern="selectedCondition?.pattern" placeholder="Valor exato" />
        <button class="button secondary" type="button" @click="addCondition">Adicionar condição</button>
      </div>
      <p v-if="selectedCondition" class="hint">{{ selectedCondition.hint }}</p>
      <ul v-if="Object.keys(form.conditions).length" class="condition-list">
        <li v-for="(value, key) in form.conditions" :key="key"><span>{{ labels.get(String(key)) ?? key }}: <strong>{{ value }}</strong></span><button type="button" class="button secondary" @click="removeCondition(String(key))">Remover</button></li>
      </ul>
      <p class="hint">Para aprovar, informe o fundamento e a condição exigida pelo nível escolhido. Prioridade acima de zero exige justificativa.</p>
      <p v-for="overlap in previewOverlaps" :key="overlap.other?.id" class="overlap-warning" role="status">Possível sobreposição com {{ overlap.other?.name ?? 'outra regra' }}: {{ overlap.tiePossible ? 'pode haver empate na seleção.' : 'a precedência definirá a escolhida.' }}</p>

      <div class="actions"><button class="button primary" type="submit" :disabled="busy">{{ editId ? 'Salvar rascunho' : 'Criar rascunho' }}</button><button v-if="editId" class="button secondary" type="button" @click="editId = ''; form = emptyForm()">Cancelar edição</button></div>
    </form>
    <div class="rule-list">
      <p v-if="!rules.length" class="empty-state">Nenhuma regra local cadastrada.</p>
      <article v-for="rule in rules" :key="rule.id" class="rule-record">
        <div class="rule-head"><div><strong>{{ rule.name }}</strong><small>Família {{ rule.familyId }} · versão {{ rule.version }} · revisão {{ rule.revision }}</small></div><span class="status">{{ rule.status === 'DRAFT' ? 'Rascunho' : rule.status === 'APPROVED' ? 'Aprovada' : 'Revogada' }}</span></div>
        <p>{{ levels.find((level) => level[0] === rule.level)?.[1] ?? rule.level }} · {{ rule.validFrom }} até {{ rule.validUntil ?? 'sem fim' }} · prioridade {{ rule.priority }}</p>
        <p v-if="rule.legalBasis"><strong>Fundamento:</strong> {{ rule.legalBasis }}</p>
        <p v-if="rule.revocationReason"><strong>Revogação:</strong> {{ rule.revocationReason }}</p>
        <p v-for="warning in overlapsFor(rule.id)" :key="warning" class="overlap-warning">Sobreposição potencial com {{ warning }}.</p>

        <ul class="condition-list"><li v-for="(value, key) in rule.conditions" :key="key">{{ labels.get(String(key)) ?? key }}: {{ value }}</li></ul>
        <div class="actions">
          <button v-if="rule.status === 'DRAFT'" class="button secondary" type="button" :disabled="busy" @click="edit(rule)">Editar</button>
          <button v-if="rule.status === 'DRAFT'" class="button primary" type="button" :disabled="busy" @click="act(rule, 'approve')">Aprovar versão</button>
          <button v-if="rule.status !== 'DRAFT'" class="button secondary" type="button" :disabled="busy" @click="act(rule, 'version')">Criar nova versão</button>
          <button v-if="rule.status === 'APPROVED'" class="button secondary" type="button" :disabled="busy" @click="revokeId = rule.id">Revogar</button>
          <button class="button secondary" type="button" @click="showAudit(rule.id)">{{ auditId === rule.id ? 'Ocultar auditoria' : 'Ver auditoria' }}</button>
        </div>
        <div v-if="revokeId === rule.id" class="actions"><input v-model="revokeReason" aria-label="Motivo da revogação" placeholder="Motivo da revogação" /><button class="button primary" type="button" :disabled="busy || !revokeReason.trim()" @click="act(rule, 'revoke')">Confirmar revogação</button><button class="button secondary" type="button" @click="revokeId = ''">Cancelar</button></div>
        <ul v-if="auditId === rule.id" class="audit-list"><li v-for="event in audit" :key="event.id">{{ event.operation }} · revisão {{ event.revision }} · {{ event.createdAt }} · Seu computador</li></ul>
      </article>
    </div>
  </section>
</template>

<style scoped>
.versioned-panel { padding: 24px; margin-bottom: 28px; }
.versioned-panel header { max-width: 850px; }
.versioned-panel h2 { margin: 5px 0; color: #142238; }
.versioned-panel header p:last-child,.hint { color: #617087; font-size: 13px; line-height: 1.5; }
.rule-editor { margin-top: 22px; padding: 20px; border: 1px solid #dfe7f2; border-radius: 12px; background: #f8faff; }
.rule-editor h3 { margin: 0 0 15px; }
.fields { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; }
.fields label { display: grid; gap: 5px; font-size: 12px; }
.fields .wide { grid-column: 1/-1; }
.fields input,.fields select,.fields textarea,.condition-add input,.condition-add select,.actions input { width: 100%; padding: 9px; border: 1px solid #ccd7e6; border-radius: 7px; background: #fff; }
.rule-editor h4 { margin: 17px 0 8px; }
.condition-add,.actions { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.condition-add select,.condition-add input { flex: 1; min-width: 150px; }
.condition-list { display: flex; flex-wrap: wrap; gap: 7px; padding: 0; list-style: none; }
.condition-list li { display: flex; align-items: center; gap: 8px; padding: 6px 8px; border-radius: 8px; background: #edf3fc; font-size: 12px; }
.condition-list .button { padding: 4px 6px; font-size: 10px; }
.rule-list { display: grid; gap: 12px; margin-top: 20px; }
.rule-record { padding: 17px; border: 1px solid #dfe7f2; border-radius: 12px; }
.rule-head { display: flex; justify-content: space-between; gap: 10px; }
.rule-head div { display: grid; gap: 3px; }
.rule-head small { color: #718096; overflow-wrap: anywhere; }
.rule-record p { color: #4e5e74; font-size: 12px; }
.status { align-self: start; padding: 5px 8px; border-radius: 12px; background: #eaf1fb; font-size: 11px; font-weight: 700; }
.audit-list { font-size: 11px; color: #52647e; }
.overlap-warning { padding: 8px 10px; border-radius: 8px; background: #fff1d5; color: #76522a !important; }
@media (max-width: 650px) { .fields { grid-template-columns: 1fr; } }
</style>
