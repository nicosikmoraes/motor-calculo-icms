<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { itemCalculationStatus, itemCalculationComponents, type ItemFiscalAnswers, type ItemFiscalContext, type SaveItemFiscalAnswersInput } from '@motor/contracts'
import { desktopErrorMessage } from '../error-messages'
import CalculationMemoryDetails from './CalculationMemoryDetails.vue'
import { fiscalReviewErrors } from '../fiscal-review-validation'

const props = defineProps<{ batchId: string; documentId: string; itemNumber: string; expanded?: boolean }>()
const emit = defineEmits<{ saved: [outcome: { status: string; message: string; divergent?: boolean }] }>()
const context = ref<ItemFiscalContext | null>(null)
const selections = ref<Partial<Record<keyof ItemFiscalAnswers, string>>>({})
const loading = ref(false)
const saving = ref(false)
const error = ref('')
const notice = ref('')
const reuseScope = ref<NonNullable<SaveItemFiscalAnswersInput['reuseScope']>>('CURRENT_ITEM')
const showIndividualQuestions = ref(false)
const showManualReview = ref(false)
const attemptedCalculation = ref(false)
const reviewBlock = computed(() => showManualReview.value ? context.value?.manualReviewBlockedReason ?? context.value?.blockedReason : context.value?.blockedReason)
const showingAutomaticResult = computed(() => context.value?.automaticCalculationNotice && itemCalculationStatus(context.value.calculation) === 'CALCULATED' && !showManualReview.value)
const automaticValues = computed(() => {
  const memory = context.value?.calculation
  if (!memory) return []
  const catalog = memory.inputs.some(input => input.name === 'automaticCatalogCalculation')
  const mva = memory.steps.find(step => step.name === 'Base de cálculo do ICMS-ST')?.inputs.appliedMvaPercent
  const ownRate = memory.inputs.find(input => input.name === 'ownOperationRate')?.value
  const fcp = memory.additionalComponents?.find(component => component.component === 'FCP_ST')?.result?.rate
  return [{ label: 'MVA aplicada', value: mva, source: catalog ? 'Catálogo por NCM, CEST e data' : 'XML · pMVAST' },
    { label: 'Alíquota de ICMS', value: memory.result?.rate, source: 'XML · pICMSST / pICMS' },
    { label: 'Alíquota própria', value: ownRate, source: 'XML · pICMS' },
    { label: 'FECOP separado', value: fcp, source: 'XML · pFCPST e regra do componente' }].filter(fact => fact.value !== undefined)
})
const mvaDivergence = computed(() => context.value?.calculation.comparisons?.find(comparison => comparison.component === 'MVA' && comparison.status === 'DIFFERENT'))
const invalidFcpRate = computed(() => selections.value.fcpStApplicableConfirmed === 'true' && selections.value.stInternalRateIncludesFcp === 'true'
  && selections.value.stInternalRate !== undefined && selections.value.stInternalRate !== ''
  && Number(selections.value.stInternalRate.replace(',', '.')) <= 2
  ? 'A alíquota total deve ser maior que 2%, pois inclui os 2 pontos de FECOP. O campo pICMSST do XML informa somente o ICMS; para usar esse valor, marque que ele não inclui FECOP.' : '')
const commonReview = computed(() => Boolean(context.value?.commonScenario) && !showIndividualQuestions.value)
const destinationHint = computed(() => context.value?.commonScenario?.finalConsumerIndicator === '1'
  ? 'A nota identifica consumidor final. Confira se a destinação é uso/consumo ou ativo imobilizado.'
  : context.value?.commonScenario?.finalConsumerIndicator === '0'
    ? 'A nota identifica uma operação sem consumidor final. Confira se a destinação é revenda ou industrialização.'
    : 'A destinação precisa ser confirmada pelo comprador; ela determina se há diferimento parcial.')
