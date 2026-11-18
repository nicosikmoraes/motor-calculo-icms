import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { router } from './router'
import App from './App.vue'
import { sessionExpiredRedirect } from './concerns/auth/navigation'
import { onSessionExpired } from './services/auth'
import { useAuthStore } from './stores/auth'

const pinia = createPinia()
const app = createApp(App).use(pinia).use(router)
const auth = useAuthStore(pinia)

app.onUnmount(onSessionExpired(() => {
  auth.clearSession()
  const target = sessionExpiredRedirect(router.currentRoute.value)
  if (target) void router.push(target)
}))

app.mount('#app')
