import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { onSessionExpired } from './services/auth'
import './styles.css'

createApp(App).use(createPinia()).use(router).mount('#app')

// O processo main recebeu 401 no meio do uso e já descartou o token: volta para entrar, explicando por quê.
onSessionExpired(() => {
  const voltar = router.currentRoute.value.path === '/entrar' ? '/apoio' : router.currentRoute.value.fullPath
  void router.push({ path: '/entrar', query: { voltar, motivo: 'expirada' } })
})
