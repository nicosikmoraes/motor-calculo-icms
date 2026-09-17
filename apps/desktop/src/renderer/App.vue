<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink, RouterView } from 'vue-router'

const version = ref('')

onMounted(async () => {
  version.value = await window.desktopApi.getVersion()
})
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div>
        <p class="eyebrow">Auditoria fiscal local</p>
        <h1>Motor ICMS</h1>
      </div>

      <nav aria-label="Navegação principal">
        <RouterLink to="/">Visão geral</RouterLink>
        <RouterLink to="/lotes/novo">Novo lote</RouterLink>
      </nav>

      <p class="version">Versão {{ version || '…' }}</p>
    </aside>

    <main class="content">
      <RouterView />
    </main>
  </div>
</template>
