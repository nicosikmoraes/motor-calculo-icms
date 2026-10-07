<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { RuleDraftFields, VersionedRuleSummary, RuleAuditSummary } from '@motor/contracts'
import { detectPotentialRuleOverlaps, RULE_CONDITION_FIELDS, normalizeRuleConditions, RuleLevelCode, type FamilyRule, type RuleLevel } from '@motor/tax-engine'
import { RendererErrorMessage } from '../error-messages'

const emit = defineEmits<{ loaded: [rules: readonly VersionedRuleSummary[]]; editing: [open: boolean] }>()
const editorOpen = ref(false)
const editorName = ref<HTMLInputElement | null>(null)
const loading = ref(true)
const search = ref(''), statusFilter = ref('all'), levelFilter = ref('')
const auditLoading = ref(false)
let auditRequest = 0
watch(editorOpen, value => emit('editing', value))
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
  const today = new Date()
  const localDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  return { name: '', level: RuleLevelCode.DEFAULT_OPERATION, priority: 0,
    validFrom: localDate, legalBasis: '', conditions: {} }
}
const form = ref<RuleDraftFields>(emptyForm())
function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : RendererErrorMessage.OPERATION_FAILED
}
async function reload(): Promise<void> {
  rules.value = await window.desktopApi.listVersionedRules()
  emit('loaded', rules.value)
}
async function loadRules(): Promise<void> {
  loading.value = true; error.value = ''
  try { await reload() } catch (cause) { error.value = message(cause) }
  finally { loading.value = false }
}
const visibleRules = computed(() => {
  const query = search.value.trim().toLocaleLowerCase('pt-BR')
  return rules.value.filter(rule => (statusFilter.value === 'all' || rule.status === statusFilter.value)
    && (!levelFilter.value || rule.level === levelFilter.value)
    && (!query || [rule.name, rule.id, rule.familyId, rule.legalBasis, rule.revocationReason,
      ...Object.values(rule.conditions)].some(value => value?.toLocaleLowerCase('pt-BR').includes(query))))
})
function date(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-')
  return day && month && year ? `${day}/${month}/${year}` : value
}
function auditDate(value: string): string { return new Date(value).toLocaleString('pt-BR') }
function statusLabel(value: VersionedRuleSummary['status']): string {
  return { DRAFT: 'Rascunho', APPROVED: 'Aprovada', REVOKED: 'Revogada' }[value]
}
function auditLabel(value: RuleAuditSummary['operation']): string {
  return { CREATE_DRAFT: 'Rascunho criado', UPDATE_DRAFT: 'Rascunho atualizado', NEW_VERSION: 'Nova versão criada', APPROVE: 'Versão aprovada', REVOKE: 'Versão revogada' }[value]
}
const auditFields: Record<string, string> = { name: 'Nome', level: 'Nível', priority: 'Prioridade', priorityReason: 'Justificativa', validFrom: 'Início da vigência', validUntil: 'Fim da vigência', legalBasis: 'Fundamento legal', conditions: 'Condições', version: 'Versão', status: 'Situação', revocationReason: 'Motivo da revogação' }
function conditionLabel(key: string, value: string): string {
  const option = conditionFields.find(field => field.key === key)?.options?.find(([code]) => code === value)
  return option && option[1] !== value ? `${value} · ${option[1]}` : value
}
function clearFilters(): void { search.value = ''; statusFilter.value = 'all'; levelFilter.value = '' }
function filterStatus(status = 'all'): void { clearFilters(); statusFilter.value = status }
function focusEditor(): void {
  void nextTick(() => { editorName.value?.focus({ preventScroll: true }); editorName.value?.closest('form')?.scrollIntoView({ block: 'start', behavior: 'smooth' }) })
}
function cancelEdit(): void {
  editId.value = ''; form.value = emptyForm(); editorOpen.value = false
  conditionKey.value = ''; conditionValue.value = ''
}
function startNew(): void {
  if (busy.value || loading.value) return
  if (!editorOpen.value) { editId.value = ''; form.value = emptyForm(); conditionKey.value = ''; conditionValue.value = ''; editorOpen.value = true }
  revokeId.value = ''; revokeReason.value = ''; error.value = ''; success.value = ''
  focusEditor()
}
defineExpose({ startNew, filterStatus })
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
  if (editorOpen.value && editId.value === rule.id) { focusEditor(); return }
  editorOpen.value = true; revokeId.value = ''; revokeReason.value = ''
  editId.value = rule.id
  editRevision.value = rule.revision
  form.value = { name: rule.name, level: rule.level, priority: rule.priority,
    priorityReason: rule.priorityReason ?? '', validFrom: rule.validFrom,
    validUntil: rule.validUntil ?? '', legalBasis: rule.legalBasis ?? '',
    conditions: { ...rule.conditions } }
  error.value = ''; success.value = ''; conditionKey.value = ''; conditionValue.value = ''; focusEditor()
}
async function save(): Promise<void> {
  if (busy.value) return
  busy.value = true; error.value = ''; success.value = ''
  try {
    const input: RuleDraftFields = { ...form.value, conditions: { ...form.value.conditions } }
    if (editId.value) {
      await window.desktopApi.updateRuleDraft({ ...input, id: editId.value,
        expectedRevision: editRevision.value })
      success.value = 'Rascunho atualizado.'
    } else {
      await window.desktopApi.createRuleDraft(input)
      success.value = 'Rascunho criado.'
    }
    cancelEdit(); clearFilters()
    await reload()
    auditId.value = ''; audit.value = []; auditRequest++; auditLoading.value = false
  } catch (cause) { error.value = message(cause) }
  finally { busy.value = false }
}
async function act(rule: VersionedRuleSummary, action: 'approve' | 'version' | 'revoke'): Promise<void> {
  if (busy.value) return
  busy.value = true; error.value = ''; success.value = ''
  try {
    const input = { id: rule.id, expectedRevision: rule.revision }
    if (action === 'approve') {
      await window.desktopApi.approveRule(input)
      success.value = 'Versão aprovada para novas avaliações. A aprovação não libera o cálculo de ICMS por esta regra.'
    } else if (action === 'version') {
      const created = await window.desktopApi.createRuleVersion(input)
      success.value = 'Nova versão em rascunho.'
      await reload()
      const latest = rules.value.find((item) => item.id === created.id)
      if (latest) edit(latest)
      success.value = 'Nova versão em rascunho.'
    } else {
      await window.desktopApi.revokeRule({ ...input, reason: revokeReason.value })
      revokeId.value = ''; revokeReason.value = ''
      success.value = 'Versão revogada.'
    }
    await reload()
    auditId.value = ''; audit.value = []; auditRequest++; auditLoading.value = false
  } catch (cause) { error.value = message(cause) }
  finally { busy.value = false }
}
async function showAudit(id: string): Promise<void> {
  const request = ++auditRequest
  if (auditId.value === id) { auditId.value = ''; audit.value = []; auditLoading.value = false; return }
  auditId.value = id; audit.value = []; auditLoading.value = true; error.value = ''
  try {
    const events = await window.desktopApi.listRuleAudit(id)
    if (request === auditRequest) audit.value = events
  } catch (cause) { if (request === auditRequest) error.value = message(cause) }
  finally { if (request === auditRequest) auditLoading.value = false }
}
onMounted(loadRules)
</script>

