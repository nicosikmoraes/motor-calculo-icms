<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { afterSignIn } from '../../concerns/auth/navigation'
import { passwordProblem } from '../../concerns/auth/password'
import { useAuthStore } from '../../stores/auth'

const auth = useAuthStore()

const route = useRoute()
const router = useRouter()
const mode = ref<'entrar' | 'criar'>('entrar')
const email = ref('')
const password = ref('')
const busy = ref(false)
const error = ref('')
const expired = computed(() => route.query.motivo === 'expirada')

function switchMode(next: 'entrar' | 'criar'): void {
  mode.value = next
  error.value = ''
}

async function submit(): Promise<void> {
  error.value = ''
  if (mode.value === 'criar') {
    const problem = passwordProblem(password.value)
    if (problem) { error.value = problem; return }
  }
  busy.value = true
  try {
    if (mode.value === 'criar') await auth.registerAccount(email.value, password.value)
    else await auth.signIn(email.value, password.value)
    password.value = ''
    await router.replace(afterSignIn(route.query.voltar))
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Não foi possível entrar agora.'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <section class="sign-in-page">
    <p class="eyebrow">Apoio ao projeto</p>
    <h1>{{ mode === 'entrar' ? 'Entrar na sua conta' : 'Criar uma conta' }}</h1>
    <p class="intro">A conta serve só para as doações ficarem ligadas a você. As ferramentas fiscais continuam funcionando sem conta e sem internet.</p>

    <div class="sign-in-card">
      <p v-if="expired" class="notice" role="status">Sua sessão expirou. Entre de novo.</p>
      <div class="tabs" role="tablist">
        <button type="button" role="tab" :aria-selected="mode === 'entrar'" :class="{ active: mode === 'entrar' }" @click="switchMode('entrar')">Entrar</button>
        <button type="button" role="tab" :aria-selected="mode === 'criar'" :class="{ active: mode === 'criar' }" @click="switchMode('criar')">Criar conta</button>
      </div>
      <form class="sign-in-form" @submit.prevent="submit">
        <label for="sign-in-email">E-mail</label>
        <input id="sign-in-email" v-model="email" type="email" autocomplete="email" required maxlength="254" />
        <label for="sign-in-password">Senha</label>
        <input id="sign-in-password" v-model="password" type="password" required maxlength="1024"
          :autocomplete="mode === 'entrar' ? 'current-password' : 'new-password'"
          :aria-describedby="mode === 'criar' ? 'password-help' : undefined" />
        <small v-if="mode === 'criar'" id="password-help">De 8 a 72 caracteres.</small>
        <button class="button primary" type="submit" :disabled="busy">
          {{ busy ? 'Enviando…' : mode === 'entrar' ? 'Entrar' : 'Criar conta e entrar' }}
        </button>
      </form>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
    </div>
    <RouterLink class="back-link" to="/">Voltar às ferramentas fiscais</RouterLink>
  </section>
</template>

<style scoped>
.sign-in-page { max-width: 780px; margin: 0 auto; }
h1 { margin: 8px 0; color: #172033; font-size: 34px; }
.intro { max-width: 650px; color: #65738a; line-height: 1.65; }
.sign-in-card { margin-top: 28px; padding: 28px; border: 1px solid #dce3ed; border-radius: 16px; background: #fff; box-shadow: 0 12px 32px #18253a0b; }
.tabs { display: inline-flex; gap: 4px; padding: 4px; border-radius: 10px; background: #edf1f8; }
.tabs button { padding: 8px 14px; border: 0; border-radius: 8px; background: transparent; color: #31466e; font: inherit; font-weight: 700; cursor: pointer; }
.tabs button.active { background: #fff; box-shadow: 0 1px 3px #18253a22; }
.sign-in-form { display: grid; gap: 10px; max-width: 380px; margin-top: 22px; }
.sign-in-form label { color: #28364d; font-weight: 700; }
.sign-in-form input { padding: 12px 14px; border: 1px solid #cbd4e1; border-radius: 10px; color: #18243a; font: inherit; }
.sign-in-form small { color: #738198; }
.button { width: fit-content; margin-top: 8px; padding: 11px 16px; border: 0; border-radius: 9px; font: inherit; font-weight: 700; cursor: pointer; }
.button:disabled { opacity: .6; cursor: wait; }
.primary { color: white; background: #455fdb; }
.error { color: #a22d35; }
.notice { margin: 0 0 18px; padding: 12px 14px; border-radius: 10px; background: #fff2d9; color: #785000; }
.back-link { display: inline-block; margin-top: 22px; color: #455fdb; font-size: 14px; }
</style>
