<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { BatchCompanyCandidate, BatchPreparation, CreatedBatchSummary, SelectedSource, WorkspaceState } from '@motor/contracts'

const sources = ref<SelectedSource[]>([])
const selecting = ref(false)
const inspecting = ref(false)
const hasSources = computed(() => sources.value.length > 0)
const workspace = ref<WorkspaceState>({ companies: [] })
const selectedCompanyId = ref('')
const preparation = ref<BatchPreparation | null>(null)
const error = ref('')
const registrationCandidate = ref<BatchCompanyCandidate | null>(null)
const registrationLegalName = ref('')
const registrationTradeName = ref('')
const registrationState = ref('')
const registering = ref(false)
const creatingBatch = ref(false)
const createdBatch = ref<CreatedBatchSummary | null>(null)

async function loadWorkspace(): Promise<void> {
  workspace.value = await window.desktopApi.getWorkspace()
}

async function selectSources(): Promise<void> {
  error.value = ''
  selecting.value = true
  try {
    sources.value = await window.desktopApi.selectSources()
    preparation.value = null
    createdBatch.value = null
    if (sources.value.length > 0) {
      inspecting.value = true
      preparation.value = await window.desktopApi.inspectSources(sources.value)
    }
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Não foi possível inspecionar os arquivos.'
  } finally {
    selecting.value = false
    inspecting.value = false
  }
}

async function createBatch(): Promise<void> {
  if (!selectedCompanyId.value) return
  error.value = ''
  creatingBatch.value = true
  try {
    createdBatch.value = await window.desktopApi.createBatch({
      companyId: selectedCompanyId.value,
      sources: sources.value,
    })
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Não foi possível criar o lote.'
  } finally {
    creatingBatch.value = false
  }
}

function chooseCandidate(candidate: BatchCompanyCandidate): void {
  if (candidate.matchedCompanyId) selectedCompanyId.value = candidate.matchedCompanyId
}

function startRegistration(candidate: BatchCompanyCandidate): void {
  registrationCandidate.value = candidate
  registrationLegalName.value = candidate.legalName ?? ''
  registrationTradeName.value = ''
  registrationState.value = candidate.state ?? ''
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
    selectedCompanyId.value = company.id
    preparation.value = await window.desktopApi.inspectSources(sources.value)
    registrationCandidate.value = null
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Não foi possível cadastrar a empresa.'
  } finally {
    registering.value = false
  }
}

onMounted(() => void loadWorkspace().catch((cause) => {
  error.value = cause instanceof Error ? cause.message : 'Não foi possível carregar as empresas.'
}))
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

    <article class="card batch-company-card">
      <p class="eyebrow">Perspectiva do lote</p>
      <h3>Empresa analisada</h3>
      <label class="standalone-field">
        <span>Selecione agora ou deixe o ContabiliNico identificar pelos XMLs</span>
        <select v-model="selectedCompanyId">
          <option value="">Identificar depois dos arquivos</option>
          <option v-for="company in workspace.companies" :key="company.id" :value="company.id">
            {{ company.legalName }} — {{ company.cnpj }}
          </option>
        </select>
      </label>
    </article>

    <article class="card upload-card">
      <div class="upload-mark" aria-hidden="true">XML</div>
      <h3>{{ hasSources ? `${sources.length} arquivo(s) selecionado(s)` : 'Escolha os documentos' }}</h3>
      <p>
        A inspeção identifica CNPJs com segurança antes de criar o lote e aceita
        apenas XML e ZIP escolhidos pelo diálogo do aplicativo.
      </p>
      <button class="button primary" type="button" :disabled="selecting || inspecting" @click="selectSources">
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

      <div v-if="!selectedCompanyId" class="candidate-list">
        <p>Confirme qual CNPJ representa a empresa analisada neste lote.</p>
        <div v-for="candidate in preparation.candidates" :key="candidate.cnpj" class="candidate-row">
          <div>
            <strong>{{ candidate.legalName || candidate.cnpj }}</strong>
            <span>{{ candidate.cnpj }} · {{ candidate.state || 'UF não informada' }} · {{ candidate.documentCount }} nota(s)</span>
          </div>
          <button
            v-if="candidate.matchedCompanyId"
            class="button secondary"
            type="button"
            @click="chooseCandidate(candidate)"
          >
            Escolher empresa
          </button>
          <button v-else class="button secondary" type="button" @click="startRegistration(candidate)">
            Cadastrar este CNPJ
          </button>
        </div>
      </div>

      <p v-else class="form-success">
        Empresa definida. Confirme para inventariar e persistir o lote.
      </p>

      <button
        v-if="selectedCompanyId && !createdBatch"
        class="button primary confirm-batch"
        type="button"
        :disabled="creatingBatch"
        @click="createBatch"
      >
        {{ creatingBatch ? 'Criando lote…' : 'Confirmar e criar lote' }}
      </button>

      <div v-if="createdBatch" class="batch-result">
        <p class="eyebrow">Lote criado</p>
        <strong>{{ createdBatch.id }}</strong>
        <span>{{ createdBatch.totalFiles }} arquivo(s) · {{ createdBatch.totalDocuments }} nota(s) · {{ createdBatch.totalPendencies }} pendência(s)</span>
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

    <article v-if="registrationCandidate" class="card form-card registration-card">
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
          {{ registering ? 'Cadastrando…' : 'Cadastrar e escolher' }}
        </button>
      </form>
    </article>
  </section>
</template>
