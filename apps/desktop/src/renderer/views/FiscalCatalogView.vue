<script setup lang="ts">
import { RendererErrorMessage } from '../error-messages'
import { computed, onMounted, ref, watch } from 'vue'
import type { FiscalProfileSummary, FiscalProfileSuggestion, SupplierProductSummary, WorkspaceState } from '@motor/contracts'

const workspace = ref<WorkspaceState>({ companies: [] })
const companyId = ref('')
const profiles = ref<readonly FiscalProfileSummary[]>([])
const suggestions = ref<readonly FiscalProfileSuggestion[]>([])
const showAllSuggestions = ref(false)
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
const editingProfileId = ref('')
const editProfileRevision = ref(0)
const editProfileName = ref('')
const editProfileFrom = ref('')
const editProfileUntil = ref('')
const editingProductId = ref('')
const editProductRevision = ref(0)
const editProductProfileId = ref('')

const selectedCompany = computed(() => workspace.value.companies.find((company) => company.id === companyId.value))
const activeProfiles = computed(() => profiles.value.filter((profile) => profile.active))
const visibleSuggestions = computed(() => showAllSuggestions.value ? suggestions.value : suggestions.value.slice(0, 10))
const profileNames = computed(() => new Map(profiles.value.map((profile) => [profile.id, profile.name])))

function displayDate(value: string): string {
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : RendererErrorMessage.OPERATION_FAILED
}

