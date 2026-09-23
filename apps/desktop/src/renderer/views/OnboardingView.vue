<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{ created: [] }>()
const name = ref('')
const saving = ref(false)
const error = ref('')

async function createOrganization(): Promise<void> {
  error.value = ''
  saving.value = true
  try {
    await window.desktopApi.createOrganization({ name: name.value })
    emit('created')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Não foi possível criar o escritório.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <main class="onboarding-shell">
    <section class="onboarding-card card">
      <p class="eyebrow">Primeiro acesso</p>
      <h1>Vamos preparar o ContabiliNico.</h1>
      <p class="lead">
        Informe o nome do escritório ou do responsável por esta instalação. As
        empresas analisadas ficarão organizadas neste espaço local.
      </p>

      <form class="form-stack" @submit.prevent="createOrganization">
        <label>
          <span>Nome do escritório ou responsável</span>
          <input v-model="name" autocomplete="organization" maxlength="160" required />
        </label>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <button class="button primary" type="submit" :disabled="saving || !name.trim()">
          {{ saving ? 'Criando…' : 'Criar espaço local' }}
        </button>
      </form>
    </section>
  </main>
</template>