<template>
  <section class="versioned-panel" aria-label="Catálogo local de regras">
    <div class="section-heading"><div><h3>Catálogo local</h3><p>Revise rascunhos e acompanhe as versões aprovadas e revogadas.</p></div><span class="badge badge-neutral">{{ rules.length }} versões</span></div>
    <p v-if="error && !editorOpen" class="form-error feedback" role="alert">{{ error }} <button class="text-button" type="button" :disabled="busy || loading" @click="loadRules">Recarregar catálogo</button></p>
    <p v-if="success" class="form-success feedback" role="status">{{ success }}</p>

    <form v-show="editorOpen" class="card rule-editor" @submit.prevent="save">
      <div class="editor-heading"><div><span class="section-kicker">{{ editId ? 'Edição de versão local' : 'Nova versão local' }}</span><h4>{{ editId ? 'Editar rascunho' : 'Novo rascunho' }}</h4><p>Defina os critérios da regra e salve para continuar a revisão.</p></div><span class="badge badge-amber">Rascunho</span></div>
      <fieldset :disabled="busy"><legend class="visually-hidden">Dados do rascunho</legend>
        <div class="fields">
          <label class="wide">Nome da regra<input ref="editorName" v-model="form.name" required maxlength="200" placeholder="Ex.: Operação interna PR para revenda" /></label>
          <label>Nível da regra<select v-model="form.level"><option v-for="[code, label] in levels" :key="code" :value="code">{{ label }}</option></select></label>
          <label>Prioridade<input v-model.number="form.priority" type="number" min="0" step="1" required /><small>Acima de zero, informe uma justificativa.</small></label>
          <label>Vigente desde<input v-model="form.validFrom" type="date" required /></label>
          <label>Vigente até<input v-model="form.validUntil" type="date" /><small>Deixe em branco para não definir uma data final.</small></label>
          <label v-if="form.priority > 0" class="wide">Justificativa da prioridade<input v-model="form.priorityReason" required /></label>
          <label class="wide">Fundamento legal<textarea v-model="form.legalBasis" rows="3" placeholder="Informe a referência e a hipótese aplicável. Obrigatório para aprovação."></textarea></label>
        </div>
        <div class="condition-editor"><h5>Condições da regra</h5><p>Adicione os campos e valores exatos que identificam a operação.</p>
          <div class="condition-add"><label>Campo<select v-model="conditionKey" @change="conditionValue = ''"><option value="" disabled>Escolha um campo</option><option v-for="field in conditionFields" :key="field.key" :value="field.key">{{ field.label }}</option></select></label>
            <label>Valor<select v-if="selectedCondition?.options" v-model="conditionValue"><option value="" disabled>Escolha um valor</option><option v-for="[code, label] in selectedCondition.options" :key="code" :value="code">{{ code }} · {{ label }}</option></select><input v-else v-model="conditionValue" :pattern="selectedCondition?.pattern" placeholder="Valor exato" /></label>
            <button class="button secondary" type="button" :disabled="!conditionKey || !conditionValue.trim()" @click="addCondition">Adicionar condição</button>
          </div>
          <p v-if="selectedCondition" class="hint">{{ selectedCondition.hint }}</p>
          <ul v-if="Object.keys(form.conditions).length" class="condition-list editor-conditions"><li v-for="(value, key) in form.conditions" :key="key"><span>{{ labels.get(String(key)) ?? key }}: <strong>{{ conditionLabel(String(key), value) }}</strong></span><button type="button" :aria-label="`Remover condição ${labels.get(String(key)) ?? key}`" class="remove-condition" @click="removeCondition(String(key))">×</button></li></ul>
          <p v-else class="conditions-empty">Nenhuma condição adicionada ao rascunho.</p>
          <p class="hint">A aprovação exige fundamento legal e a condição correspondente ao nível escolhido.</p>
          <p v-for="overlap in previewOverlaps" :key="overlap.other?.id" class="overlap-warning" role="status">Possível sobreposição com {{ overlap.other?.name ?? 'outra regra' }}: {{ overlap.tiePossible ? 'pode haver empate na seleção.' : 'a precedência definirá a escolhida.' }}</p>
        </div>
        <p v-if="error" class="form-error editor-feedback" role="alert">{{ error }} <button v-if="error.includes('Recarregue os dados')" class="text-button" type="button" @click="loadRules">Recarregar catálogo</button></p>
        <div class="editor-footer"><span>Salvar mantém esta versão em rascunho.</span><div><button class="button secondary" type="button" @click="cancelEdit">{{ editId ? 'Cancelar edição' : 'Cancelar rascunho' }}</button><button class="button primary" type="submit">{{ busy ? 'Salvando…' : editId ? 'Salvar rascunho' : 'Criar rascunho' }}</button></div></div>
      </fieldset>
    </form>

    <div class="card rule-toolbar"><label class="search-field"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input v-model="search" aria-label="Buscar regras locais" placeholder="Buscar por nome, condição ou fundamento"></label><div class="toolbar-filters"><label>Situação<select v-model="statusFilter"><option value="all">Todas as versões</option><option value="DRAFT">Rascunhos</option><option value="APPROVED">Aprovadas</option><option value="REVOKED">Revogadas</option></select></label><label>Nível<select v-model="levelFilter"><option value="">Todos os níveis</option><option v-for="[code, label] in levels" :key="code" :value="code">{{ label }}</option></select></label></div></div>
    <p v-if="loading" class="card loading-panel" role="status"><span class="loading-dot" aria-hidden="true"></span>Carregando o catálogo local…</p>
    <template v-else>
      <p v-if="rules.length" class="list-count">{{ visibleRules.length }} de {{ rules.length }} versões no catálogo</p>
      <div v-if="!visibleRules.length" class="card empty-panel"><span aria-hidden="true">▤</span><h4>{{ rules.length ? 'Nenhuma regra corresponde aos filtros' : 'Seu catálogo local começa aqui' }}</h4><p>{{ rules.length ? 'Experimente outro termo, nível ou situação.' : 'Crie um rascunho para registrar as condições e o fundamento da operação.' }}</p><button v-if="rules.length" class="button secondary" @click="clearFilters">Limpar filtros</button><button v-else-if="!editorOpen" class="button secondary" :disabled="busy" @click="startNew">Criar primeiro rascunho</button></div>
      <div class="rule-list">
        <article v-for="rule in visibleRules" :key="rule.id" class="card rule-record">
          <header class="rule-head"><div class="rule-title"><span class="rule-icon" aria-hidden="true">▤</span><div><h4>{{ rule.name }}</h4><p>{{ levels.find(level => level[0] === rule.level)?.[1] ?? rule.level }} · Versão {{ rule.version }} · Revisão {{ rule.revision }}</p></div></div><span class="badge" :class="rule.status === 'DRAFT' ? 'badge-amber' : rule.status === 'APPROVED' ? 'badge-green' : 'badge-neutral'">{{ statusLabel(rule.status) }}</span></header>
          <dl class="rule-meta"><div><dt>Vigência da versão</dt><dd>{{ date(rule.validFrom) }} até {{ rule.validUntil ? date(rule.validUntil) : 'sem data final' }}</dd></div><div><dt>Prioridade</dt><dd>{{ rule.priority }}<small v-if="rule.priorityReason">{{ rule.priorityReason }}</small></dd></div></dl>
          <ul v-if="Object.keys(rule.conditions).length" class="condition-list"><li v-for="(value, key) in rule.conditions" :key="key"><span>{{ labels.get(String(key)) ?? key }}: <strong>{{ conditionLabel(String(key), value) }}</strong></span></li></ul><p v-else class="conditions-empty">Nenhuma condição registrada.</p>
          <p v-for="warning in overlapsFor(rule.id)" :key="warning" class="overlap-warning">Sobreposição potencial com {{ warning }}.</p>
          <details class="rule-basis"><summary>Fundamento e identificação da versão <span aria-hidden="true">⌄</span></summary><div class="basis-body"><h5>Fundamento legal</h5><p>{{ rule.legalBasis || 'Não informado neste rascunho.' }}</p><p v-if="rule.revocationReason" class="revocation-note"><strong>Motivo da revogação:</strong> {{ rule.revocationReason }}</p><dl class="identity-grid"><div><dt>Família</dt><dd class="monospace">{{ rule.familyId }}</dd></div><div><dt>Identificador da versão</dt><dd class="monospace">{{ rule.id }}</dd></div><div><dt>Criada em</dt><dd>{{ auditDate(rule.createdAt) }}</dd></div><div><dt>Atualizada em</dt><dd>{{ auditDate(rule.updatedAt) }}</dd></div><div v-if="rule.approvedAt"><dt>Aprovação registrada</dt><dd>{{ auditDate(rule.approvedAt) }}</dd></div><div v-if="rule.revokedAt"><dt>Revogação registrada</dt><dd>{{ auditDate(rule.revokedAt) }}</dd></div></dl></div></details>
          <div class="record-actions"><div class="version-actions"><button v-if="rule.status === 'DRAFT'" class="button secondary" type="button" :disabled="busy || (editorOpen && editId !== rule.id)" @click="edit(rule)">Editar rascunho</button><button v-if="rule.status === 'DRAFT'" class="button primary" type="button" :disabled="busy || editorOpen" @click="act(rule, 'approve')">Aprovar versão</button><button v-if="rule.status !== 'DRAFT'" class="button secondary" type="button" :disabled="busy || editorOpen" @click="act(rule, 'version')">Criar nova versão</button><button v-if="rule.status === 'APPROVED'" class="text-button revoke-button" type="button" :disabled="busy || editorOpen" @click="revokeId = rule.id; revokeReason = ''">Revogar</button></div><button class="text-button" type="button" @click="showAudit(rule.id)">{{ auditId === rule.id ? 'Ocultar auditoria' : 'Ver auditoria' }}</button></div>
          <form v-if="revokeId === rule.id" class="revoke-panel" @submit.prevent="act(rule, 'revoke')"><label>Motivo da revogação<input v-model="revokeReason" required :disabled="busy" placeholder="Descreva por que esta versão deve ser revogada" /></label><p>A revogação fica registrada e não reativa uma versão anterior.</p><div><button class="button secondary" type="button" :disabled="busy" @click="revokeId = ''; revokeReason = ''">Cancelar revogação</button><button class="button primary" type="submit" :disabled="busy || !revokeReason.trim()">{{ busy ? 'Revogando…' : 'Confirmar revogação' }}</button></div></form>
          <section v-if="auditId === rule.id" class="audit-panel" aria-label="Auditoria da versão"><h5>Histórico desta versão</h5><p v-if="auditLoading" role="status">Carregando os registros…</p><p v-else-if="!audit.length" class="hint">Nenhum registro de auditoria disponível.</p><ol v-else class="audit-list"><li v-for="event in audit" :key="event.id"><span class="audit-dot" aria-hidden="true"></span><div><strong>{{ auditLabel(event.operation) }}</strong><p>Revisão {{ event.revision }} · {{ auditDate(event.createdAt) }}</p><small>{{ event.computer }} · {{ event.systemUser }}</small><details v-if="Object.keys(event.changes).length" class="audit-changes"><summary>Alterações registradas ({{ Object.keys(event.changes).length }})</summary><dl><div v-for="(change, field) in event.changes" :key="field"><dt>{{ auditFields[String(field)] ?? field }}</dt><dd><span>Antes: {{ change.before ?? 'Não informado' }}</span><span>Depois: {{ change.after ?? 'Não informado' }}</span></dd></div></dl></details></div></li></ol></section>
        </article>
      </div>
    </template>
    <details class="card selection-guide"><summary>Como as versões entram nas avaliações</summary><div><p>A versão final mais nova de cada família determina a situação da regra. A versão aprovada mais nova entra nas novas avaliações dos lotes; um rascunho não substitui essa aprovação. As avaliações já salvas permanecem intactas.</p><p>Revogar a versão final mais nova não reativa a anterior. Rascunhos, aprovações e revogações ficam registrados neste computador. A aprovação nesta tela não libera o cálculo de ICMS por estas regras.</p></div></details>
  </section>
