<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import type { WorkspaceState } from '@motor/contracts'
import OnboardingView from './views/OnboardingView.vue'

const version = ref('')
const workspace = ref<WorkspaceState | null>(null)
const loadingError = ref('')

async function loadWorkspace(): Promise<void> {
  loadingError.value = ''
  try {
    workspace.value = await window.desktopApi.getWorkspace()
  } catch (cause) {
    loadingError.value = cause instanceof Error ? cause.message : 'Falha ao abrir o espaço local.'
  }
}

onMounted(async () => {
  await Promise.all([
    window.desktopApi.getVersion().then((value) => { version.value = value }),
    loadWorkspace(),
  ])
})
</script>

<template>
  <div v-if="loadingError" class="fatal-state">
    <p class="eyebrow">Falha de inicialização</p>
    <h1>Não foi possível abrir o ContabiliNico.</h1>
    <p>{{ loadingError }}</p>
    <button class="button primary" type="button" @click="loadWorkspace">Tentar novamente</button>
  </div>
  <div v-else-if="workspace === null" class="loading-state">Abrindo ContabiliNico…</div>
  <OnboardingView v-else-if="!workspace.organization" @created="loadWorkspace" />
  <div v-else class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true">C</div>
        <div>
          <h1>ContabiliNico</h1>
          <p>Auditoria fiscal local</p>
        </div>
      </div>

      <nav aria-label="Navegação principal">
        <RouterLink to="/">Visão geral</RouterLink>
        <RouterLink to="/empresas">Empresas</RouterLink>
        <RouterLink to="/perfis">Perfis fiscais</RouterLink>
        <RouterLink to="/lotes">Histórico</RouterLink>
        <RouterLink to="/lotes/novo">Novo lote</RouterLink>
      </nav>

      <div class="sidebar-footer">
        <span class="local-indicator">Dados neste dispositivo</span>
        <p class="version">Versão {{ version || '…' }}</p>
      </div>
    </aside>

    <main class="content">
      <RouterView />
    </main>
  </div>
</template>
