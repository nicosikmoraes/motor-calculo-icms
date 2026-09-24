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

const profileNames = computed(() => new Map(profiles.value.map((profile) => [profile.id, profile.name])))

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
  <section>
    <header class="page-header compact">
      <div>
        <p class="eyebrow">Cadastros</p>
        <h2>Perfis fiscais e produtos</h2>
        <p class="lead">Organize a classificação dos itens por empresa. Nenhum cálculo de imposto é feito nesta etapa.</p>
      </div>
    </header>

    <p v-if="error" class="form-error notice" role="alert">{{ error }}</p>
    <p v-if="success" class="form-success notice" role="status">{{ success }}</p>

    <article class="card form-card">
      <label class="form-stack">
        <span>Empresa analisada</span>
        <select v-model="companyId">
          <option value="" disabled>Selecione a empresa</option>
          <option v-for="company in workspace.companies.filter((entry) => entry.active)" :key="company.id" :value="company.id">
            {{ company.legalName }} · {{ company.cnpj }}
          </option>
        </select>
      </label>
    </article>

    <div v-if="companyId" class="settings-grid">
      <article class="card form-card">
        <p class="eyebrow">Novo perfil</p>
        <h3>Perfil fiscal</h3>
        <p>Nomeie uma classificação e indique o período em que ela vale.</p>
        <form class="form-grid" @submit.prevent="createProfile">
          <label class="field-wide"><span>Nome do perfil</span><input v-model="name" maxlength="160" required placeholder="Ex.: Mercadorias para revenda" /></label>
          <label><span>Vigente desde</span><input v-model="validFrom" type="date" required /></label>
          <label><span>Vigente até <small>opcional</small></span><input v-model="validUntil" type="date" /></label>
          <button class="button primary field-wide" type="submit" :disabled="busy">Cadastrar perfil</button>
        </form>
      </article>

      <article class="card form-card">
        <p class="eyebrow">Vínculo manual</p>
        <h3>Produto de fornecedor</h3>
        <p>Use o CNPJ do emitente e o código do produto informado no XML.</p>
        <form class="form-grid" @submit.prevent="saveProduct">
          <label><span>CNPJ do fornecedor</span><input v-model="supplierCnpj" inputmode="numeric" required /></label>
          <label><span>Código do produto</span><input v-model="productCode" required /></label>
          <label class="field-wide"><span>Perfil fiscal</span>
            <select v-model="selectedProfileId" required>
              <option value="" disabled>Selecione</option>
              <option v-for="profile in profiles" :key="profile.id" :value="profile.id">{{ profile.name }}</option>
            </select>
          </label>
          <button class="button primary field-wide" type="submit" :disabled="busy || !profiles.length">Salvar vínculo</button>
        </form>
      </article>
    </div>

    <section v-if="companyId" class="detail-section">
      <h3>Perfis cadastrados</h3>
      <p v-if="!profiles.length" class="empty-state">Ainda não há perfis para esta empresa.</p>
      <div v-else class="card table-wrap"><table>
        <thead><tr><th>Perfil</th><th>Início</th><th>Fim</th></tr></thead>
        <tbody><tr v-for="profile in profiles" :key="profile.id"><td>{{ profile.name }}</td><td>{{ profile.validFrom }}</td><td>{{ profile.validUntil || 'Sem fim' }}</td></tr></tbody>
      </table></div>
    </section>

    <section v-if="companyId" class="detail-section">
      <h3>Produtos vinculados</h3>
      <p v-if="!products.length" class="empty-state">Ainda não há produtos vinculados.</p>
      <div v-else class="card table-wrap"><table>
        <thead><tr><th>Fornecedor</th><th>Código</th><th>Perfil</th></tr></thead>
        <tbody><tr v-for="product in products" :key="product.id"><td>{{ product.supplierCnpj }}</td><td>{{ product.productCode }}</td><td>{{ profileNames.get(product.profileId) || '—' }}</td></tr></tbody>
      </table></div>
    </section>
  </section>
</template>