</template>

<style scoped>
.versioned-panel { display: grid; gap: 20px; min-width: 0; }
.section-heading, .editor-heading { display: flex; align-items: start; justify-content: space-between; gap: 20px; }
.section-heading h3 { margin: 0 0 8px; font-size: 18px; color: #263955; letter-spacing: -.025em; }
.section-heading p, .editor-heading p { margin: 0; color: #657891; font-size: 12px; line-height: 1.65; }
.badge { display: inline-flex; align-items: center; flex: none; padding: 5px 9px; border-radius: 6px; font-size: 10px; line-height: 1.4; font-weight: 700; }
.badge-neutral { color: #60718a; background: #f0f3f8; } .badge-green { color: #278367; background: #e9f6f0; } .badge-amber { color: #946c20; background: #fff5df; }
.feedback { margin: 0; font-size: 12px; } .feedback .text-button { margin-left: 10px; }
.rule-editor { padding: 26px; scroll-margin-top: 24px; }
.section-kicker { display: block; margin-bottom: 8px; color: #6d7f99; font-size: 10px; font-weight: 700; letter-spacing: .09em; text-transform: uppercase; }
.editor-heading { margin-bottom: 24px; }
.editor-heading h4 { margin: 0 0 8px; color: #2c4161; font-size: 18px; }
fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
.visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; }
.fields label, .condition-add label, .revoke-panel label { display: grid; gap: 8px; min-width: 0; color: #607591; font-size: 12px; font-weight: 600; }
.fields .wide { grid-column: 1 / -1; }
.fields small { color: #798aa3; font-size: 10px; font-weight: 400; line-height: 1.5; }
.fields input, .fields select, .fields textarea, .condition-add input, .condition-add select, .revoke-panel input { font-size: 13px; min-width: 0; }
.fields textarea { width: 100%; padding: 12px; border: 1px solid #d6deeb; border-radius: 8px; font: inherit; background: #fff; color: #243650; resize: vertical; }
.fields textarea:focus { outline: 3px solid #455fdb26; border-color: #6179e5; }
.condition-editor { margin-top: 24px; padding: 22px; border: 1px solid #e4eaf4; border-radius: 10px; background: #f8fafd; }
.condition-editor h5 { margin: 0 0 7px; color: #4c6588; font-size: 13px; }
.condition-editor > p:first-of-type { margin: 0 0 18px; color: #7085a2; font-size: 12px; line-height: 1.6; }
.condition-add { display: flex; align-items: end; gap: 12px; }
.condition-add label { flex: 1; }
.condition-add .button { flex: none; min-height: 44px; }
.hint { color: #7085a2; font-size: 11px; line-height: 1.7; margin: 12px 0 0; }
.condition-list { display: flex; flex-wrap: wrap; gap: 8px; margin: 18px 0; padding: 0; list-style: none; }
.condition-list li { display: flex; align-items: center; gap: 10px; min-width: 0; padding: 8px 10px; border: 1px solid #e6ecf6; border-radius: 7px; background: #f5f8fe; color: #6a80a0; font-size: 11px; line-height: 1.5; }
.condition-list li > span { overflow-wrap: anywhere; min-width: 0; }
.condition-list strong { color: #4a658c; font-weight: 600; }
.remove-condition { flex: none; padding: 0 3px; border: 0; background: transparent; color: #7b8fab; font-size: 20px; cursor: pointer; }
.conditions-empty { margin: 16px 0; color: #8495ad; font-size: 11px; }
.editor-feedback { margin: 20px 0 0; font-size: 12px; }
.editor-footer { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding-top: 22px; margin-top: 22px; border-top: 1px solid #edf1f7; }
.editor-footer > span { color: #778ba7; font-size: 11px; }
.editor-footer > div { display: flex; gap: 10px; flex-wrap: wrap; }
.rule-toolbar { padding: 18px; display: flex; align-items: center; gap: 18px; }
.search-field { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; color: #8b9bb2; }
.search-field svg { width: 17px; height: 17px; flex: none; stroke: currentColor; stroke-width: 1.8; fill: none; stroke-linecap: round; }
.search-field input { min-width: 0; border: 0; background: transparent; font-size: 12px; }
.toolbar-filters { display: flex; gap: 12px; min-width: 0; }
.toolbar-filters label { display: grid; gap: 6px; min-width: 0; color: #6f839f; font-size: 10px; }
.toolbar-filters select { min-width: 0; max-width: 190px; min-height: 38px; padding: 8px; font-size: 12px; }
.list-count { margin: 0; color: #7a8ca5; font-size: 11px; }
.rule-list { display: grid; gap: 18px; }
.rule-record { padding: 24px; }
.rule-head { display: flex; align-items: start; justify-content: space-between; gap: 18px; }
.rule-title { display: flex; align-items: center; gap: 13px; min-width: 0; }
.rule-title > div { min-width: 0; }
.rule-icon { display: grid; place-items: center; width: 39px; height: 39px; flex: none; border-radius: 10px; background: #f0f4fd; color: #6a81c5; font-size: 22px; }
.rule-head h4 { margin: 0 0 7px; color: #314967; font-size: 15px; overflow-wrap: anywhere; }
.rule-head p { margin: 0; color: #7a8fac; font-size: 11px; line-height: 1.6; }
.rule-meta { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 20px; margin: 22px 0 0; }
.rule-meta dt, .identity-grid dt { color: #7d8fa8; font-size: 10px; }
.rule-meta dd, .identity-grid dd { color: #536e91; font-size: 12px; margin: 6px 0 0; line-height: 1.6; overflow-wrap: anywhere; }
.rule-meta small { display: block; color: #7d91ae; font-size: 10px; margin-top: 4px; }
.rule-basis { margin-top: 18px; border-top: 1px solid #edf1f7; }
.rule-basis summary { display: flex; justify-content: space-between; align-items: center; padding-top: 17px; color: #6b82a5; font-size: 11px; font-weight: 600; list-style: none; }
.rule-basis summary::-webkit-details-marker { display: none; }
.rule-basis summary > span { color: #8b9ebc; }
.rule-basis[open] summary > span { transform: rotate(180deg); }
.basis-body { padding: 18px 0 0; }
.basis-body h5 { font-size: 11px; color: #627d9f; margin: 0 0 8px; }
.basis-body p { color: #6a819f; font-size: 12px; line-height: 1.7; margin: 0; overflow-wrap: anywhere; }
.identity-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18px; margin: 20px 0 0; }
.monospace { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: 10px !important; }
.basis-body .revocation-note { margin-top: 16px; padding: 12px; border-radius: 8px; background: #f7f9fc; }
.record-actions { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-top: 20px; }
.version-actions { display: flex; align-items: center; gap: 15px; flex-wrap: wrap; }
.text-button { padding: 0; border: 0; background: transparent; color: #5572bd; font-family: inherit; font-size: 12px; cursor: pointer; }
.text-button:disabled { opacity: .48; cursor: not-allowed; }
.text-button:hover:not(:disabled) { color: #344bc5; text-decoration: underline; }
.revoke-button { color: #ad6671; }
.text-button:focus-visible, .remove-condition:focus-visible { outline: 3px solid #455fdb50; outline-offset: 3px; }
.overlap-warning { margin: 14px 0 0; padding: 12px 14px; border: 1px solid #f0e3c3; border-radius: 8px; background: #fffbf2; color: #8a6b35; font-size: 12px; line-height: 1.65; }
.revoke-panel { margin-top: 22px; padding: 20px; border: 1px solid #f0dbe0; border-radius: 10px; background: #fff9fa; }
.revoke-panel p { color: #9b7480; font-size: 11px; line-height: 1.6; margin: 12px 0 18px; }
.revoke-panel > div { display: flex; gap: 10px; justify-content: end; flex-wrap: wrap; }
.audit-panel { margin-top: 24px; padding-top: 22px; border-top: 1px solid #e8edf6; }
.audit-panel h5 { margin: 0 0 20px; color: #607c9f; font-size: 12px; }
.audit-panel > p { color: #7589a5; font-size: 12px; }
.audit-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 20px; }
.audit-list li { display: flex; gap: 12px; min-width: 0; }
.audit-dot { width: 8px; height: 8px; flex: none; margin-top: 5px; border: 2px solid #a6bae5; border-radius: 50%; }
.audit-list li > div { min-width: 0; flex: 1; }
.audit-list strong { color: #4d6a91; font-size: 12px; }
.audit-list p { margin: 7px 0; color: #7b90ac; font-size: 11px; }
.audit-list small { color: #8a9bb2; font-size: 10px; overflow-wrap: anywhere; }
.audit-changes { margin-top: 12px; color: #6e85a7; font-size: 11px; }
.audit-changes dl { padding: 14px; border-radius: 8px; background: #f8fafd; display: grid; gap: 14px; }
.audit-changes dt { font-weight: 600; } .audit-changes dd { margin: 6px 0 0; display: grid; gap: 5px; font-size: 10px; line-height: 1.7; overflow-wrap: anywhere; white-space: pre-wrap; }
.selection-guide { padding: 20px 24px; color: #6b82a2; font-size: 12px; }
.selection-guide summary { font-weight: 600; }
.selection-guide p { color: #7186a4; font-size: 12px; line-height: 1.7; margin: 14px 0 0; }
.loading-panel { margin: 0; display: flex; align-items: center; gap: 12px; padding: 30px; color: #6e829f; font-size: 13px; }
.loading-dot { width: 9px; height: 9px; border-radius: 50%; background: #7188db; }
.empty-panel { padding: 36px 24px; text-align: center; }
.empty-panel > span { display: grid; place-items: center; width: 44px; height: 44px; margin: 0 auto 18px; border-radius: 10px; background: #f0f4fd; color: #8097c6; font-size: 26px; }
.empty-panel h4 { margin: 0 0 10px; color: #3a5275; font-size: 16px; }
.empty-panel p { margin: 0 0 22px; color: #6f839f; font-size: 12px; line-height: 1.7; }
@media (max-width: 1150px) { .rule-toolbar { align-items: stretch; flex-direction: column; } .toolbar-filters label { flex: 1; } .toolbar-filters select { max-width: none; } .condition-add { flex-wrap: wrap; } .condition-add label { flex-basis: 40%; } }
@media (max-width: 650px) {
  .fields, .rule-meta, .identity-grid { grid-template-columns: 1fr; } .fields .wide { grid-column: auto; }
  .rule-record, .rule-editor { padding: 20px; } .condition-editor { padding: 16px; } .condition-add { flex-direction: column; align-items: stretch; }
  .record-actions, .editor-footer { flex-direction: column; align-items: stretch; } .record-actions > .text-button { text-align: left; }
  .rule-head { gap: 12px; } .rule-title { align-items: start; }
}
</style>
