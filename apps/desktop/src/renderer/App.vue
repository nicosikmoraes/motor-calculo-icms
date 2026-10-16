<script setup lang="ts">
import { RendererErrorMessage } from './error-messages'
import { computed, onMounted, ref } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import type { WorkspaceState } from '@motor/contracts'
import OnboardingView from './views/OnboardingView.vue'
import AppIcon from './components/AppIcon.vue'

const route = useRoute()
const toolsSelected = computed(() => ['/transferencia', '/backup', '/auditoria', '/perfis', '/regras', '/conflitos-notas', '/revisao-documental'].includes(route.path))

const version = ref('')
const workspace = ref<WorkspaceState | null>(null)
const loadingError = ref('')

async function loadWorkspace(): Promise<void> {
  loadingError.value = ''
  try {
    workspace.value = await window.desktopApi.getWorkspace()
  } catch (cause) {
    loadingError.value = cause instanceof Error ? cause.message : RendererErrorMessage.WORKSPACE_OPEN
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
        <div class="brand-mark" aria-hidden="true"><AppIcon name="document-check" /></div>
        <div>
          <h1>ContabiliNico</h1>
          <p>Auditoria fiscal local</p>
        </div>
      </div>

      <div class="primary-navigation"><p class="nav-label">Área de trabalho</p><nav aria-label="Navegação principal">
        <RouterLink to="/"><AppIcon name="dashboard" />Visão geral</RouterLink>
        <RouterLink to="/empresas"><AppIcon name="companies" />Empresas</RouterLink>
        <RouterLink to="/lotes"><AppIcon name="history" />Histórico de lotes</RouterLink>
        <RouterLink to="/conferencia-mensal"><AppIcon name="calendar" />Conferência mensal</RouterLink>
        <RouterLink class="sidebar-import" to="/lotes/novo"><AppIcon name="plus" />Importar notas</RouterLink>
      </nav></div>

      <div class="sidebar-footer">
        <details class="sidebar-tools" :open="toolsSelected"><summary><AppIcon name="settings" />Configurações</summary><nav aria-label="Configurações e ferramentas">
          <RouterLink to="/perfis">Perfis fiscais</RouterLink><RouterLink to="/regras">Regras propostas</RouterLink>
          <RouterLink to="/conflitos-notas">Conflitos de notas</RouterLink><RouterLink to="/revisao-documental">Revisão documental</RouterLink>
          <RouterLink to="/auditoria">Auditoria</RouterLink><RouterLink to="/transferencia">Transferir cadastros</RouterLink><RouterLink to="/backup">Backup</RouterLink>
        </nav></details>
        <span class="local-indicator">Dados neste dispositivo</span>
        <p class="version">Versão {{ version || '…' }}</p>
      </div>
    </aside>

    <main class="content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped src="./app-shell.css"></style>