const destinationConflict = computed(() => {
  if (!commonReview.value || !selections.value.destination) return ''
  const consumer = ['OWN_USE', 'FIXED_ASSET'].includes(selections.value.destination)
  const indicator = context.value?.commonScenario?.finalConsumerIndicator
  return (indicator === '1' && !consumer) || (indicator === '0' && consumer)
    ? 'Esta destinação não corresponde à indicação de consumidor final do XML. Confira a escolha e a nota antes de calcular.' : ''
})
const visibleQuestions = computed(() => context.value?.questions.filter(question => (question.field !== 'stMvaPercent' || selections.value.stMvaMode === 'MANUAL_APPLIED')
  && (!commonReview.value || !['constructionCompany', 'petroleumOrFuel', 'ordinaryTaxTreatmentConfirmed'].includes(question.field))
  && (question.field !== 'stVehicleImportPriceFloorConfirmed' || selections.value.stVehicleImportedConfirmed === 'true')
  && (question.field !== 'stInternalRateIncludesFcp' || selections.value.fcpStApplicableConfirmed === 'true')) ?? [])
const fieldErrors = computed(() => fiscalReviewErrors(visibleQuestions.value, selections.value))
function fieldError(field: keyof ItemFiscalAnswers): string | undefined {
  return attemptedCalculation.value ? fieldErrors.value[field] : field === 'stInternalRate' ? invalidFcpRate.value || undefined : undefined
}
function setSelections(value: ItemFiscalContext): void {
  selections.value = Object.fromEntries([
    ...value.questions.map(question => [question.field, question.suggestedValue ?? '']),
    ...Object.entries(value.answers).map(([key, entry]) => [key, String(entry)]),
  ])
  if (value.stSpecificMva) selections.value.stMvaMode = 'SPECIFIC_RULE'
}

async function load(): Promise<void> {
  if (loading.value || saving.value) return
  loading.value = true
  error.value = ''
  notice.value = ''
  try {
    context.value = await window.desktopApi.getItemFiscalContext(props.batchId, props.documentId, props.itemNumber)
    showManualReview.value = false
    reuseScope.value = 'CURRENT_ITEM'
    showIndividualQuestions.value = !context.value.commonScenario
    setSelections(context.value)
  } catch (cause) { error.value = desktopErrorMessage(cause, 'Não foi possível carregar as perguntas. Feche e abra as perguntas para tentar novamente.') }
  finally { loading.value = false }
}

