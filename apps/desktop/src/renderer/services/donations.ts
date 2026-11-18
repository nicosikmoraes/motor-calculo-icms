import type { DonationInputError, DonationOrderSummary } from '@motor/contracts'
import { donationIntentStorage } from '../concerns/donations/intent-storage'
import { useAuthStore } from '../stores/auth'

function currentAccountIntent() {
  return donationIntentStorage(useAuthStore().session?.email)
}

export async function loadCurrentDonation(): Promise<DonationOrderSummary | null> {
  const storage = currentAccountIntent()
  const current = storage.current()
  const donation = await window.desktopApi.getCurrentDonation(current.intent)
  if (donation && current.operationKind === 'create') storage.clearOperation('create', current)
  return donation
}

export async function createDonation(amount: string): Promise<DonationOrderSummary | DonationInputError> {
  const storage = currentAccountIntent()
  const current = storage.operation('create')
  const donation = await window.desktopApi.createDonation({ ...current, amount, currency: 'BRL' })
  storage.clearOperation('create', current)
  return donation
}

export async function retryDonation(orderId: string): Promise<DonationOrderSummary> {
  const storage = currentAccountIntent()
  const current = storage.operation('retry')
  const donation = await window.desktopApi.retryDonation({ orderId, ...current })
  storage.clearOperation('retry', current)
  return donation
}

export function openDonationCheckout(url: string): Promise<void> {
  return window.desktopApi.openDonationCheckout(url)
}

export function startNewDonationIntent(): void {
  currentAccountIntent().start()
}
