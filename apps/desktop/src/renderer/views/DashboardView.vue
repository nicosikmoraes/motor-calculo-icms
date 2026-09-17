<script setup lang="ts">
import { RouterLink } from 'vue-router'

const indicators = [
  { label: 'Lotes processados', value: '0' },
  { label: 'Notas concluídas', value: '0' },
  { label: 'Pendências abertas', value: '0' },
]
</script>

<template>
  <section>
    <header class="page-header">
      <div>
        <p class="eyebrow">Visão geral</p>
        <h2>Seu trabalho fiscal começa aqui.</h2>
        <p class="lead">
          Importe documentos fiscais, acompanhe o processamento e investigue cada
          resultado com rastreabilidade.
        </p>
      </div>
      <RouterLink class="button primary" to="/lotes/novo">Criar primeiro lote</RouterLink>
    </header>

    <div class="indicator-grid">
      <article v-for="indicator in indicators" :key="indicator.label" class="card indicator">
        <strong>{{ indicator.value }}</strong>
        <span>{{ indicator.label }}</span>
      </article>
    </div>

    <article class="card getting-started">
      <p class="eyebrow">Estrutura inicial</p>
      <h3>Base pronta para evoluir com segurança</h3>
      <p>
        A interface já está isolada do sistema operacional. Parser, persistência,
        cálculo e relatórios entram como módulos independentes conforme as decisões
        fiscais e técnicas forem aprovadas.
      </p>
    </article>
  </section>
</template>
