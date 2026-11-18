import { shell } from 'electron'
import { IPC_CHANNELS, type CreateDonationInput } from '@motor/contracts'
import type { createDonationsClient } from '../../../modules/donations/adapters/http/donations-client'
import { allowedDonationCheckoutUrl } from '../../../modules/donations/domain/donation-checkout'
import type { RegisterIpcRoute } from '../../route-registry'

function validIdentity(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 16 && value.length <= 256
}

export function registerDonationRoutes(register: RegisterIpcRoute, donations: ReturnType<typeof createDonationsClient>): void {
  register(IPC_CHANNELS.ADMIN_LIST_DONATIONS, () => donations.listReceived())
  register(IPC_CHANNELS.GET_CURRENT_DONATION, async (_event, rawIntent: unknown) => {
    if (!validIdentity(rawIntent)) return null
    return donations.current(rawIntent)
  })
  register(IPC_CHANNELS.CREATE_DONATION, async (_event, rawInput: unknown) => {
    const invalid = 'Informe um valor em reais de pelo menos R$ 0,50, com até duas casas decimais'
    if (!rawInput || typeof rawInput !== 'object') throw new Error(invalid)
    const input = rawInput as CreateDonationInput
    if (!validIdentity(input.intent) || !validIdentity(input.operation) || typeof input.amount !== 'string' || input.currency !== 'BRL') {
      throw new Error(invalid)
    }
    return donations.create(input)
  })
  register(IPC_CHANNELS.RETRY_DONATION, async (_event, rawInput: unknown) => {
    if (!rawInput || typeof rawInput !== 'object') throw new Error('Informe uma identidade de operação válida')
    const input = rawInput as { orderId?: unknown; intent?: unknown; operation?: unknown }
    if (!validIdentity(input.intent) || !validIdentity(input.operation) || typeof input.orderId !== 'string'
      || !/^[0-9a-f-]{36}$/i.test(input.orderId)) throw new Error('Informe uma identidade de operação válida')
    return donations.retry(input.orderId, input.intent, input.operation)
  })
  register(IPC_CHANNELS.OPEN_DONATION_CHECKOUT, async (_event, rawUrl: unknown) => {
    const checkoutUrl = allowedDonationCheckoutUrl(rawUrl)
    if (!checkoutUrl) throw new Error('Checkout inválido')
    await shell.openExternal(checkoutUrl)
  })
}
