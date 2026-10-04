<script setup lang="ts">
import { RendererErrorMessage } from '../error-messages'
import { ref } from 'vue'

const emit = defineEmits<{ created: [] }>()
const name = ref('')
const saving = ref(false)
const restoring = ref(false)
const error = ref('')

async function restoreBackup(): Promise<void> {
  restoring.value = true
  error.value = ''
  try { await window.desktopApi.restoreBackup() }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'Não foi possível restaurar o backup.' }
  finally { restoring.value = false }
}

async function createOrganization(): Promise<void> {
  error.value = ''
  saving.value = true
  try {
    await window.desktopApi.createOrganization({ name: name.value })
    emit('created')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : RendererErrorMessage.OFFICE_CREATE
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
        <button class="button primary" type="submit" :disabled="saving || restoring || !name.trim()">
          {{ saving ? 'Criando…' : 'Criar espaço local' }}
        </button>
      </form>
      <p>Já tem uma cópia de outra instalação?</p>
      <button class="button secondary" type="button" :disabled="saving || restoring" @click="restoreBackup">
        {{ restoring ? 'Verificando backup…' : 'Restaurar backup…' }}
      </button>
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
