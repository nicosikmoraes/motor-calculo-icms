<script setup lang="ts">
import { computed, ref } from 'vue'
import { itemCalculationStatus, itemCalculationComponents, type ItemFiscalAnswers, type ItemFiscalContext } from '@motor/contracts'

const props = defineProps<{ batchId: string; documentId: string; itemNumber: string; expanded?: boolean }>()
const emit = defineEmits<{ saved: [] }>()
const context = ref<ItemFiscalContext | null>(null)
const selections = ref<Partial<Record<keyof ItemFiscalAnswers, string>>>({})
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const notice = ref('')
const reuseScope = ref<'CURRENT_ITEM' | 'FUTURE_NOTES'>('CURRENT_ITEM')
const visibleQuestions = computed(() => context.value?.questions.filter(question => (question.field !== 'stMvaPercent' || selections.value.stMvaMode === 'MANUAL_APPLIED')
  && (question.field !== 'stInternalRateIncludesFcp' || selections.value.fcpStApplicableConfirmed === 'true')) ?? [])

async function load(event: Event): Promise<void> {
  if (!(event.target as HTMLDetailsElement).open || loading.value) return
  loading.value = true
  error.value = ''
  notice.value = ''
  try {
    context.value = await window.desktopApi.getItemFiscalContext(props.batchId, props.documentId, props.itemNumber)
    reuseScope.value = 'CURRENT_ITEM'
    selections.value = Object.fromEntries([
      ...context.value.questions.map(question => [question.field, question.suggestedValue ?? '']),
      ...Object.entries(context.value.answers).map(([key, value]) => [key, String(value)]),
    ])
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Não foi possível carregar as perguntas.' }
  finally { loading.value = false }
}

async function save(): Promise<void> {
  if (!context.value || saving.value) return
  error.value = ''
  notice.value = ''
  saving.value = true
  try {
    // Copiar valores escalares antes da ponte Electron: proxies Vue não são clonáveis.
    const answers = Object.fromEntries(Object.entries(selections.value).filter(([key, value]) => value !== ''
      && (key !== 'stMvaPercent' || selections.value.stMvaMode === 'MANUAL_APPLIED')
      && (key !== 'stInternalRateIncludesFcp' || selections.value.fcpStApplicableConfirmed === 'true'))
      .map(([key, value]) => [key, value === 'true' ? true : value === 'false' ? false
        : key.startsWith('st') && ['stMvaPercent', 'stInternalRate', 'stOwnOperationRate'].includes(key)
          ? value!.trim().replace(',', '.') : value])) as ItemFiscalAnswers
    context.value = await window.desktopApi.saveItemFiscalAnswers({
      batchId: props.batchId, documentId: props.documentId, itemNumber: props.itemNumber,
      requestId: crypto.randomUUID(), ...(context.value.runId ? { expectedRunId: context.value.runId } : {}), answers,
      reuseScope: reuseScope.value,
      ...(context.value.definitionId ? { expectedDefinitionId: context.value.definitionId } : {}),
    })
    notice.value = itemCalculationStatus(context.value.calculation) === 'CALCULATED'
      ? context.value.calculation.result?.component === 'ICMS_ST'
        ? 'Respostas salvas e tributos da entrada calculados.' : 'Respostas salvas e ICMS da operação calculado.'
      : `Respostas salvas. ${context.value.calculation.reason ?? itemCalculationComponents(context.value.calculation).find(component => component.status !== 'CALCULATED')?.reason ?? 'O item continua pendente.'}`
    emit('saved')
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Não foi possível salvar as respostas.' }
  finally { saving.value = false }
}
</script>

<template>
  <details class="fiscal-questions" :open="expanded" @toggle="load">
    <summary>Completar dados e calcular tributos</summary>
    <div class="questions-body">
      <p v-if="loading">Carregando dados do item…</p>
      <p v-if="error" role="alert" class="form-error">{{ error }}</p>
      <p v-if="notice" role="status" class="form-success">{{ notice }}</p>
      <template v-if="context && !loading">
        <p v-for="fact in context.xmlFacts" :key="fact">{{ fact }}</p>
        <div v-if="context.stMvaReference" class="fiscal-note">
          <template v-if="context.stMvaReference.status === 'FOUND'">
            <p><strong>MVA original encontrada: {{ context.stMvaReference.originalMvaPercent }}%</strong></p>
            <p>{{ context.stMvaReference.description }}</p>
            <p>{{ context.stMvaReference.legalBasis }}. Efeitos desde {{ context.stMvaReference.validFrom }}; catálogo conferido até {{ context.stMvaReference.verifiedThrough }}.</p>
            <p><a :href="context.stMvaReference.sourceUrl" target="_blank" rel="noopener noreferrer">Consultar tabela oficial</a>. Confirme a descrição e as condições da operação. O ajuste automático atende importados interestaduais a 4% de fornecedor do regime normal.</p>
          </template>
          <p v-else>{{ context.stMvaReference.reason }}</p>
        </div>
        <p v-if="context.reuseNotice">{{ context.reuseNotice }}</p>
        <p v-if="context.blockedReason" role="status">{{ context.blockedReason }}</p>
        <form v-else @submit.prevent="save">
          <label v-for="question in visibleQuestions" :key="question.field">
            {{ question.label }}
            <input v-if="question.inputType === 'decimal'" v-model="selections[question.field]" type="text" inputmode="decimal" pattern="[0-9]+([.,][0-9]+)?" :disabled="saving">
            <select v-else v-model="selections[question.field]" :disabled="saving">
              <option value="">Ainda não sei — manter pendente</option>
              <option v-for="option in question.options ?? []" :key="option.value" :value="option.value">{{ option.label }}</option>
            </select>
          </label>
          <label>Onde aplicar estas respostas?
            <select v-model="reuseScope" :disabled="saving">
              <option value="CURRENT_ITEM">Só neste item</option>
              <option value="FUTURE_NOTES" :disabled="!context.reuseAvailable">Nas próximas notas desta empresa, para este produto do fornecedor</option>
            </select>
          </label>
          <p v-if="reuseScope === 'CURRENT_ITEM'">Você pode salvar mesmo se ainda faltar alguma informação. A definição das próximas notas não será alterada.</p>
          <p v-else>Conclua as respostas deste item para reutilizar. Se os dados da operação mudarem, o sistema perguntará novamente.</p>
          <p v-if="context.stMvaReference">No ICMS-ST, confira a vigência e o enquadramento em cada nota.</p>
          <p v-else-if="!context.reuseAvailable">O reaproveitamento precisa da empresa analisada, da identificação do destinatário, do CNPJ do emitente e do código do produto na nota.</p>
          <button type="submit" class="button secondary" :disabled="saving">{{ saving ? 'Salvando…' : 'Salvar respostas e calcular' }}</button>
          <p v-if="context.calculation.reason">{{ context.calculation.reason }}</p>
        </form>
      </template>
    </div>
  </details>
</template>

<style scoped>
.fiscal-questions { margin-top: 8px; font-size: 12px; }
summary { color: #71551c; cursor: pointer; font-weight: 700; }
.questions-body { padding: 12px; margin-top: 8px; border: 1px solid #e8dfc9; border-radius: 8px; background: #fffaf0; }
label { display: block; margin-bottom: 12px; }
select, input { display: block; width: 100%; min-width: 180px; margin-top: 4px; padding: 6px; }
.fiscal-note { border-left: 3px solid #c88c26; padding-left: 8px; }
p { overflow-wrap: anywhere; }
</style>