async function save(draft = false): Promise<void> {
  if (!context.value || saving.value) return
  error.value = ''
  notice.value = ''
  attemptedCalculation.value = !draft
  if (!draft && Object.keys(fieldErrors.value).length) {
    error.value = 'O cálculo não foi enviado. Corrija os campos destacados abaixo. Você também pode salvar um rascunho para continuar depois.'
    const first = visibleQuestions.value.find(question => fieldErrors.value[question.field])!
    await nextTick()
    const element = document.getElementById(`fiscal-${props.documentId}-${props.itemNumber}-${first.field}`)
    element?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    element?.querySelector<HTMLElement>('input, select')?.focus()
    return
  }
  if (!draft && commonReview.value && (!selections.value.destination || destinationConflict.value)) {
    error.value = destinationConflict.value || 'Escolha a destinação do produto antes de confirmar o cenário.'
    return
  }
  if (!draft && commonReview.value) {
    // O clique confirma expressamente as três condições apresentadas no resumo.
    selections.value = { ...selections.value, constructionCompany: 'false', petroleumOrFuel: 'false', ordinaryTaxTreatmentConfirmed: 'true' }
  }
  saving.value = true
  try {
    // Copiar valores escalares antes da ponte Electron: proxies Vue não são clonáveis.
    const answers = Object.fromEntries(Object.entries(selections.value).filter(([key, value]) => value !== ''
      && (key !== 'stMvaPercent' || selections.value.stMvaMode === 'MANUAL_APPLIED')
      && (key !== 'stVehicleImportPriceFloorConfirmed' || selections.value.stVehicleImportedConfirmed === 'true')
      && (key !== 'stInternalRateIncludesFcp' || selections.value.fcpStApplicableConfirmed === 'true'))
      .map(([key, value]) => [key, value === 'true' ? true : value === 'false' ? false
        : key.startsWith('st') && ['stMvaPercent', 'stInternalRate', 'stOwnOperationRate', 'stSpecificEffectiveRate'].includes(key)
          ? value!.trim().replace(',', '.') : value])) as ItemFiscalAnswers
    context.value = await window.desktopApi.saveItemFiscalAnswers({
      batchId: props.batchId, documentId: props.documentId, itemNumber: props.itemNumber,
      requestId: crypto.randomUUID(), ...(context.value.runId ? { expectedRunId: context.value.runId } : {}), answers,
      reuseScope: reuseScope.value,
      ...(context.value.definitionId ? { expectedDefinitionId: context.value.definitionId } : {}),
    })
    notice.value = context.value.appliedItemNumbers && context.value.appliedItemNumbers.length > 1
      ? `Confirmação salva. ${context.value.appliedItemNumbers.length} itens desta nota foram calculados, com os valores de cada produto.`
      : itemCalculationStatus(context.value.calculation) === 'CALCULATED'
      ? context.value.calculation.result?.component === 'ICMS_ST'
        ? 'Respostas salvas e tributos da entrada calculados.' : 'Respostas salvas e ICMS da operação calculado.'
      : `Rascunho salvo. Cálculo pendente: ${context.value.calculation.reason ?? itemCalculationComponents(context.value.calculation).find(component => component.status !== 'CALCULATED')?.reason ?? 'O item continua pendente.'}`
    const divergent = itemCalculationComponents(context.value.calculation).some(component => component.comparisons?.some(comparison => comparison.status === 'DIFFERENT'))
    if (itemCalculationStatus(context.value.calculation) === 'CALCULATED' && divergent) notice.value += ' Há divergências com os valores declarados no XML; elas permanecem disponíveis para conferência.'
    if (reuseScope.value === 'MATCHING_NOTE_ITEMS') reuseScope.value = 'CURRENT_ITEM'
    emit('saved', { status: itemCalculationStatus(context.value.calculation), message: notice.value, divergent })
  } catch (cause) {
    const message = desktopErrorMessage(cause, 'Não foi possível salvar as respostas. O que você preencheu foi mantido; tente salvar novamente.')
    const noteChanged = message === 'As respostas foram alteradas em outra tela. Reabra as perguntas antes de salvar.'
    const definitionChanged = message === 'A definição para próximas notas mudou em outra tela. Reabra as perguntas antes de salvar.'
    if (noteChanged || definitionChanged) {
      const reason = noteChanged
        ? 'A análise desta nota foi atualizada depois que você abriu as perguntas.'
        : 'As respostas cadastradas para as próximas notas deste produto foram atualizadas depois que você abriu as perguntas.'
      try {
        // Uma nova execução pode vir de outro item da nota ou de outra tela.
        // Atualiza a versão esperada sem substituir as escolhas ainda não salvas.
        context.value = await window.desktopApi.getItemFiscalContext(props.batchId, props.documentId, props.itemNumber)
        let scopeNotice = ''
        if (reuseScope.value === 'MATCHING_NOTE_ITEMS' && !context.value.matchingNoteItems?.length) {
          reuseScope.value = 'CURRENT_ITEM'
          scopeNotice = ' O grupo de itens não está mais disponível; confira onde aplicar a confirmação.'
        }
        error.value = `Não foi possível salvar. ${reason} Atualizei as informações e mantive o que você preencheu. Confira as respostas e confirme novamente.${scopeNotice}`
      } catch {
        error.value = `Não foi possível salvar. ${reason} Feche e abra as perguntas para carregar a versão atual; depois confira as respostas e salve novamente.`
      }
    } else error.value = message
  }
  finally { saving.value = false }
}
async function calculateFromXml(): Promise<void> {
  if (!context.value || saving.value) return
  error.value = ''; notice.value = ''; saving.value = true
  try {
    context.value = await window.desktopApi.saveItemFiscalAnswers({ batchId: props.batchId, documentId: props.documentId,
      itemNumber: props.itemNumber, requestId: crypto.randomUUID(), ...(context.value.runId ? { expectedRunId: context.value.runId } : {}),
      answers: {}, calculationMode: 'AUTOMATIC' })
    setSelections(context.value)
    attemptedCalculation.value = false
    showManualReview.value = false
    notice.value = itemCalculationStatus(context.value.calculation) === 'CALCULATED'
      ? 'Cálculo automático gravado com os dados identificados. A tentativa anterior permanece no histórico.'
      : context.value.calculation.reason ?? 'Ainda faltam dados para concluir o cálculo.'
    const divergent = itemCalculationComponents(context.value.calculation).some(component => component.comparisons?.some(comparison => comparison.status === 'DIFFERENT'))
    if (divergent) notice.value += ' Há divergências com os parâmetros declarados no XML.'
    emit('saved', { status: itemCalculationStatus(context.value.calculation), message: notice.value, divergent })
  } catch (cause) { error.value = desktopErrorMessage(cause, 'Não foi possível calcular automaticamente com os dados identificados.') }
  finally { saving.value = false }
}
function toggleQuestions(event: Event): void {
  if ((event.currentTarget as HTMLDetailsElement).open && !context.value) void load()
}
function compatibleDestination(value: string): boolean {
  const indicator = context.value?.commonScenario?.finalConsumerIndicator
  const consumer = ['OWN_USE', 'FIXED_ASSET'].includes(value)
  return indicator === '1' ? consumer : indicator === '0' ? !consumer : true
}
const destinationDescriptions: Record<string, string> = {
  RESALE: 'Venda a outro comprador', INDUSTRIALIZATION: 'Uso na fabricação de produtos',
  OWN_USE: 'Utilização ou consumo pela empresa', FIXED_ASSET: 'Bem do patrimônio da empresa',
}
const savedProblem = computed(() => context.value && itemCalculationStatus(context.value.calculation) !== 'CALCULATED'
  ? context.value.calculation.reason ?? itemCalculationComponents(context.value.calculation).find(component => component.status !== 'CALCULATED')?.reason : undefined)
