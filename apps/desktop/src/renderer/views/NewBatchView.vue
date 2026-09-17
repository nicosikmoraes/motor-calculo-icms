<script setup lang="ts">
import { computed, ref } from 'vue'
import type { SelectedSource } from '@motor/contracts'

const sources = ref<SelectedSource[]>([])
const selecting = ref(false)
const hasSources = computed(() => sources.value.length > 0)

async function selectSources(): Promise<void> {
  selecting.value = true
  try {
    sources.value = await window.desktopApi.selectSources()
  } finally {
    selecting.value = false
  }
}
</script>

<template>
  <section>
    <header class="page-header compact">
      <div>
        <p class="eyebrow">Importação</p>
        <h2>Novo lote</h2>
        <p class="lead">Selecione XMLs de NF-e/NFC-e ou um arquivo ZIP.</p>
      </div>
    </header>

    <article class="card upload-card">
      <div class="upload-mark" aria-hidden="true">XML</div>
      <h3>{{ hasSources ? `${sources.length} arquivo(s) selecionado(s)` : 'Escolha os documentos' }}</h3>
      <p>
        O processamento ainda será conectado ao parser. Esta etapa já usa o diálogo
        seguro do processo principal e aceita apenas XML e ZIP.
      </p>
      <button class="button primary" type="button" :disabled="selecting" @click="selectSources">
        {{ selecting ? 'Abrindo…' : 'Selecionar arquivos' }}
      </button>

      <ul v-if="hasSources" class="source-list">
        <li v-for="source in sources" :key="source.path">
          <span class="tag">{{ source.kind }}</span>
          <span>{{ source.path }}</span>
        </li>
      </ul>
    </article>
  </section>
</template>
