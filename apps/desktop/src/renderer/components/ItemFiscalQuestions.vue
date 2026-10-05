<script setup lang="ts">
import { ref } from 'vue'
import type { ItemFiscalAnswers, ItemFiscalContext } from '@motor/contracts'

const props = defineProps<{ batchId: string; documentId: string; itemNumber: string; expanded?: boolean }>()
const emit = defineEmits<{ saved: [] }>()
const context = ref<ItemFiscalContext | null>(null)
const selections = ref<Partial<Record<keyof ItemFiscalAnswers, string>>>({})
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const notice = ref('')
const reuseScope = ref<'CURRENT_ITEM' | 'FUTURE_NOTES'>('CURRENT_ITEM')

async function load(event: Event): Promise<void> {
  if (!(event.target as HTMLDetailsElement).open || loading.value) return
  loading.value = true
  error.value = ''
  notice.value = ''
  try {
    context.value = await window.desktopApi.getItemFiscalContext(props.batchId, props.documentId, props.itemNumber)
    reuseScope.value = 'CURRENT_ITEM'
    selections.value = Object.fromEntries([
      ...context.value.questions.map(question => [question.field, '']),
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
    const answers = Object.fromEntries(Object.entries(selections.value).filter(([, value]) => value !== '')
      .map(([key, value]) => [key, value === 'true' ? true : value === 'false' ? false : value])) as ItemFiscalAnswers
    context.value = await window.desktopApi.saveItemFiscalAnswers({
      batchId: props.batchId, documentId: props.documentId, itemNumber: props.itemNumber,
      requestId: crypto.randomUUID(), ...(context.value.runId ? { expectedRunId: context.value.runId } : {}), answers,
      reuseScope: reuseScope.value,
      ...(context.value.definitionId ? { expectedDefinitionId: context.value.definitionId } : {}),
    })
    notice.value = context.value.calculation.status === 'CALCULATED'
      ? 'Respostas salvas e ICMS da operação calculado.'
      : `Respostas salvas. ${context.value.calculation.reason ?? 'O item continua pendente.'}`
    emit('saved')
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Não foi possível salvar as respostas.' }
  finally { saving.value = false }
}
</script>

<template>
  <details class="fiscal-questions" :open="expanded" @toggle="load">
    <summary>Completar dados e calcular ICMS</summary>
    <div class="questions-body">
      <p v-if="loading">Carregando dados do item…</p>
      <p v-if="error" role="alert" class="form-error">{{ error }}</p>
      <p v-if="notice" role="status" class="form-success">{{ notice }}</p>
      <template v-if="context && !loading">
        <p v-for="fact in context.xmlFacts" :key="fact">{{ fact }}</p>
        <p v-if="context.reuseNotice">{{ context.reuseNotice }}</p>
        <p v-if="context.blockedReason" role="status">{{ context.blockedReason }}</p>
        <form v-else @submit.prevent="save">
          <label v-for="question in context.questions" :key="question.field">
            {{ question.label }}
            <select v-model="selections[question.field]" :disabled="saving">
              <option value="">Ainda não sei — manter pendente</option>
              <option v-for="option in question.options" :key="option.value" :value="option.value">{{ option.label }}</option>
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
          <p v-if="!context.reuseAvailable">O reaproveitamento precisa da empresa analisada, da identificação do destinatário, do CNPJ do emitente e do código do produto na nota.</p>
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
select { display: block; width: 100%; min-width: 180px; margin-top: 4px; padding: 6px; }
p { overflow-wrap: anywhere; }
</style>
