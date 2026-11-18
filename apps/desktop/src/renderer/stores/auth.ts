import { defineStore } from 'pinia'
import { computed, shallowRef } from 'vue'
import type { AuthSession } from '@motor/contracts'
import * as auth from '../services/auth'

export const useAuthStore = defineStore('auth', () => {
  const session = shallowRef<AuthSession | null>(null)
  const canSeeReceivedDonations = computed(() => session.value?.role === 'ADMIN')
  let revision = 0

  function remember(value: AuthSession | null): void {
    revision += 1
    session.value = value ? { email: value.email, role: value.role } : null
  }

  async function signIn(email: string, password: string): Promise<AuthSession> {
    const value = await auth.signIn(email, password)
    remember(value)
    return value
  }

  async function registerAccount(email: string, password: string): Promise<AuthSession> {
    const value = await auth.registerAccount(email, password)
    remember(value)
    return value
  }

  function clearSession(): void { remember(null) }

  async function signOut(): Promise<void> {
    await auth.signOut()
    clearSession()
  }

  async function refreshSession(): Promise<AuthSession | null> {
    const requestedRevision = revision
    const value = await auth.currentSession()
    if (requestedRevision === revision) remember(value)
    return session.value
  }

  return { session, canSeeReceivedDonations, signIn, registerAccount, signOut, refreshSession, clearSession }
})
