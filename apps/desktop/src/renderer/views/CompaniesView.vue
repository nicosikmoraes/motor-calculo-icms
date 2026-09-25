<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { CompanySummary, WorkspaceState } from '@motor/contracts'

const workspace = ref<WorkspaceState>({ companies: [] })
const officeName = ref('')
const legalName = ref('')
const tradeName = ref('')
const cnpj = ref('')
const state = ref('')
const savingCompany = ref(false)
const savingOffice = ref(false)
const error = ref('')
const success = ref('')

const states = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
]

async function load(): Promise<void> {
  workspace.value = await window.desktopApi.getWorkspace()
  officeName.value = workspace.value.organization?.name ?? ''
}

function message(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback
}

async function saveOffice(): Promise<void> {
  error.value = ''
  success.value = ''
  savingOffice.value = true
  try {
    await window.desktopApi.renameOrganization({ name: officeName.value })
    await load()
    success.value = 'Nome do escritório atualizado.'
  } catch (cause) {
    error.value = message(cause, 'Não foi possível atualizar o escritório.')
  } finally {
    savingOffice.value = false
  }
}

async function createCompany(): Promise<void> {
  error.value = ''
  success.value = ''
  savingCompany.value = true
  try {
    const created: CompanySummary = await window.desktopApi.createCompany({
      legalName: legalName.value,
      ...(tradeName.value.trim() ? { tradeName: tradeName.value } : {}),
      cnpj: cnpj.value,
      state: state.value,
    })
    legalName.value = ''
    tradeName.value = ''
    cnpj.value = ''
    state.value = ''
    await load()
    success.value = `${created.legalName} foi cadastrada.`
  } catch (cause) {
    error.value = message(cause, 'Não foi possível cadastrar a empresa.')
  } finally {
    savingCompany.value = false
  }
}

onMounted(() => void load().catch((cause) => {
  error.value = message(cause, 'Não foi possível carregar os cadastros.')
}))
</script>

<template>
  <section>
    <header class="page-header compact">
      <div>
        <p class="eyebrow">Cadastros</p>
        <h2>Empresas</h2>
        <p class="lead">Mantenha as empresas que podem ser escolhidas na importação.</p>
      </div>
    </header>

    <p v-if="error" class="form-error notice" role="alert">{{ error }}</p>
    <p v-if="success" class="form-success notice" role="status">{{ success }}</p>

    <div class="settings-grid">
      <article class="card form-card">
        <p class="eyebrow">Instalação local</p>
        <h3>Escritório responsável</h3>
        <form class="form-stack" @submit.prevent="saveOffice">
          <label>
            <span>Nome</span>
            <input v-model="officeName" maxlength="160" required />
          </label>
          <button class="button secondary" type="submit" :disabled="savingOffice || !officeName.trim()">
            {{ savingOffice ? 'Salvando…' : 'Salvar nome' }}
          </button>
        </form>
      </article>

      <article class="card form-card">
        <p class="eyebrow">Nova empresa</p>
        <h3>Cadastro mínimo</h3>
        <form class="form-grid" @submit.prevent="createCompany">
          <label class="field-wide">
            <span>Razão social</span>
            <input v-model="legalName" maxlength="200" required />
          </label>
          <label class="field-wide">
            <span>Nome fantasia <small>opcional</small></span>
            <input v-model="tradeName" maxlength="200" />
          </label>
          <label>
            <span>CNPJ</span>
            <input v-model="cnpj" inputmode="numeric" placeholder="00.000.000/0000-00" required />
          </label>
          <label>
            <span>UF</span>
            <select v-model="state" required>
              <option value="" disabled>Selecione</option>
              <option v-for="item in states" :key="item" :value="item">{{ item }}</option>
            </select>
          </label>
          <button class="button primary field-wide" type="submit" :disabled="savingCompany">
            {{ savingCompany ? 'Cadastrando…' : 'Cadastrar empresa' }}
          </button>
        </form>
      </article>
    </div>

    <article class="card company-list-card">
      <div class="section-heading">
        <div>
          <p class="eyebrow">Empresas cadastradas</p>
          <h3>{{ workspace.companies.length }} empresa(s)</h3>
        </div>
      </div>
      <p v-if="workspace.companies.length === 0" class="empty-state">
        Nenhuma empresa cadastrada. O primeiro cadastro permitirá associar um lote.
      </p>
      <ul v-else class="company-list">
        <li v-for="company in workspace.companies" :key="company.id">
          <div>
            <strong>{{ company.legalName }}</strong>
            <span v-if="company.tradeName">{{ company.tradeName }}</span>
          </div>
          <div class="company-meta">
            <span>{{ company.cnpj }}</span>
            <span class="tag">{{ company.state }}</span>
          </div>
        </li>
      </ul>
    </article>
  </section>
</template>

<style scoped>
.company-list-card h3 { margin: 8px 0 22px; font: 700 24px Georgia, serif; }
.company-list-card { margin-top: 22px; padding: 28px; }
.section-heading { display: flex; align-items: center; justify-content: space-between; }
.company-list { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; }
.company-list li { display: flex; align-items: center; justify-content: space-between; gap: 24px; padding: 16px 4px; border-top: 1px solid #e4dfd4; }
.company-list li:first-child { border-top: 0; }
.company-list li > div:first-child { display: grid; gap: 4px; }
.company-list strong { color: #26342d; }
.company-list li > div:first-child span { color: #6d7771; font-size: 13px; }
.company-meta { display: flex; align-items: center; gap: 12px; color: #56615a; font-variant-numeric: tabular-nums; }
.company-list-card h3 { font-family: Inter, ui-sans-serif, system-ui, sans-serif; letter-spacing: -.025em; }
.company-list li { border-bottom-color: #e8edf4; }
.company-list li > div:first-child { min-width: 0; }
.company-list strong, .company-list li > div:first-child span { overflow-wrap: anywhere; }
.company-meta { flex-wrap: wrap; }
.company-list li { align-items: flex-start; }
.settings-grid + .company-list-card { margin-top: 24px; }
@media (max-width: 650px) {
  .company-list li { align-items: flex-start; flex-direction: column; }
}
</style>