onMounted(() => { if (props.expanded) void load() })
watch(() => [props.batchId, props.documentId, props.itemNumber], () => {
  context.value = null; selections.value = {}; error.value = ''; notice.value = ''
  showManualReview.value = false
  attemptedCalculation.value = false
  if (props.expanded) void load()
})
watch(() => props.expanded, expanded => { if (expanded && !context.value) void load() })
</script>

<template>
  <component :is="expanded ? 'section' : 'details'" class="fiscal-questions" :class="{ 'review-expanded': expanded }" @toggle="toggleQuestions">
    <summary v-if="!expanded">Conferir dados e calcular</summary>
    <div v-if="loading" class="review-loading" role="status">Carregando as perguntas e os dados deste item…</div>
    <div v-if="!context && !loading && error" class="review-message is-error" role="alert"><p>{{ error }}</p><button type="button" class="button secondary" @click="load">Carregar novamente</button></div>
    <div v-if="context && !loading" class="review-layout">
      <section v-if="showingAutomaticResult" class="review-main">
        <header class="review-heading"><h4>Cálculo automático concluído</h4><p>{{ context.automaticCalculationNotice }}</p></header>
        <dl class="reference-data"><div v-for="fact in automaticValues" :key="fact.label"><dt>{{ fact.label }}</dt><dd>{{ fact.value?.replace('.', ',') }}% · {{ fact.source }}</dd></div></dl>
        <p v-if="mvaDivergence" class="review-message is-warning">A MVA declarada no XML ({{ mvaDivergence.declared?.replace('.', ',') }}%) difere da aplicada pelo catálogo ({{ mvaDivergence.calculated.replace('.', ',') }}%). O cálculo foi concluído com a referência do catálogo.</p>
        <p v-for="component in itemCalculationComponents(context.calculation)" :key="component.component || 'ICMS'">{{ component.component || 'ICMS' }}: <strong>R$ {{ component.result?.amount?.replace('.', ',') }}</strong> · Base R$ {{ component.result?.base?.replace('.', ',') }} · Alíquota {{ component.result?.rate }}%</p>
        <CalculationMemoryDetails :calculation="context.calculation" />
        <button type="button" class="button secondary" @click="showManualReview = true">Revisar enquadramento fiscal</button>
        <RouterLink v-if="context.purchaseReviewCompany" class="button secondary" :to="{ path: '/lotes/novo', query: { companyCnpj: context.purchaseReviewCompany.cnpj } }">Importar para a empresa compradora</RouterLink>
      </section>
      <form v-else-if="!reviewBlock" class="review-main" novalidate @submit.prevent="save()">
        <header class="review-heading"><h4>O que você precisa confirmar</h4><p>Confira a destinação e o tratamento fiscal para calcular este item.</p></header>
        <div v-if="error" class="review-message is-error" role="alert"><strong>A confirmação não foi enviada</strong><p>{{ error }}</p></div>
        <div v-if="notice" class="review-message" :class="itemCalculationStatus(context.calculation) === 'CALCULATED' ? 'is-success' : 'is-warning'" role="status"><p>{{ notice }}</p></div>
        <div v-if="savedProblem && !notice" class="review-message is-warning"><strong>Respostas salvas; o último cálculo ficou pendente</strong><p>{{ savedProblem }}</p><small>Os valores disponíveis no XML estão preenchidos abaixo. Revise os campos e clique em Salvar e calcular, ou use o cálculo pelos dados do XML.</small></div>
        <button v-if="context.xmlCalculationAvailable" type="button" class="button secondary" :disabled="saving" @click="calculateFromXml">Calcular automaticamente com os dados identificados</button>

        <div v-if="context.commonScenario" class="review-modes" aria-label="Forma de confirmar o tratamento">
          <button type="button" :aria-pressed="commonReview" :class="{ active: commonReview }" :disabled="saving" @click="showIndividualQuestions = false">Cenário comum</button>
          <button type="button" :aria-pressed="!commonReview" :class="{ active: !commonReview }" :disabled="saving" @click="showIndividualQuestions = true">Conferir exceções</button>
        </div>

        <section class="review-fields" aria-label="Respostas da revisão">
          <fieldset v-for="question in visibleQuestions" :id="`fiscal-${documentId}-${itemNumber}-${question.field}`" :key="question.field" class="review-field" :class="{ 'has-error': fieldError(question.field) }">
            <legend>{{ question.label }}</legend>
            <template v-if="question.field === 'destination'">
              <p v-if="context.commonScenario" class="field-help">{{ destinationHint }}</p>
              <div class="destination-options">
                <label v-for="option in question.options" :key="option.value" class="choice-card" :class="{ selected: selections.destination === option.value, unavailable: !compatibleDestination(option.value) }">
                  <input v-model="selections.destination" type="radio" :name="`destination-${documentId}-${itemNumber}`" :value="option.value" :disabled="saving || !compatibleDestination(option.value)">
                  <span><strong>{{ option.label }}</strong><small>{{ compatibleDestination(option.value) ? destinationDescriptions[option.value] : 'Não corresponde ao consumidor final informado no XML' }}</small></span>
                </label>
              </div>
            </template>
            <input v-else-if="question.inputType === 'decimal'" v-model="selections[question.field]" :aria-label="question.label" :aria-invalid="Boolean(fieldError(question.field))" :aria-describedby="fieldError(question.field) ? `error-${documentId}-${itemNumber}-${question.field}` : undefined" type="text" inputmode="decimal" :disabled="saving" placeholder="Informe o percentual">
            <div v-else-if="question.options?.length === 2" class="binary-options">
              <label v-for="option in question.options" :key="option.value" class="choice-card" :class="{ selected: selections[question.field] === option.value }">
                <input v-model="selections[question.field]" type="radio" :name="`${question.field}-${documentId}-${itemNumber}`" :value="option.value" :disabled="saving"><span>{{ option.label }}</span>
              </label>
            </div>
            <select v-else v-model="selections[question.field]" :aria-label="question.label" :disabled="saving"><option value="">Escolha uma resposta</option><option v-for="option in question.options" :key="option.value" :value="option.value">{{ option.label }}</option></select>
            <p v-if="question.field === 'stInternalRate' && question.suggestedValue !== undefined" class="field-help">O XML informa {{ question.suggestedValue.replace('.', ',') }}% de ICMS (pICMSST), com FECOP em campo separado. <button type="button" class="text-button" :disabled="saving" @click="selections.stInternalRate = question.suggestedValue; selections.stInternalRateIncludesFcp = 'false'">Usar valor do XML</button></p>
            <p v-if="fieldError(question.field)" :id="`error-${documentId}-${itemNumber}-${question.field}`" class="field-error" role="alert">{{ fieldError(question.field) }}</p>
          </fieldset>
          <p v-if="destinationConflict" class="review-message is-error" role="status">{{ destinationConflict }}</p>
        </section>

        <section v-if="commonReview" class="treatment-summary" aria-label="Condições que serão confirmadas">
          <h5>Tratamento que você vai confirmar</h5>
          <dl><div><dt>Destinatário</dt><dd>Fora da construção civil</dd></div><div><dt>Produto</dt><dd>Não é petróleo ou combustível</dd></div><div><dt>Regra de ICMS</dt><dd>Comum de 19,5%, com diferimento quando aplicável</dd></div></dl>
          <p>Ao clicar em <strong>Confirmar e calcular</strong>, você confirma essas condições, sem ST, FCP, redução de base ou outro tratamento específico. Para revisar outra hipótese, escolha <strong>Conferir exceções</strong>.</p>
        </section>

        <section v-if="context.reuseAvailable || context.matchingNoteItems?.length" class="answer-scope">
          <h5>Aplicação das respostas</h5>
          <label>Onde aplicar esta confirmação?<select v-model="reuseScope" :disabled="saving"><option value="CURRENT_ITEM">Somente neste item</option><option v-if="context.matchingNoteItems?.length" value="MATCHING_NOTE_ITEMS">Nos {{ context.matchingNoteItems.length }} itens compatíveis desta nota</option><option v-if="context.reuseAvailable" value="FUTURE_NOTES">Também nas próximas notas deste mesmo produto</option></select></label>
          <div v-if="reuseScope === 'MATCHING_NOTE_ITEMS'" class="scope-products"><p>Confira os produtos que receberão estas respostas:</p><ul><li v-for="item in context.matchingNoteItems" :key="item.itemNumber"><strong>Item {{ item.itemNumber }}</strong><span>{{ item.productCode || item.description || 'Produto sem código' }}</span></li></ul><small>O valor, a base e o rateio são calculados separadamente para cada produto.</small></div>
          <p v-else-if="reuseScope === 'FUTURE_NOTES'" class="field-help">A definição será reaproveitada nas próximas notas deste produto quando o contexto fiscal corresponder ao que foi confirmado.</p>
        </section>

        <footer class="review-submit"><div><strong>{{ commonReview ? 'Tudo conferido?' : 'Enviar a revisão' }}</strong><p>Calcular exige os campos destacados. Salvar rascunho permite continuar depois.</p></div><button type="button" class="button secondary" :disabled="saving" @click="save(true)">Salvar rascunho</button><button type="submit" class="button primary" :disabled="saving">{{ saving ? 'Calculando…' : commonReview ? 'Confirmar e calcular' : 'Salvar e calcular' }}</button></footer>
      </form>
      <section v-else class="review-main">
        <header class="review-heading"><h4>{{ context.purchaseReviewCompany ? 'Confira a empresa escolhida para este lote' : 'Esta operação exige outra análise' }}</h4><p>{{ context.purchaseReviewCompany ? 'A empresa analisada determina se a nota representa uma compra ou uma venda.' : 'O motivo abaixo precisa ser resolvido antes do cálculo.' }}</p></header>
        <div class="review-message is-warning" role="status">{{ reviewBlock }}</div>
        <button v-if="context.xmlCalculationAvailable" type="button" class="button primary" :disabled="saving" @click="calculateFromXml">Calcular automaticamente com os dados identificados</button>
        <p v-if="error" class="review-message is-error" role="alert">{{ error }}</p>
        <template v-if="context.purchaseReviewCompany">
          <p>Para conferir a entrada de {{ context.purchaseReviewCompany.name || context.purchaseReviewCompany.cnpj }}, selecione novamente o arquivo e confirme a empresa compradora na etapa “Revise as empresas”. As perguntas de ST e o botão de cálculo aparecem nesse enquadramento.</p>
          <RouterLink class="button secondary" :to="{ path: '/lotes/novo', query: { companyCnpj: context.purchaseReviewCompany.cnpj } }">Importar para conferir a compra</RouterLink>
        </template>
      </section>

      <aside class="review-reference" aria-label="Dados de referência">
        <section class="reference-card"><h4>Dados da nota</h4><p>Informações lidas do XML.</p><dl v-if="context.xmlData" class="reference-data"><div v-for="fact in context.xmlData" :key="fact.label"><dt>{{ fact.label }}</dt><dd>{{ fact.value }}</dd></div></dl><ul v-else class="legacy-facts"><li v-for="fact in context.xmlFacts" :key="fact">{{ fact }}</li></ul></section>
        <section v-if="context.stMvaReference && !context.stSpecificMva" class="reference-card"><h4>MVA da operação</h4><template v-if="context.stMvaReference.status === 'FOUND'"><strong class="reference-number">{{ context.stMvaReference.originalMvaPercent }}%</strong><p>{{ context.stMvaReference.description }}</p><small>{{ context.stMvaReference.legalBasis }}</small><a :href="context.stMvaReference.sourceUrl" target="_blank" rel="noopener noreferrer">Consultar tabela oficial</a></template><p v-else>{{ context.stMvaReference.reason }}</p></section>
        <section v-if="context.stSpecificMva" class="reference-card"><h4>{{ context.stSpecificMva.sector === 'FUEL' ? 'Combustíveis e lubrificantes' : 'Veículos' }}</h4><p>Regra de MVA do art. {{ context.stSpecificMva.article }}.</p><p v-if="context.stSpecificMva.status === 'CALCULATED'">Original: {{ context.stSpecificMva.originalMvaPercent }}% · Aplicada: {{ context.stSpecificMva.appliedMvaPercent }}%.</p><p v-if="context.stSpecificMva.reason">{{ context.stSpecificMva.reason }}</p><a :href="context.stSpecificMva.sourceUrl" target="_blank" rel="noopener noreferrer">Consultar resolução</a></section>
        <section v-if="context.reuseNotice" class="reference-card"><h4>Definição do produto</h4><p>{{ context.reuseNotice }}</p></section>
        <details class="reference-card"><summary>Detalhes usados na conferência</summary><ul class="legacy-facts"><li v-for="fact in context.xmlFacts" :key="fact">{{ fact }}</li></ul></details>
      </aside>
    </div>
  </component>
