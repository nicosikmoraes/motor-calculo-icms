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
