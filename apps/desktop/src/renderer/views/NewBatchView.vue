<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import type { BatchCompanyCandidate, BatchOperationProgress, BatchPreparation, CreatedBatchSummary, SelectedSource, WorkspaceState } from '@motor/contracts'
import { serializableSources } from '../serializable-sources'
import { suggestCompanyForDocument } from '../company-assignment'

const sources = ref<SelectedSource[]>([])
const selecting = ref(false)
const inspecting = ref(false)
const hasSources = computed(() => sources.value.length > 0)
const workspace = ref<WorkspaceState>({ companies: [] })
const assignments = ref<Record<string, string>>({})
const selectedEnvironmentCode = ref<'1' | '2' | ''>('')
const preparation = ref<BatchPreparation | null>(null)
const error = ref('')
const registrationCandidate = ref<BatchCompanyCandidate | null>(null)
const registrationLegalName = ref('')
const registrationTradeName = ref('')
const registrationState = ref('')
const registering = ref(false)
const creatingBatch = ref(false)
const createdBatch = ref<CreatedBatchSummary | null>(null)
const operationProgress = ref<BatchOperationProgress | null>(null)
const activeOperationId = ref('')
const cancelling = ref(false)
const notice = ref('')
let unsubscribeProgress: (() => void) | undefined

const progressLabel = computed(() => {
  if (operationProgress.value?.phase === 'CANCELLING') return 'Cancelando após a entrada atual…'
  if (operationProgress.value?.phase === 'SAVING') return 'Salvando lote com segurança…'
  return inspecting.value ? 'Inspecionando documentos…' : 'Processando lote…'
})

async function cancelOperation(): Promise<void> {
  if (!activeOperationId.value || cancelling.value) return
  cancelling.value = true
  try {
    await window.desktopApi.cancelBatchOperation(activeOperationId.value)
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Não foi possível cancelar a operação.'
    cancelling.value = false
  }
}

const remainingCount = computed(() => preparation.value?.documents.filter((document) => !assignments.value[document.source]).length ?? 0)

function availableCompanies(document: BatchPreparation['documents'][number]) {
  return workspace.value.companies.filter((company) =>
    company.active && (company.cnpj === document.issuerCnpj || company.cnpj === document.recipientCnpj),
  )
}

function documentLabel(source: string): string {
  return source.split('#').at(-1)?.split('/').at(-1) ?? source
}

function setPreparation(value: BatchPreparation): void {
  preparation.value = value
  const next: Record<string, string> = {}
  for (const document of value.documents) {
    const prior = assignments.value[document.source]
    next[document.source] = suggestCompanyForDocument(document, workspace.value.companies, prior)
  }
  assignments.value = next
  selectedEnvironmentCode.value = selectedEnvironmentCode.value || (value.environmentCodes.length === 1
    ? value.environmentCodes[0]!
    : '')
}

async function loadWorkspace(): Promise<void> {
  workspace.value = await window.desktopApi.getWorkspace()
}

async function selectSources(): Promise<void> {
  error.value = ''
  notice.value = ''
  selecting.value = true
  try {
    sources.value = await window.desktopApi.selectSources()
    preparation.value = null
    selectedEnvironmentCode.value = ''
    assignments.value = {}
    createdBatch.value = null
    if (sources.value.length > 0) {
      inspecting.value = true
      activeOperationId.value = crypto.randomUUID()
      setPreparation(await window.desktopApi.inspectSources(serializableSources(sources.value), activeOperationId.value))
    }
  } catch (cause) {
    if (cancelling.value) notice.value = 'Inspeção cancelada. Selecione os arquivos para tentar novamente.'
    else error.value = cause instanceof Error ? cause.message : 'Não foi possível inspecionar os arquivos.'
  } finally {
    selecting.value = false
    inspecting.value = false
    activeOperationId.value = ''
    operationProgress.value = null
    cancelling.value = false
  }
}

async function createBatch(): Promise<void> {
  if (!preparation.value || remainingCount.value || !selectedEnvironmentCode.value) return
  error.value = ''
  notice.value = ''
  creatingBatch.value = true
  activeOperationId.value = crypto.randomUUID()
  try {
    createdBatch.value = await window.desktopApi.createBatch({
      operationId: activeOperationId.value,
      totalEntries: preparation.value.totalEntries,
      assignments: preparation.value.documents.map(({ source }) => ({ source, companyId: assignments.value[source]! })),
      environmentCode: selectedEnvironmentCode.value,
      sources: serializableSources(sources.value),
    })
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Não foi possível criar o lote.'
  } finally {
    creatingBatch.value = false
    activeOperationId.value = ''
    operationProgress.value = null
    cancelling.value = false
  }
}

