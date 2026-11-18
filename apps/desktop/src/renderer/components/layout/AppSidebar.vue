<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import AppIcon from '../ui/AppIcon.vue'
import { useAuthStore } from '../../stores/auth'

defineProps<{ version: string }>()

const auth = useAuthStore()
const route = useRoute()
const toolsSelected = computed(() => ['/transferencia', '/backup', '/auditoria', '/perfis', '/regras', '/conflitos-notas', '/revisao-documental'].includes(route.path))
</script>

<template>
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
      <RouterLink to="/apoio"><AppIcon name="briefcase" />Apoiar o projeto</RouterLink>
      <RouterLink v-if="auth.canSeeReceivedDonations" to="/admin/doacoes"><AppIcon name="archive" />Doações recebidas</RouterLink>
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
</template>

<style scoped>
.sidebar { position: sticky; top: 0; align-self: start; height: 100vh; overflow-y: auto; display: flex; flex-direction: column; gap: 32px; padding: 28px 16px 20px; color: #e9eef7; background: #111c2e; }
.brand, .primary-navigation, .sidebar-footer { flex-shrink: 0; }
.brand { display: flex; align-items: center; gap: 10px; padding: 4px 7px 23px; border-bottom: 1px solid #29364c; }
.brand-mark { display: grid; place-items: center; width: 36px; height: 36px; flex: none; border-radius: 10px; background: #5675f0; color: white; }
.brand-mark .app-icon { width: 24px; height: 24px; }
.brand h1 { margin: 0; font-size: 18px; font-weight: 750; line-height: 1.2; letter-spacing: -.04em; }
.brand p { margin: 5px 0 0; color: #9aa9c2; font-size: 11px; }
.nav-label { margin: 0 11px 12px; font-size: 10px; text-transform: uppercase; letter-spacing: .1em; color: #9aa9c2; }
.sidebar nav { display: grid; gap: 5px; }
.sidebar nav a { display: flex; gap: 10px; align-items: center; padding: 12px 11px; color: #b5c1d4; border: 1px solid transparent; border-radius: 10px; font-size: 13px; font-weight: 550; text-decoration: none; }
.sidebar nav a:hover { color: white; background: #202d43; }
.sidebar nav a.router-link-exact-active { color: white; border-color: #3c5274; background: #263956; }
.sidebar nav a.sidebar-import { margin-top: 12px; border-color: #344977; color: #d2ddff; }
.sidebar-footer { margin-top: auto; padding-top: 12px; }
.sidebar-tools { margin-bottom: 20px; border-top: 1px solid #29364c; padding-top: 11px; }
.sidebar-tools summary { display: flex; align-items: center; gap: 10px; padding: 12px 11px; color: #b5c1d4; font-size: 13px; border-radius: 9px; cursor: pointer; }
.sidebar-tools summary:hover { color: white; background: #202d43; }
.sidebar-tools nav { margin-top: 7px; }
.sidebar-tools nav a { padding: 9px 12px; font-size: 12px; }
.local-indicator { display: inline-flex; align-items: center; gap: 8px; color: #a8b9d0; font-size: 11px; margin-left: 11px; }
.local-indicator::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: #43bf91; }
.version { margin: 10px 11px 0; color: #7c90ad; font-size: 11px; }
@media (max-width: 900px) {
  .sidebar { position: static; height: auto; overflow: visible; gap: 14px; padding: 16px; }
  .brand { padding: 0 5px 14px; }
  .nav-label { display: none; }
  .sidebar nav { display: flex; flex-wrap: wrap; gap: 5px; }
  .sidebar nav a { padding: 10px; }
  .sidebar nav a.sidebar-import { margin-top: 0; }
  .sidebar-footer { margin: 0; padding: 0; }
  .sidebar-tools { border: 0; padding: 0; margin: 0; }
  .sidebar-tools summary { padding: 8px 10px; width: fit-content; }
  .local-indicator, .version { display: none; }
}
</style>