async function loadCatalog(): Promise<void> {
  if (!companyId.value) {
    profiles.value = []
    products.value = []
    suggestions.value = []
    return
  }
  const selected = companyId.value
  const [loadedProfiles, loadedProducts, loadedSuggestions] = await Promise.all([
    window.desktopApi.listFiscalProfiles(selected),
    window.desktopApi.listSupplierProducts(selected),
    selectedCompany.value?.active ? window.desktopApi.listFiscalProfileSuggestions(selected) : Promise.resolve([]),
  ])
  if (companyId.value === selected) {
    profiles.value = loadedProfiles
    products.value = loadedProducts
    suggestions.value = loadedSuggestions
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

async function createSuggestedProfile(suggestion: FiscalProfileSuggestion): Promise<void> {
  error.value = ''
  success.value = ''
  busy.value = true
  try {
    const result = await window.desktopApi.createSuggestedFiscalProfile({
      companyId: companyId.value, suggestionKey: suggestion.key,
    })
    selectedProfileId.value = result.profile.id
    await loadCatalog()
    success.value = `Perfil ${result.profile.name} criado e ${result.linkedProducts} produto(s) vinculado(s).`
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
    const existing = products.value.find((product) =>
      product.supplierCnpj === supplierCnpj.value.replace(/\D/g, '')
      && product.productCode === productCode.value.trim())
    await window.desktopApi.saveSupplierProduct({
      companyId: companyId.value,
      supplierCnpj: supplierCnpj.value,
      productCode: productCode.value,
      profileId: selectedProfileId.value,
      ...(existing ? { expectedRevision: existing.revision } : {}),
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

function startProfileEdit(profile: FiscalProfileSummary): void {
  editingProfileId.value = profile.id
  editProfileRevision.value = profile.revision
  editProfileName.value = profile.name
  editProfileFrom.value = profile.validFrom
  editProfileUntil.value = profile.validUntil ?? ''
  error.value = ''
}

async function saveProfileEdit(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    await window.desktopApi.updateFiscalProfile({
      id: editingProfileId.value, expectedRevision: editProfileRevision.value,
      name: editProfileName.value, validFrom: editProfileFrom.value,
      validUntil: editProfileUntil.value,
    })
    editingProfileId.value = ''
    await loadCatalog()
    success.value = 'Perfil atualizado. A classificação cadastral atual pode mudar; as avaliações históricas permanecem salvas.'
  } catch (cause) { error.value = message(cause) }
  finally { busy.value = false }
}

async function changeProfileStatus(profile: FiscalProfileSummary): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    const input = { id: profile.id, expectedRevision: profile.revision }
    if (profile.active) await window.desktopApi.inactivateFiscalProfile(input)
    else await window.desktopApi.reactivateFiscalProfile(input)
    await loadCatalog()
    success.value = profile.active ? 'Perfil inativado.' : 'Perfil reativado.'
  } catch (cause) { error.value = message(cause) }
  finally { busy.value = false }
}

function startProductEdit(product: SupplierProductSummary): void {
  editingProductId.value = product.id
  editProductRevision.value = product.revision
  editProductProfileId.value = product.profileId
  error.value = ''
}

async function saveProductEdit(): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    await window.desktopApi.updateSupplierProduct({
      id: editingProductId.value, expectedRevision: editProductRevision.value,
      profileId: editProductProfileId.value,
    })
    editingProductId.value = ''
    await loadCatalog()
    success.value = 'Vínculo atualizado. A classificação cadastral atual pode mudar.'
  } catch (cause) { error.value = message(cause) }
  finally { busy.value = false }
}

async function changeProductStatus(product: SupplierProductSummary): Promise<void> {
  busy.value = true
  error.value = ''
  try {
    const input = { id: product.id, expectedRevision: product.revision }
    if (product.active) await window.desktopApi.inactivateSupplierProduct(input)
    else await window.desktopApi.reactivateSupplierProduct(input)
    await loadCatalog()
    success.value = product.active ? 'Produto inativado.' : 'Produto reativado.'
  } catch (cause) { error.value = message(cause) }
  finally { busy.value = false }
}

watch(companyId, () => {
  error.value = ''
  success.value = ''
  selectedProfileId.value = ''
  editingProfileId.value = ''
  editingProductId.value = ''
  showAllSuggestions.value = false
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
        <p>O sistema sugere agrupamentos com dados das notas importadas. Revise antes de criar um perfil; esta etapa não calcula impostos.</p>
      </div>
      <div v-if="companyId" class="catalog-summary" aria-label="Resumo dos cadastros">
        <div><strong>{{ profiles.length }}</strong><span>perfis</span></div>
        <div><strong>{{ products.length }}</strong><span>produtos vinculados</span></div>
      </div>
    </header>

    <p v-if="error" class="form-error catalog-message" role="alert">{{ error }}
      <button v-if="error.includes('Recarregue os dados')" class="button secondary" type="button" @click="loadCatalog">Recarregar dados</button>
    </p>
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
          <option value="" disabled>Escolha uma empresa</option>
          <option v-for="company in workspace.companies" :key="company.id" :value="company.id">
            {{ company.legalName }} · {{ company.cnpj }}{{ company.active ? '' : ' · inativa' }}
          </option>
        </select>
      </label>
    </section>

    <p v-if="!workspace.companies.length" class="empty-state no-company">Cadastre uma empresa ativa para começar a organizar os perfis fiscais.</p>

    <template v-if="companyId">
      <div class="context-line">
        <span class="context-dot" aria-hidden="true"></span>
        <span>Trabalhando em <strong>{{ selectedCompany?.legalName }}</strong></span>
        <small>{{ selectedCompany?.cnpj }} · {{ selectedCompany?.active ? 'ativa' : 'inativa' }}</small>
      </div>

      <section v-if="selectedCompany?.active" class="card suggestion-panel" aria-labelledby="suggestion-title">
        <header class="records-heading">
          <div>
            <p class="eyebrow">A partir das notas importadas</p>
            <h3 id="suggestion-title">Sugestões de perfis</h3>
          </div>
          <span class="count-badge">{{ suggestions.length }}</span>
        </header>
        <p class="field-hint">Produtos ainda sem vínculo são agrupados quando NCM, CEST e origem informados nos XMLs são consistentes. Isso não confirma tratamento tributário. Confira a proposta antes de criar e vincular.</p>
        <p v-if="!suggestions.length" class="records-empty">Nenhum grupo consistente de produtos sem vínculo foi encontrado nas notas desta empresa.</p>
        <ul v-else class="suggestion-list">
          <li v-for="suggestion in visibleSuggestions" :key="suggestion.key" class="suggestion-row">
            <div class="suggestion-copy">
              <strong>{{ suggestion.name }}</strong>
              <span>{{ suggestion.products.length }} produto(s) · {{ suggestion.documentCount }} nota(s) · desde {{ displayDate(suggestion.validFrom) }}</span>
              <details>
                <summary>Conferir produtos</summary>
                <ul><li v-for="product in suggestion.products" :key="`${product.supplierCnpj}:${product.productCode}`">{{ product.productCode }} · {{ product.supplierCnpj }}<span v-if="product.description"> · {{ product.description }}</span></li></ul>
              </details>
            </div>
            <button class="button secondary" type="button" :disabled="busy" @click="createSuggestedProfile(suggestion)">Criar perfil e vincular</button>
          </li>
        </ul>
        <button v-if="suggestions.length > 10" class="button secondary" type="button" @click="showAllSuggestions = !showAllSuggestions">{{ showAllSuggestions ? 'Mostrar menos' : `Mostrar todas (${suggestions.length})` }}</button>
      </section>

      <div v-if="selectedCompany?.active" class="editor-grid">
        <article class="editor-card card">
          <div class="editor-heading">
            <span class="step-number" aria-hidden="true">02</span>
            <div>
              <p class="eyebrow">Classificação</p>
              <h3>Criar perfil manualmente</h3>
              <p>Use este formulário se nenhuma sugestão representar o agrupamento desejado.</p>
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
                <option v-for="profile in activeProfiles" :key="profile.id" :value="profile.id">{{ profile.name }}</option>
              </select>
            </label>
            <button class="button primary" type="submit" :disabled="busy || !activeProfiles.length">Salvar vínculo</button>
            <p v-if="!activeProfiles.length" class="field-hint">Cadastre um perfil antes de vincular produtos.</p>
          </form>
        </article>
      </div>

      <div class="records-grid">
        <section class="records-panel card" aria-labelledby="profiles-title">
          <header class="records-heading">
            <div><p class="eyebrow">Biblioteca da empresa</p><h3 id="profiles-title">Perfis cadastrados</h3></div>
            <span class="count-badge">{{ profiles.length }}</span>
          </header>
          <p v-if="!profiles.length" class="records-empty">Nenhum perfil cadastrado. Confirme uma sugestão ou use o formulário manual.</p>
          <ul v-else class="record-list">
            <li v-for="profile in profiles" :key="profile.id" class="profile-row lifecycle-row">
              <span class="record-mark" aria-hidden="true">P</span>
              <div class="record-main"><strong>{{ profile.name }}</strong><span>{{ profile.active ? 'Ativo' : 'Inativo' }} · Vigência: {{ displayDate(profile.validFrom) }} até {{ profile.validUntil ? displayDate(profile.validUntil) : 'sem data final' }}</span></div>
              <div class="record-actions">
                <button class="button secondary" type="button" :disabled="busy" @click="startProfileEdit(profile)">Editar</button>
                <button class="button secondary" type="button" :disabled="busy || (!profile.active && !selectedCompany?.active)" @click="changeProfileStatus(profile)">{{ profile.active ? 'Inativar' : 'Reativar' }}</button>
              </div>
              <form v-if="editingProfileId === profile.id" class="lifecycle-form" @submit.prevent="saveProfileEdit">
                <label><span>Nome</span><input v-model="editProfileName" required /></label>
                <label><span>Vigente desde</span><input v-model="editProfileFrom" type="date" required /></label>
                <label><span>Vigente até</span><input v-model="editProfileUntil" type="date" /></label>
                <button class="button primary" type="submit" :disabled="busy">Salvar</button>
                <button class="button secondary" type="button" @click="editingProfileId = ''">Cancelar</button>
              </form>
            </li>
          </ul>
        </section>

        <section class="records-panel card" aria-labelledby="products-title">
          <header class="records-heading">
            <div><p class="eyebrow">Catálogo da empresa</p><h3 id="products-title">Produtos vinculados</h3></div>
            <span class="count-badge">{{ products.length }}</span>
          </header>
          <p v-if="!products.length" class="records-empty">Nenhum produto vinculado. Use o formulário acima para criar o primeiro vínculo.</p>
          <ul v-else class="record-list">
            <li v-for="product in products" :key="product.id" class="product-row lifecycle-row">
              <span class="record-mark product-mark" aria-hidden="true">#</span>
              <div class="record-main"><strong>{{ product.productCode }}</strong><span>Fornecedor {{ product.supplierCnpj }} · {{ product.active ? 'Ativo' : 'Inativo' }}</span></div>
              <span class="profile-chip">{{ profileNames.get(product.profileId) || 'Perfil não encontrado' }}</span>
              <div class="record-actions">
                <button class="button secondary" type="button" :disabled="busy || !product.active || !selectedCompany?.active" @click="startProductEdit(product)">Editar</button>
                <button class="button secondary" type="button" :disabled="busy || (!product.active && (!selectedCompany?.active || !profiles.find((profile) => profile.id === product.profileId)?.active))" @click="changeProductStatus(product)">{{ product.active ? 'Inativar' : 'Reativar' }}</button>
              </div>
              <form v-if="editingProductId === product.id" class="lifecycle-form" @submit.prevent="saveProductEdit">
                <label><span>Perfil fiscal</span><select v-model="editProductProfileId" required><option v-for="profile in activeProfiles" :key="profile.id" :value="profile.id">{{ profile.name }}</option></select></label>
                <button class="button primary" type="submit" :disabled="busy">Salvar</button>
                <button class="button secondary" type="button" @click="editingProductId = ''">Cancelar</button>
              </form>
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

.suggestion-panel { margin-bottom: 22px; padding: 22px; }
.suggestion-panel > .field-hint { margin: 10px 0 16px; max-width: 780px; }
.suggestion-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
.suggestion-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 18px; padding: 14px; border: 1px solid #e0e7f2; border-radius: 10px; }
.suggestion-copy { display: grid; gap: 5px; min-width: 0; overflow-wrap: anywhere; }
.suggestion-copy > span { color: #68778b; font-size: 12px; }
.suggestion-copy details { font-size: 12px; }
.suggestion-copy details ul { margin: 7px 0 0; padding-left: 18px; }
.suggestion-row .button { flex: none; }
@media (max-width: 680px) { .suggestion-row { flex-direction: column; } }
.lifecycle-row { flex-wrap: wrap; }
.record-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.record-actions .button { padding: 7px 9px; font-size: 11px; }
.lifecycle-form { display: flex; flex-wrap: wrap; align-items: end; gap: 9px; width: 100%; padding-top: 12px; border-top: 1px solid #edf1f6; }
.lifecycle-form label { display: grid; gap: 4px; flex: 1; min-width: 125px; }
.lifecycle-form label span { font-size: 11px; }
</style>