</template>

<style scoped>
.fiscal-questions { margin-top: 12px; color: #243650; font-size: 14px; line-height: 1.55; }
.fiscal-questions > summary { padding: 12px 0; color: #3449aa; font-weight: 650; }
.review-expanded { margin-top: 0; }
.review-layout { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 24px; align-items: start; padding-top: 16px; }
.review-main, .review-reference { min-width: 0; }
.review-heading { margin-bottom: 20px; }
.review-heading h4, .reference-card h4 { margin: 0 0 6px; font-size: 17px; color: #1e3150; }
.review-heading p, .reference-card > p { margin: 0; color: #52647f; }
.review-loading { padding: 24px; color: #52647f; }
.review-message { padding: 14px 16px; margin: 0 0 18px; border: 1px solid; border-radius: 10px; }
.review-message p { margin: 5px 0 0; }
.review-field.has-error { padding: 12px; border: 1px solid #bb3030; border-radius: 8px; }
.field-error { color: #a82424; font-size: 13px; font-weight: 600; margin: 8px 0 0; }
.field-help .text-button { color: #3449aa; padding: 0; border: 0; background: transparent; font: inherit; text-decoration: underline; cursor: pointer; }
.review-message small { display: block; margin-top: 8px; font-size: 12px; }
.is-error { background: #fff2f1; border-color: #f0cbc6; color: #8a302a; }
.is-warning { background: #fff9eb; border-color: #ecdeba; color: #785824; }
.is-success { background: #eef8f2; border-color: #c2dfce; color: #286342; }
.review-modes { display: flex; gap: 4px; padding: 5px; margin-bottom: 22px; border-radius: 10px; background: #edf1f8; }
.review-modes button { flex: 1; padding: 10px 12px; border: 0; border-radius: 7px; font: inherit; font-size: 13px; color: #52647f; background: none; cursor: pointer; }
.review-modes button.active { color: #2c49b3; background: white; box-shadow: 0 2px 6px #24365012; font-weight: 700; }
.review-fields { display: grid; gap: 20px; }
.review-field { min-width: 0; padding: 0; margin: 0; border: 0; }
.review-field legend { width: 100%; margin-bottom: 9px; font-weight: 650; color: #263c5d; }
.field-help { margin: 0 0 12px; color: #52647f; font-size: 13px; }
.destination-options, .binary-options { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.choice-card { display: flex; align-items: flex-start; gap: 10px; padding: 13px; border: 1px solid #d8e1ef; border-radius: 9px; background: white; cursor: pointer; }
.choice-card.selected { border-color: #627ce1; background: #f0f4ff; }
.choice-card.unavailable { background: #f8f9fb; color: #758094; cursor: default; }
.choice-card input { width: 17px; height: 17px; min-height: 0; flex: none; padding: 0; margin: 3px 0 0; accent-color: #455fdb; }
.choice-card strong { display: block; font-size: 13px; }
.choice-card small { display: block; margin-top: 3px; color: #52647f; font-size: 12px; line-height: 1.4; }
.unavailable small { color: #758094; }
.review-field > input, .review-field select, .answer-scope select { margin-top: 5px; min-width: 0; font-size: 14px; }
.treatment-summary { padding: 17px 18px; margin-top: 22px; border: 1px solid #dbe4f5; border-radius: 10px; background: #f7f9ff; }
.treatment-summary h5, .answer-scope h5 { margin: 0 0 12px; font-size: 14px; }
.treatment-summary dl { margin: 0; display: grid; gap: 10px; }
.treatment-summary dl > div { display: grid; grid-template-columns: 100px minmax(0, 1fr); gap: 12px; }
.treatment-summary dt { color: #52647f; font-size: 12px; }
.treatment-summary dd { margin: 0; font-size: 13px; font-weight: 600; }
.treatment-summary p { margin: 14px 0 0; color: #52647f; font-size: 12px; }
.answer-scope { margin-top: 24px; padding-top: 20px; border-top: 1px solid #e4eaf3; }
.answer-scope > label { display: block; font-size: 13px; }
.answer-scope .field-help { margin-top: 10px; }
.scope-products { padding: 12px 14px; margin-top: 12px; border-radius: 9px; background: #f5f7fb; font-size: 13px; }
.scope-products p { margin: 0 0 8px; }
.scope-products ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 5px; }
.scope-products li { display: flex; gap: 12px; }
.scope-products small { display: block; margin-top: 10px; color: #52647f; }
.review-submit { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 14px; padding-top: 22px; margin-top: 22px; border-top: 1px solid #e4eaf3; }
.review-submit strong { font-size: 13px; }
.review-submit p { margin: 3px 0 0; font-size: 12px; color: #52647f; }
.review-submit .button { min-height: 46px; }
.review-reference { display: grid; gap: 16px; }
.reference-card { padding: 18px; border: 1px solid #e2e8f2; border-radius: 11px; background: #f8fafd; }
.reference-card h4 { font-size: 14px; }
.reference-card > p { font-size: 12px; }
.reference-data { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 12px; margin: 18px 0 0; }
.reference-data dt { color: #52647f; font-size: 11px; }
.reference-data dd { margin: 4px 0 0; font-weight: 600; font-size: 13px; overflow-wrap: anywhere; }
.reference-card a { display: block; margin-top: 12px; font-size: 12px; color: #3655b9; }
.reference-number { display: block; margin: 12px 0; font-size: 24px; }
.reference-card small { display: block; margin-top: 10px; font-size: 11px; color: #52647f; }
.reference-card summary { color: #3e5272; font-size: 12px; font-weight: 600; }
.legacy-facts { padding-left: 17px; margin-bottom: 0; color: #52647f; font-size: 12px; }
.legacy-facts li + li { margin-top: 10px; }
@media (max-width: 1050px) { .review-layout { grid-template-columns: minmax(0, 1fr); } .review-reference { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 650px) { .destination-options, .binary-options, .review-reference { grid-template-columns: minmax(0, 1fr); } .review-submit .button { width: 100%; } }
</style>
