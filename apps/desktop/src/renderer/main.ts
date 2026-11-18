import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { onSessionExpired, sessionExpiredRedirect } from './services/auth'
import './styles.css'

createApp(App).use(createPinia()).use(router).mount('#app')

// O processo main recebeu 401 no meio do uso e já descartou o token: volta para entrar, explicando por quê.
// Quem já saiu para uma tela fiscal não é interrompido: a próxima visita a /apoio pede para entrar.
onSessionExpired(() => {
  const target = sessionExpiredRedirect(router.currentRoute.value)
  if (target) void router.push(target)
})