function needsRegistration(candidate: BatchCompanyCandidate): boolean {
  return !candidate.matchedCompanyId && !!preparation.value?.documents.some((document) =>
    !assignments.value[document.source] &&
    (document.issuerCnpj === candidate.cnpj || (!document.issuerCnpj && document.recipientCnpj === candidate.cnpj)),
  )
}

function startRegistration(candidate: BatchCompanyCandidate): void {
  registrationCandidate.value = candidate
  registrationLegalName.value = candidate.legalName ?? ''
  registrationTradeName.value = ''
  registrationState.value = candidate.state ?? ''
  void nextTick(() => document.getElementById('registration-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
}

async function registerCandidate(): Promise<void> {
  const candidate = registrationCandidate.value
  if (!candidate) return
  error.value = ''
  registering.value = true
  try {
    const company = await window.desktopApi.createCompany({
      cnpj: candidate.cnpj,
      legalName: registrationLegalName.value,
      ...(registrationTradeName.value.trim() ? { tradeName: registrationTradeName.value } : {}),
      state: registrationState.value,
    })
    await loadWorkspace()
    if (preparation.value) {
      setPreparation({
        ...preparation.value,
        candidates: preparation.value.candidates.map((item) =>
          item.cnpj === candidate.cnpj ? { ...item, matchedCompanyId: company.id } : item),
      })
    }
    registrationCandidate.value = null
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Não foi possível cadastrar a empresa.'
  } finally {
    registering.value = false
  }
}

onMounted(() => {
  unsubscribeProgress = window.desktopApi.onBatchProgress((progress) => {
    if (progress.operationId === activeOperationId.value) operationProgress.value = progress
  })
  void loadWorkspace().catch((cause) => {
    error.value = cause instanceof Error ? cause.message : 'Não foi possível carregar as empresas.'
  })
})
onUnmounted(() => unsubscribeProgress?.())
</script>

<template>
  <section>
    <header class="page-header compact">
      <div>
        <p class="eyebrow">Importação</p>
        <h2>Novo lote</h2>
        <p class="lead">Selecione XMLs de NF-e/NFC-e ou um arquivo ZIP.</p>
      </div>
    </header>

    <p v-if="error" class="form-error notice" role="alert">{{ error }}</p>
    <p v-if="notice" class="form-success notice" role="status">{{ notice }}</p>

    <article v-if="inspecting || creatingBatch" class="card import-progress" role="status" aria-live="polite">
      <div class="import-progress-heading">
        <div>
          <p class="eyebrow">{{ inspecting ? 'Inspeção' : 'Importação' }} em andamento</p>
          <h3>{{ progressLabel }}</h3>
          <p v-if="operationProgress?.currentSource">{{ operationProgress.currentSource }}</p>
        </div>
        <strong v-if="operationProgress?.total">{{ operationProgress.completed }} / {{ operationProgress.total }}</strong>
      </div>
      <progress v-if="operationProgress?.total" :value="operationProgress.completed" :max="operationProgress.total" />
      <progress v-else />
      <div class="import-progress-footer">
        <span>{{ operationProgress?.total ? 'Entradas verificadas' : 'Preparando a leitura…' }}</span>
        <button class="button secondary" type="button"
          :disabled="cancelling || operationProgress?.phase === 'SAVING'"
          @click="cancelOperation">
          {{ cancelling ? 'Cancelando…' : 'Cancelar' }}
        </button>
      </div>
    </article>

    <div class="workflow-steps" aria-label="Etapas da importação">
      <span class="step active">01 <b>Selecionar arquivos</b></span>
      <span class="step" :class="{ active: preparation }">02 <b>Revisar empresas</b></span>
      <span class="step" :class="{ active: createdBatch }">03 <b>Processar lote</b></span>
    </div>

    <article class="card upload-card">
      <div class="upload-mark" aria-hidden="true">XML</div>
      <h3>{{ hasSources ? `${sources.length} arquivo(s) selecionado(s)` : 'Escolha os documentos' }}</h3>
      <p>
        A inspeção identifica CNPJs com segurança antes de criar o lote e aceita
        apenas XML e ZIP escolhidos pelo diálogo do aplicativo.
      </p>
      <button class="button primary" type="button" :disabled="selecting || inspecting || creatingBatch" @click="selectSources">
        {{ inspecting ? 'Inspecionando…' : selecting ? 'Abrindo…' : 'Selecionar arquivos' }}
      </button>

      <ul v-if="hasSources" class="source-list">
        <li v-for="source in sources" :key="source.path">
          <span class="tag">{{ source.kind }}</span>
          <span>{{ source.path }}</span>
        </li>
      </ul>
    </article>

    <article v-if="preparation" class="card preparation-card">
      <p class="eyebrow">Inspeção concluída</p>
      <h3>{{ preparation.inspectedXmlCount }} XML(s) reconhecido(s)</h3>

      <label class="standalone-field environment-field">
        <span>Ambiente confirmado para este lote</span>
        <select v-model="selectedEnvironmentCode">
          <option value="">Selecione o ambiente</option>
          <option value="1">Produção</option>
          <option value="2">Homologação</option>
        </select>
        <small v-if="preparation.environmentCodes.length > 1">
          Os arquivos contêm ambientes diferentes; os divergentes serão preservados como pendência.
        </small>
        <small v-else-if="preparation.environmentCodes.length === 0">
          O ambiente não pôde ser identificado automaticamente.
        </small>
      </label>

      <div class="review-heading">
        <div>
          <p class="eyebrow">Associação por nota</p>
          <h3>Revise as empresas</h3>
          <p>O CNPJ da empresa analisada precisa estar cadastrado em cada XML. Clientes e fornecedores não precisam ser cadastrados se não forem a empresa analisada.</p>
        </div>
        <span class="review-count" :class="{ incomplete: remainingCount }">{{ preparation.documents.length - remainingCount }}/{{ preparation.documents.length }} prontas</span>
      </div>

      <div class="document-review-list">
        <div v-for="document in preparation.documents" :key="document.source" class="document-review-row">
          <div class="document-review-info">
            <strong>NF-e {{ document.number }}</strong>
            <span :title="document.source">{{ documentLabel(document.source) }}</span>
            <small>Emitente {{ document.issuerCnpj || 'sem CNPJ' }} · Destinatário {{ document.recipientCnpj || 'sem CNPJ' }}</small>
          </div>
          <label class="standalone-field">
            <span>Empresa analisada</span>
            <select v-model="assignments[document.source]">
              <option value="">Cadastrar ou escolher empresa</option>
              <option v-for="company in availableCompanies(document)" :key="company.id" :value="company.id">
                {{ company.legalName }} — {{ company.cnpj }}
              </option>
            </select>
          </label>
        </div>
        <p v-if="preparation.documents.length === 0" class="empty-state">Nenhuma nota fiscal reconhecida.</p>
      </div>

      <details v-if="remainingCount" class="company-candidates" open>
        <summary>{{ remainingCount }} nota(s) aguardando empresa cadastrada</summary>
        <div class="candidate-list">
          <div v-for="candidate in preparation.candidates.filter(needsRegistration)" :key="candidate.cnpj" class="candidate-row">
            <div>
              <strong>{{ candidate.legalName || candidate.cnpj }}</strong>
              <span>{{ candidate.cnpj }} · {{ candidate.state || 'UF não informada' }} · {{ candidate.documentCount }} nota(s)</span>
            </div>
            <button class="button secondary" type="button" @click="startRegistration(candidate)">Cadastrar CNPJ</button>
          </div>
        </div>
      </details>

      <p v-if="preparation.documents.length && !remainingCount" class="form-success">Todas as notas têm uma empresa associada.</p>
      <button v-if="!createdBatch" class="button primary confirm-batch" type="button"
        :disabled="creatingBatch || !selectedEnvironmentCode || !!remainingCount || !preparation.documents.length"
        @click="createBatch">
        {{ creatingBatch ? 'Processando lote…' : 'Confirmar e processar lote' }}
      </button>

      <div v-if="createdBatch" class="batch-result">
        <p class="eyebrow">{{ createdBatch.status === 'CANCELADO' ? 'Importação cancelada' : 'Lote criado' }}</p>
        <strong>{{ createdBatch.id }}</strong>
        <span>{{ createdBatch.totalFiles }} arquivo(s) · {{ createdBatch.totalDocuments }} nota(s) · {{ createdBatch.totalPendencies }} pendência(s)</span>
        <span v-if="createdBatch.status === 'CANCELADO'">As entradas já lidas e os diagnósticos foram preservados. As demais não foram processadas.</span>
        <RouterLink class="button secondary" :to="`/lotes/${createdBatch.id}`">Abrir detalhes do lote</RouterLink>
      </div>

      <details v-if="preparation.issues.length" class="issues-panel">
        <summary>{{ preparation.issues.length }} pendência(s) encontrada(s)</summary>
        <ul>
          <li v-for="issue in preparation.issues" :key="`${issue.source}:${issue.code}`">
            <strong>{{ issue.code }}</strong> — {{ issue.source }}: {{ issue.message }}
          </li>
        </ul>
      </details>
    </article>

    <article v-if="registrationCandidate" id="registration-form" class="card form-card registration-card">
      <p class="eyebrow">Cadastrar empresa analisada</p>
      <h3>{{ registrationCandidate.cnpj }}</h3>
      <form class="form-grid" @submit.prevent="registerCandidate">
        <label class="field-wide">
          <span>CNPJ identificado</span>
          <input :value="registrationCandidate.cnpj" disabled />
        </label>
        <label class="field-wide">
          <span>Razão social</span>
          <input v-model="registrationLegalName" required />
        </label>
        <label class="field-wide">
          <span>Nome fantasia <small>opcional</small></span>
          <input v-model="registrationTradeName" />
        </label>
        <label>
          <span>UF</span>
          <input v-model="registrationState" maxlength="2" required />
        </label>
        <button class="button primary" type="submit" :disabled="registering">
          {{ registering ? 'Cadastrando…' : 'Cadastrar empresa' }}
        </button>
      </form>
    </article>
  </section>
</template>

<style scoped>
.upload-card h3 { margin: 9px 0; font: 700 25px Georgia, serif; }
.upload-card p { color: #606b64; line-height: 1.65; }
.upload-card { max-width: 820px; padding: 42px; text-align: center; }
.batch-company-card, .preparation-card { max-width: 820px; margin-bottom: 20px; padding: 28px; }
.batch-company-card h3, .preparation-card h3 { margin: 8px 0 20px; font: 700 24px Georgia, serif; }
.standalone-field { display: grid; gap: 8px; color: #46524b; font-size: 14px; font-weight: 700; }
.candidate-list { display: grid; gap: 10px; }
.candidate-list > p { color: #606b64; }
.candidate-row { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 14px; border-radius: 9px; background: #f4f1e8; }
.candidate-row > div { display: grid; gap: 4px; }
.candidate-row span { color: #69736d; font-size: 13px; }
.registration-card { max-width: 820px; margin-top: 20px; }
.issues-panel { margin-top: 18px; color: #56615a; }
.issues-panel summary { cursor: pointer; font-weight: 700; }
.issues-panel ul { display: grid; gap: 8px; padding-left: 22px; font-size: 13px; }
.confirm-batch { margin-top: 18px; }
.batch-result { display: grid; gap: 8px; margin-top: 18px; padding: 18px; border-radius: 9px; background: #e2f2e9; color: #1c6549; }
.batch-result strong { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; }
.batch-result .button { justify-self: start; margin-top: 4px; }
.upload-mark { display: grid; place-items: center; width: 68px; height: 68px; margin: 0 auto 18px; border-radius: 18px; color: #173d32; background: #dce9df; font-weight: 900; font-size: 13px; letter-spacing: .08em; }
.source-list { display: grid; gap: 8px; margin: 28px 0 0; padding: 0; list-style: none; text-align: left; }
.source-list li { display: flex; align-items: center; gap: 10px; overflow: hidden; padding: 10px 12px; border-radius: 7px; background: #f4f1e8; color: #4d5851; font-size: 13px; }
.source-list li span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.import-progress { position: sticky; top: 12px; z-index: 5; max-width: 1080px; margin-bottom: 18px; padding: 20px 24px; border-color: #becaf7; box-shadow: 0 14px 35px #1f398024; }
.import-progress-heading { display: flex; align-items: start; justify-content: space-between; gap: 18px; }
.import-progress-heading h3 { margin: 5px 0; color: #1c2d4d; font-size: 18px; letter-spacing: -.02em; }
.import-progress-heading p:not(.eyebrow) { overflow: hidden; max-width: 600px; margin: 0; color: #748199; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.import-progress-heading strong { color: #3552c4; font-size: 16px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.import-progress progress { width: 100%; height: 9px; margin: 15px 0 10px; overflow: hidden; border: 0; border-radius: 999px; accent-color: #4c65dd; }
.import-progress progress::-webkit-progress-bar { border-radius: 999px; background: #e7ecf8; }
.import-progress progress::-webkit-progress-value { border-radius: 999px; background: #4c65dd; }
.import-progress-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.import-progress-footer span { color: #77859a; font-size: 11px; }
.import-progress-footer .button { min-height: 34px; padding: 0 12px; font-size: 12px; }
.upload-card h3, .batch-company-card h3, .preparation-card h3 { font-family: Inter, ui-sans-serif, system-ui, sans-serif; letter-spacing: -.025em; }
.workflow-steps { display: flex; gap: 10px; max-width: 1080px; margin: 0 0 18px; }
.step { flex: 1; padding: 14px 16px; border: 1px solid #e0e6f0; border-radius: 10px; color: #95a1b3; background: #f9fafc; font-size: 11px; font-weight: 800; }
.step b { margin-left: 8px; font-size: 12px; font-weight: 650; }
.step.active { border-color: #bccaf9; color: #3f59c4; background: #eff3ff; }
.upload-card, .preparation-card, .registration-card { max-width: 1080px; }
.upload-card { padding: 32px; text-align: left; }
.upload-mark { width: 46px; height: 46px; margin: 0 0 14px; border-radius: 11px; color: #405acb; background: #edf1ff; font-size: 11px; }
.upload-card h3 { font-size: 21px; color: #1d2b43; }
.upload-card p { max-width: 580px; margin: 8px 0 20px; font-size: 13px; line-height: 1.5; }
.source-list { margin-top: 22px; }
.source-list li, .candidate-row { background: #f7f9fc; border: 1px solid #edf0f5; }
.preparation-card { margin-top: 18px; padding: 30px; }
.preparation-card > h3 { font-size: 20px; }
.environment-field { max-width: 340px; margin-bottom: 30px; }
.review-heading { display: flex; align-items: start; justify-content: space-between; gap: 22px; padding-top: 24px; border-top: 1px solid #e9edf3; }
.review-heading h3 { margin: 5px 0; font-size: 22px; }
.review-heading p:not(.eyebrow) { max-width: 700px; margin: 0 0 18px; color: #68778b; font-size: 13px; line-height: 1.5; }
.review-count { flex: none; padding: 8px 11px; border-radius: 999px; color: #147453; background: #e5f6ef; font-size: 12px; font-weight: 750; }
.review-count.incomplete { color: #975d11; background: #fff2db; }
.document-review-list { display: grid; gap: 8px; max-height: 430px; overflow: auto; padding-right: 3px; }
.document-review-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(250px, .8fr); gap: 20px; align-items: center; padding: 15px 18px; border: 1px solid #e8ecf3; border-radius: 10px; }
.document-review-info { display: grid; min-width: 0; gap: 4px; }
.document-review-info strong { color: #20314f; font-size: 14px; }
.document-review-info span { overflow: hidden; color: #58677e; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.document-review-info small { color: #8a96a9; font-size: 11px; }
.document-review-row .standalone-field { font-size: 11px; }
.document-review-row select { min-height: 39px; }
.company-candidates { margin-top: 18px; padding: 15px 18px; border: 1px solid #f2dbb6; border-radius: 10px; background: #fffbf3; }
.company-candidates summary { color: #80520f; font-size: 13px; font-weight: 750; }
.company-candidates .candidate-list { margin-top: 13px; }
.confirm-batch { margin-top: 18px; }
@media (max-width: 900px) {
  .document-review-row { grid-template-columns: 1fr; }
}
@media (max-width: 650px) {
  .workflow-steps { flex-direction: column; }
}
@media (max-width: 650px) {
  .review-heading { flex-direction: column; }
}
.workflow-steps { gap: 12px; margin-bottom: 20px; }
.step { min-width: 0; overflow-wrap: anywhere; }
.document-review-info strong { overflow-wrap: anywhere; }
.candidate-row > div { min-width: 0; }
.candidate-row span { overflow-wrap: anywhere; }
.source-list li span:last-child { min-width: 0; }
.standalone-field { min-width: 0; }
@media (max-width: 650px) {
  .candidate-row { align-items: flex-start; flex-direction: column; }
}
</style>
