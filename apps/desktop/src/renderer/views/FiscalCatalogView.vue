<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { FiscalProfileSummary, SupplierProductSummary, WorkspaceState } from '@motor/contracts'

const workspace = ref<WorkspaceState>({ companies: [] })
const companyId = ref('')
const profiles = ref<readonly FiscalProfileSummary[]>([])
const products = ref<readonly SupplierProductSummary[]>([])
const name = ref('')
const validFrom = ref(new Date().toISOString().slice(0, 10))
const validUntil = ref('')
const supplierCnpj = ref('')
const productCode = ref('')
const selectedProfileId = ref('')
const busy = ref(false)
const error = ref('')
const success = ref('')

const activeCompanies = computed(() => workspace.value.companies.filter((company) => company.active))
const selectedCompany = computed(() => activeCompanies.value.find((company) => company.id === companyId.value))
const profileNames = computed(() => new Map(profiles.value.map((profile) => [profile.id, profile.name])))

function displayDate(value: string): string {
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Não foi possível concluir a operação.'
}

async function loadCatalog(): Promise<void> {
  if (!companyId.value) {
    profiles.value = []
    products.value = []
    return
  }
  const selected = companyId.value
  const [loadedProfiles, loadedProducts] = await Promise.all([
    window.desktopApi.listFiscalProfiles(selected),
    window.desktopApi.listSupplierProducts(selected),
  ])
  if (companyId.value === selected) {
    profiles.value = loadedProfiles
    products.value = loadedProducts
  }
}

async function createProfile(): Promise<void> {
  error.value = ''
  success.value = ''
  busy.value = true
  try {
    const created = await window.desktopApi.createFiscalProfile({
      companyId: companyId.value,
      name: name.value,
      validFrom: validFrom.value,
      ...(validUntil.value ? { validUntil: validUntil.value } : {}),
    })
    name.value = ''
    selectedProfileId.value = created.id
    await loadCatalog()
    success.value = `Perfil ${created.name} cadastrado.`
  } catch (cause) {
    error.value = message(cause)
  } finally {
    busy.value = false
  }
}

async function saveProduct(): Promise<void> {
  error.value = ''
  success.value = ''
  busy.value = true
  try {
    await window.desktopApi.saveSupplierProduct({
      companyId: companyId.value,
      supplierCnpj: supplierCnpj.value,
      productCode: productCode.value,
      profileId: selectedProfileId.value,
    })
    supplierCnpj.value = ''
    productCode.value = ''
    await loadCatalog()
    success.value = 'Produto do fornecedor vinculado ao perfil.'
  } catch (cause) {
    error.value = message(cause)
  } finally {
    busy.value = false
  }
}

watch(companyId, () => {
  error.value = ''
  success.value = ''
  selectedProfileId.value = ''
  void loadCatalog().catch((cause) => { error.value = message(cause) })
})

onMounted(async () => {
  try {
    workspace.value = await window.desktopApi.getWorkspace()
    companyId.value = workspace.value.companies.find((company) => company.active)?.id ?? ''
  } catch (cause) {
    error.value = message(cause)
  }
})
</script>

