import type { ReceivedDonationSummary } from '@motor/contracts'
import { desktopErrorMessage } from '../concerns/ipc/error-messages'

/** Camada de serviço da tela "Doações recebidas": a tela não fala com a API nem vê o token. */
export async function listReceivedDonations(): Promise<readonly ReceivedDonationSummary[]> {
  try { return await window.desktopApi.listReceivedDonations() }
  catch (cause) { throw new Error(desktopErrorMessage(cause, 'Não foi possível carregar as doações agora.')) }
}
