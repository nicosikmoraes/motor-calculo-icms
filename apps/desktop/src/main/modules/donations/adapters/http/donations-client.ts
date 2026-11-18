import type { CreateDonationInput } from '@motor/contracts'
import type { createApiSession } from '../../../accounts/adapters/http/api-session'
import { withApiAvailability } from '../../../accounts/adapters/http/api-availability'
import { readAdminDonationsResponse } from './admin-donations-api'
import { readDonationResponse, type DonationApiResult } from './donation-api'

export function createDonationsClient(session: Pick<ReturnType<typeof createApiSession>, 'request'>) {
  const request = (path: string, init: RequestInit): Promise<DonationApiResult> => withApiAvailability(async () => {
    const response = await session.request(path, init)
    return readDonationResponse(response.status, path, response.body)
  })

  return {
    current: (intent: string) => request('/donation-orders/current', { headers: { 'X-Donation-Intent': intent } }),
    create: (input: CreateDonationInput) => request('/donation-orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Donation-Intent': input.intent, 'Idempotency-Key': input.operation },
      body: JSON.stringify({ amount: input.amount, currency: input.currency }),
    }),
    retry: (orderId: string, intent: string, operation: string) => request(`/donation-orders/${encodeURIComponent(orderId)}/attempts`, {
      method: 'POST', headers: { 'X-Donation-Intent': intent, 'Idempotency-Key': operation },
    }),
    listReceived: () => withApiAvailability(async () => {
      const response = await session.request('/admin/donation-orders', {})
      return readAdminDonationsResponse(response.status, response.body)
    }),
  }
}