<template>
  <section class="fiscal-catalog">
    <header class="catalog-header">
      <div>
        <p class="eyebrow">Cadastros fiscais</p>
        <h2>Perfis fiscais</h2>
        <p>Defina classificações por empresa e associe os produtos dos fornecedores. Esta etapa organiza os cadastros, sem calcular impostos.</p>
      </div>
      <div v-if="companyId" class="catalog-summary" aria-label="Resumo dos cadastros">
        <div><strong>{{ profiles.length }}</strong><span>perfis</span></div>
        <div><strong>{{ products.length }}</strong><span>produtos vinculados</span></div>
      </div>
    </header>

    <p v-if="error" class="form-error catalog-message" role="alert">{{ error }}</p>
    <p v-if="success" class="form-success catalog-message" role="status">{{ success }}</p>

    <section class="company-panel card" aria-labelledby="company-title">
      <div class="company-panel-copy">
        <span class="section-icon" aria-hidden="true">01</span>
        <div>
          <p class="eyebrow">Contexto do cadastro</p>
          <h3 id="company-title">Empresa analisada</h3>
          <p>Perfis e produtos são separados por empresa.</p>
        </div>
      </div>
      <label class="company-picker" for="catalog-company">
        <span>Selecione a empresa</span>
        <select id="catalog-company" v-model="companyId">
          <option value="" disabled>Escolha uma empresa ativa</option>
          <option v-for="company in activeCompanies" :key="company.id" :value="company.id">
            {{ company.legalName }} · {{ company.cnpj }}
          </option>
        </select>
      </label>
    </section>

    <p v-if="!activeCompanies.length" class="empty-state no-company">Cadastre uma empresa ativa para começar a organizar os perfis fiscais.</p>

    <template v-if="companyId">
      <div class="context-line">
        <span class="context-dot" aria-hidden="true"></span>
        <span>Trabalhando em <strong>{{ selectedCompany?.legalName }}</strong></span>
        <small>{{ selectedCompany?.cnpj }}</small>
      </div>

      <div class="editor-grid">
        <article class="editor-card card">
          <div class="editor-heading">
            <span class="step-number" aria-hidden="true">02</span>
            <div>
              <p class="eyebrow">Classificação</p>
              <h3>Criar perfil fiscal</h3>
              <p>Nomeie o perfil e defina quando ele é válido.</p>
            </div>
          </div>
          <form class="catalog-form" @submit.prevent="createProfile">
            <label class="full-field"><span>Nome do perfil</span><input v-model="name" maxlength="160" required placeholder="Ex.: Mercadorias para revenda" /></label>
            <div class="date-fields">
              <label><span>Vigente desde</span><input v-model="validFrom" type="date" required /></label>
              <label><span>Vigente até <small>opcional</small></span><input v-model="validUntil" type="date" /></label>
            </div>
            <button class="button primary" type="submit" :disabled="busy">Cadastrar perfil</button>
          </form>
        </article>

        <article class="editor-card card">
          <div class="editor-heading">
            <span class="step-number" aria-hidden="true">03</span>
            <div>
              <p class="eyebrow">Associação</p>
              <h3>Vincular produto</h3>
              <p>Use os dados do fornecedor que constam no XML.</p>
            </div>
          </div>
          <form class="catalog-form" @submit.prevent="saveProduct">
            <div class="product-fields">
              <label><span>CNPJ do fornecedor</span><input v-model="supplierCnpj" inputmode="numeric" required placeholder="00.000.000/0000-00" /></label>
              <label><span>Código do produto</span><input v-model="productCode" required placeholder="Código no XML" /></label>
            </div>
            <label><span>Perfil fiscal</span>
              <select v-model="selectedProfileId" required>
                <option value="" disabled>Selecione um perfil</option>
                <option v-for="profile in profiles" :key="profile.id" :value="profile.id">{{ profile.name }}</option>
              </select>
            </label>
            <button class="button primary" type="submit" :disabled="busy || !profiles.length">Salvar vínculo</button>
            <p v-if="!profiles.length" class="field-hint">Cadastre um perfil antes de vincular produtos.</p>
          </form>
        </article>
      </div>

      <div class="records-grid">
        <section class="records-panel card" aria-labelledby="profiles-title">
          <header class="records-heading">
            <div><p class="eyebrow">Biblioteca da empresa</p><h3 id="profiles-title">Perfis cadastrados</h3></div>
            <span class="count-badge">{{ profiles.length }}</span>
          </header>
          <p v-if="!profiles.length" class="records-empty">Nenhum perfil cadastrado. Comece pelo formulário acima.</p>
          <ul v-else class="record-list">
            <li v-for="profile in profiles" :key="profile.id" class="profile-row">
              <span class="record-mark" aria-hidden="true">P</span>
              <div class="record-main"><strong>{{ profile.name }}</strong><span>Vigência: {{ displayDate(profile.validFrom) }} até {{ profile.validUntil ? displayDate(profile.validUntil) : 'sem data final' }}</span></div>
            </li>
          </ul>
        </section>

        <section class="records-panel card" aria-labelledby="products-title">
          <header class="records-heading">
            <div><p class="eyebrow">Relações ativas</p><h3 id="products-title">Produtos vinculados</h3></div>
            <span class="count-badge">{{ products.length }}</span>
          </header>
          <p v-if="!products.length" class="records-empty">Nenhum produto vinculado. Use o formulário acima para criar o primeiro vínculo.</p>
          <ul v-else class="record-list">
            <li v-for="product in products" :key="product.id" class="product-row">
              <span class="record-mark product-mark" aria-hidden="true">#</span>
              <div class="record-main"><strong>{{ product.productCode }}</strong><span>Fornecedor {{ product.supplierCnpj }}</span></div>
              <span class="profile-chip">{{ profileNames.get(product.profileId) || 'Perfil não encontrado' }}</span>
            </li>
          </ul>
        </section>
      </div>
    </template>
  </section>
</template>

