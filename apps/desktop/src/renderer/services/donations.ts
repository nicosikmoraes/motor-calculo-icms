import type { DonationInputError, DonationOrderSummary } from '@motor/contracts'

const storageKey = 'contabilinico.donations.intent.v1'
type DonationIdentity = { intent: string; operation?: string; operationKind?: 'create' | 'retry' }

function identity(): DonationIdentity {
  const raw = localStorage.getItem(storageKey)
  if (raw) {
    try {
      const value = JSON.parse(raw) as DonationIdentity
      if (typeof value.intent === 'string' && value.intent.length >= 16) return value
    } catch { /* Substitua apenas a identidade inválida deste recurso. */ }
  }
  const value = { intent: crypto.randomUUID() }
  localStorage.setItem(storageKey, JSON.stringify(value))
  return value
}

function save(value: DonationIdentity): void {
  localStorage.setItem(storageKey, JSON.stringify(value))
}

function operation(kind: 'create' | 'retry'): { intent: string; operation: string } {
  const current = identity()
  if (!current.operation || current.operationKind !== kind) {
    current.operation = crypto.randomUUID()
    current.operationKind = kind
    save(current)
  }
  return { intent: current.intent, operation: current.operation }
}

function clearOperation(kind: 'create' | 'retry'): void {
  const current = identity()
  if (current.operationKind === kind) {
    delete current.operation
    delete current.operationKind
    save(current)
  }
}

export async function loadCurrentDonation(): Promise<DonationOrderSummary | null> {
  const current = identity()
  const donation = await window.desktopApi.getCurrentDonation(current.intent)
  if (donation && current.operationKind === 'create') clearOperation('create')
  return donation
}

export async function createDonation(amount: string): Promise<DonationOrderSummary | DonationInputError> {
  const current = operation('create')
  const donation = await window.desktopApi.createDonation({ ...current, amount, currency: 'BRL' })
  clearOperation('create')
  return donation
}

export async function retryDonation(orderId: string): Promise<DonationOrderSummary> {
  const current = operation('retry')
  const donation = await window.desktopApi.retryDonation({ orderId, ...current })
  clearOperation('retry')
  return donation
}

export function openDonationCheckout(url: string): Promise<void> {
  return window.desktopApi.openDonationCheckout(url)
}

export function startNewDonationIntent(): void {
  save({ intent: crypto.randomUUID() })
}
