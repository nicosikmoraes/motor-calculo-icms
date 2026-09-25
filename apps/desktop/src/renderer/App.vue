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

<style scoped>
.app-shell { display: grid; grid-template-columns: 260px 1fr; min-height: 100vh; }
.sidebar { display: flex; flex-direction: column; gap: 48px; padding: 36px 28px;
  color: #f8f4e9; background: #173d32; }
.sidebar h1 { margin: 4px 0 0; font-family: Georgia, serif; font-size: 28px; }
.sidebar nav { display: grid; gap: 8px; }
.sidebar nav a { padding: 11px 13px; color: #d8e5dd; text-decoration: none; border-radius: 8px; }
.sidebar nav a.router-link-exact-active { color: white; background: #28594a; }
.version { margin-top: auto; color: #9eb6aa; font-size: 13px; }
.content { padding: 58px clamp(36px, 6vw, 88px); }
.sidebar .eyebrow { color: #e6a27e; }
.loading-state { display: grid; min-height: 100vh; place-items: center; color: #56615a; }
.fatal-state { max-width: 680px; margin: 15vh auto; padding: 36px; }
.fatal-state h1 { margin: 10px 0 16px; font: 700 42px/1.08 Georgia, serif; }
@media (max-width: 850px) {
  .app-shell { grid-template-columns: 1fr; }
}
@media (max-width: 850px) {
  .sidebar { flex-direction: row; align-items: center; padding: 18px 24px; }
}
@media (max-width: 850px) {
  .sidebar nav { display: flex; margin-left: auto; }
}
@media (max-width: 850px) {
  .version { display: none; }
}
@media (max-width: 850px) {
  .content { padding: 34px 24px; }
}
.app-shell { grid-template-columns: 244px minmax(0, 1fr); }
.sidebar { gap: 44px; padding: 28px 18px; background: #111c2e; color: #e9eef7; }
.brand { display: flex; align-items: center; gap: 12px; padding: 6px 10px 18px; border-bottom: 1px solid #29364c; }
.brand-mark { display: grid; place-items: center; width: 36px; height: 36px; flex: none; border-radius: 10px; background: #5675f0; color: white; font-weight: 800; font-size: 21px; }
.sidebar h1 { margin: 0; font: 750 18px/1.2 Inter, ui-sans-serif, system-ui, sans-serif; letter-spacing: -.035em; }
.brand p { margin: 4px 0 0; color: #9aa9c2; font-size: 11px; }
.sidebar nav { gap: 5px; }
.sidebar nav a { padding: 12px 14px; color: #b5c1d4; border: 1px solid transparent; border-radius: 10px; font-size: 13px; font-weight: 600; transition: background .15s, color .15s; }
.sidebar nav a:hover { color: white; background: #202d43; }
.sidebar nav a.router-link-exact-active { color: white; border-color: #3c5274; background: #263956; }
.sidebar-footer { margin-top: auto; padding: 0 11px; }
.local-indicator { display: inline-flex; align-items: center; gap: 8px; color: #a8b9d0; font-size: 11px; }
.local-indicator::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: #43bf91; box-shadow: 0 0 0 3px #43bf9126; }
.version { margin: 12px 0 0; color: #6d819e; font-size: 11px; }
.content { width: 100%; max-width: 1450px; padding: 42px clamp(28px, 4vw, 72px) 64px; }
.fatal-state h1 { font-family: Inter, ui-sans-serif, system-ui, sans-serif; letter-spacing: -.04em; }
@media (max-width: 900px) {
  .content { padding: 30px 24px 50px; }
}
@media (max-width: 650px) {
  .app-shell { grid-template-columns: 1fr; }
}
@media (max-width: 650px) {
  .sidebar { flex-direction: column; gap: 12px; padding: 14px; }
}
@media (max-width: 650px) {
  .brand { padding: 0 4px 10px; }
}
@media (max-width: 650px) {
  .sidebar nav { display: flex; overflow-x: auto; margin: 0; }
}
@media (max-width: 650px) {
  .sidebar nav a { flex: none; }
}
@media (max-width: 650px) {
  .sidebar-footer { display: none; }
}
.content { min-width: 0; }
</style>