<style scoped>
.fiscal-catalog { min-width: 0; }
.catalog-header { display: flex; align-items: end; justify-content: space-between; gap: 24px; margin-bottom: 28px; }
.catalog-header > div:first-child { min-width: 0; }
.catalog-header h2 { margin: 8px 0 10px; color: #142238; font-size: clamp(30px, 3vw, 43px); line-height: 1.1; letter-spacing: -.045em; }
.catalog-header > div:first-child > p:last-child { max-width: 710px; margin: 0; color: #68778b; font-size: 14px; line-height: 1.6; }
.catalog-summary { display: flex; flex: none; gap: 20px; padding: 14px 20px; border: 1px solid #e0e7f2; border-radius: 12px; background: #fff; }
.catalog-summary div { display: grid; gap: 3px; min-width: 76px; }
.catalog-summary strong { color: #243b70; font-size: 22px; line-height: 1; }
.catalog-summary span { color: #7a879b; font-size: 11px; }
.catalog-message { margin-bottom: 18px; }
.company-panel { display: grid; grid-template-columns: minmax(0, 1fr) minmax(280px, 420px); align-items: center; gap: 24px; padding: 24px 28px; }
.company-panel-copy, .editor-heading { display: flex; align-items: flex-start; gap: 15px; min-width: 0; }
.section-icon, .step-number { display: grid; flex: none; place-items: center; width: 39px; height: 39px; border-radius: 11px; color: #435dd1; background: #edf1ff; font-size: 12px; font-weight: 800; }
.company-panel h3, .editor-heading h3, .records-heading h3 { margin: 5px 0; color: #1c2c47; font-size: 19px; line-height: 1.25; letter-spacing: -.025em; }
.company-panel-copy p:last-child, .editor-heading p:last-child { margin: 0; color: #738198; font-size: 12px; line-height: 1.5; }
.company-picker, .catalog-form label { display: grid; gap: 7px; min-width: 0; color: #465674; font-size: 12px; font-weight: 700; }
.company-picker select, .catalog-form input, .catalog-form select { min-width: 0; border-color: #d9e1ef; background: #fff; }
.company-picker select:focus, .catalog-form input:focus, .catalog-form select:focus { border-color: #6179e5; outline-color: #455fdb26; }
.no-company { margin-top: 18px; }
.context-line { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; margin: 22px 2px 15px; color: #68778b; font-size: 12px; }
.context-line strong { color: #253b61; }
.context-line small { margin-left: 5px; color: #8996a9; font-size: 11px; }
.context-dot { width: 7px; height: 7px; border-radius: 50%; background: #43bf91; }
.editor-grid, .records-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; align-items: stretch; }
.editor-card { display: flex; flex-direction: column; gap: 24px; min-width: 0; padding: 27px; }
.catalog-form { display: grid; gap: 17px; flex: 1; align-content: start; }
.catalog-form label > span { display: flex; justify-content: space-between; gap: 10px; }
.catalog-form label small { color: #96a2b3; font-size: 11px; font-weight: 500; }
.date-fields, .product-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.catalog-form .button { justify-self: start; margin-top: auto; }
.field-hint { margin: -9px 0 0; color: #8491a3; font-size: 11px; }
.records-grid { margin-top: 22px; }
.records-panel { min-width: 0; padding: 0; }
.records-heading { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 22px 25px; border-bottom: 1px solid #e8edf5; }
.records-heading h3 { margin-bottom: 0; }
.count-badge { display: grid; flex: none; place-items: center; min-width: 30px; height: 30px; padding: 0 8px; border-radius: 8px; color: #425bc5; background: #edf1ff; font-size: 12px; font-weight: 800; }
.records-empty { margin: 0; padding: 28px 25px; color: #8190a5; font-size: 13px; line-height: 1.5; }
.record-list { margin: 0; padding: 0; list-style: none; }
.record-list li { display: flex; align-items: center; gap: 13px; min-width: 0; padding: 15px 25px; border-bottom: 1px solid #edf1f6; }
.record-list li:last-child { border-bottom: 0; }
.record-mark { display: grid; flex: none; place-items: center; width: 32px; height: 32px; border-radius: 9px; color: #5470d7; background: #f0f3ff; font-size: 12px; font-weight: 800; }
.product-mark { color: #13866b; background: #e9f7f2; }
.record-main { display: grid; gap: 4px; min-width: 0; flex: 1; }
.record-main strong { color: #253650; font-size: 13px; overflow-wrap: anywhere; }
.record-main span { color: #8895a7; font-size: 11px; overflow-wrap: anywhere; }
.profile-chip { max-width: 45%; padding: 6px 9px; border-radius: 7px; color: #4a5fbd; background: #f0f3ff; font-size: 11px; font-weight: 700; text-align: right; overflow-wrap: anywhere; }
@media (max-width: 1100px) {
  .catalog-header { align-items: flex-start; flex-direction: column; }
  .company-panel { grid-template-columns: 1fr; }
  .editor-grid, .records-grid { grid-template-columns: 1fr; }
}
@media (max-width: 650px) {
  .company-panel, .editor-card { padding: 20px; }
  .catalog-summary { width: 100%; justify-content: space-around; }
  .date-fields, .product-fields { grid-template-columns: 1fr; }
  .records-heading { padding: 19px 20px; }
  .record-list li { padding: 15px 20px; }
  .product-row { align-items: flex-start; flex-wrap: wrap; }
  .product-row .profile-chip { max-width: 100%; margin-left: 45px; text-align: left; }
}
</style>
