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

<style scoped>
.onboarding-card h1 { margin: 10px 0 16px; font: 700 42px/1.08 Georgia, serif; }
.onboarding-shell { display: grid; min-height: 100vh; place-items: center; padding: 32px; background: #173d32; }
.onboarding-card { width: min(620px, 100%); padding: 48px; }
.onboarding-card .form-stack { margin-top: 30px; }
.onboarding-shell { background: #111c2e; }
.onboarding-card h1 { font-family: Inter, ui-sans-serif, system-ui, sans-serif; letter-spacing: -.04em; }
</style>
