<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { onMounted, ref } from 'vue'
import { RouterView } from 'vue-router'
import AppSidebar from './components/layout/AppSidebar.vue'
import { RendererErrorMessage } from './concerns/ipc/error-messages'
import { useAuthStore } from './stores/auth'
import { useWorkspaceStore } from './stores/workspace'
import OnboardingView from './views/onboarding/OnboardingView.vue'

const auth = useAuthStore()
const workspaceStore = useWorkspaceStore()
const { workspace, workspaceReady } = storeToRefs(workspaceStore)
const version = ref('')
const loadingError = ref('')

async function loadWorkspace(): Promise<void> {
  loadingError.value = ''
  try {
    await workspaceStore.refreshWorkspace()
  } catch (cause) {
    loadingError.value = cause instanceof Error ? cause.message : RendererErrorMessage.WORKSPACE_OPEN
  }
}

onMounted(async () => {
  await Promise.all([
    window.desktopApi.getVersion().then((value) => { version.value = value }),
    loadWorkspace(),
    auth.refreshSession().catch(() => null),
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
  <div v-else-if="!workspaceReady" class="loading-state">Abrindo ContabiliNico…</div>
  <OnboardingView v-else-if="!workspace.organization" />
  <div v-else class="app-shell">
    <AppSidebar :version="version" />

    <main class="content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.app-shell { display: grid; grid-template-columns: 224px minmax(0,1fr); min-height: 100vh; }
.content { min-width: 0; width: 100%; max-width: 1450px; padding: 32px clamp(26px,3vw,52px) 48px; }
.loading-state { display: grid; min-height: 100vh; place-items: center; color: #6a788d; }
.fatal-state { max-width: 680px; margin: 15vh auto; padding: 36px; }
.fatal-state h1 { margin: 10px 0 16px; font-size: 36px; letter-spacing: -.04em; }
@media (max-width: 900px) {
  .app-shell { grid-template-columns: minmax(0,1fr); }
  .content { padding: 28px 22px 45px; }
}
</style>

<style>
/* Reset e elementos compartilhados entre as telas. */
:root { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #1f2923;
  background: #f4f1e8;
  font-synthesis: none; }
* { box-sizing: border-box; }
body { margin: 0; min-width: 320px; min-height: 100vh; }
button, a, input, select { font: inherit; }
.page-header { display: flex; align-items: end; justify-content: space-between; gap: 32px; margin-bottom: 36px; }
.page-header.compact { align-items: start; }
.page-header h2 { max-width: 650px; margin: 6px 0 12px; font: 700 clamp(34px, 4vw, 54px)/1.06 Georgia, serif; }
.eyebrow { margin: 0; color: #b45d30; font-size: 12px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
.lead { max-width: 650px; margin: 0; color: #56615a; font-size: 18px; line-height: 1.6; }
.card { border: 1px solid #d9d4c7; border-radius: 14px; background: #fffdf8; box-shadow: 0 12px 30px rgb(38 48 42 / 5%); }
.button { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 18px; border: 0; border-radius: 8px; text-decoration: none; cursor: pointer; }
.button.primary { color: white; background: #b45d30; }
.button.secondary { color: #173d32; border: 1px solid #b9c8c0; background: #edf3ef; }
.button:disabled { opacity: .55; cursor: wait; }
details summary { cursor: pointer; }
.table-wrap { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; background: #fffdf8; font-size: 13px; }
th, td { padding: 12px 14px; border-bottom: 1px solid #e4dfd4; text-align: left; white-space: nowrap; }
th { color: #657069; background: #f4f1e8; font-size: 11px; text-transform: uppercase; }
.form-stack { display: grid; gap: 16px; }
.form-stack label { display: grid; gap: 7px; min-width: 0; color: #36423b; font-size: 14px; font-weight: 700; }
.form-stack label span { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 12px; }
.form-stack small { color: #7a847e; font-size: 11px; font-weight: 500; }
input, select { width: 100%; min-height: 44px; padding: 10px 12px; border: 1px solid #c9c5ba; border-radius: 8px; color: #1f2923; background: white; }
input:focus, select:focus { outline: 3px solid rgb(180 93 48 / 18%); border-color: #b45d30; }
.form-error, .form-success { margin: 0; padding: 10px 12px; border-radius: 7px; font-size: 14px; }
.form-error { color: #8d241d; background: #fbe7e4; }
.form-success { color: #1c6549; background: #e2f2e9; }
.notice { margin-bottom: 18px; }
.empty-state { margin: 0; padding: 22px; border-radius: 8px; color: #69736d; background: #f4f1e8; }
@media (max-width: 850px) {
  .page-header { align-items: start; flex-direction: column; }
}
:root { font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  color: #17233a;
  background: #f5f7fb; }
body { background: #f5f7fb; }
.page-header { margin-bottom: 30px; align-items: center; }
.page-header h2 { max-width: 820px; margin: 7px 0 10px; color: #142238; font: 750 clamp(30px, 3.2vw, 44px)/1.12 Inter, ui-sans-serif, system-ui, sans-serif; letter-spacing: -.045em; }
.eyebrow { color: #4b64cb; font-size: 11px; letter-spacing: .13em; }
.lead { max-width: 650px; color: #6a788d; font-size: 15px; line-height: 1.55; }
.card { border: 1px solid #e1e7f0; border-radius: 14px; background: #fff; box-shadow: 0 8px 26px #24395208; }
.button { min-height: 42px; border-radius: 9px; font-size: 13px; font-weight: 700; transition: transform .15s, background .15s, border-color .15s; }
.button:not(:disabled):hover { transform: translateY(-1px); }
.button.primary { background: #455fdb; color: white; box-shadow: 0 4px 10px #455fdb24; }
.button.primary:not(:disabled):hover { background: #344bc5; }
.button.secondary { color: #3449aa; border: 1px solid #d7dff3; background: #f7f9ff; }
.button:disabled { opacity: .48; cursor: not-allowed; }
input, select { border-color: #d6deeb; color: #243650; }
input:focus, select:focus { outline-color: #455fdb26; border-color: #6179e5; }
table { background: white; }
th { background: #f6f8fc; color: #627187; }
th, td { border-bottom-color: #e8edf4; }
.empty-state { color: #748198; background: #f7f9fc; }
.page-header > .button { flex: none; min-width: 132px; white-space: nowrap; }
.content > section, .content > section > *, .card { min-width: 0; }
.card, .empty-state, .form-error, .form-success { overflow-wrap: anywhere; }

/* Controles sem setas; os rótulos e estados mantêm a identificação da ação. */
summary { list-style: none; }
summary::-webkit-details-marker { display: none; }
summary::marker { content: ''; }
select { appearance: none; background-image: none; }

/* Mensagens com respiro entre formulários, títulos e painéis. */
.form-error, .form-success { margin-block: 16px 20px; padding: 14px 18px; line-height: 1.6; }
.notice + .card, .notice + section { margin-top: 6px; }
</style>
