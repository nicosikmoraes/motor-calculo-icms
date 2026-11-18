import type { ReceivedDonationSummary } from '@motor/contracts'

export const FORBIDDEN_MESSAGE = 'Sua conta não tem permissão para ver esta página.'
const unavailable = 'Não foi possível carregar as doações agora.'

/**
 * Lê a resposta de GET /admin/donation-orders. O 401 já foi tratado pela sessão (token descartado,
 * janela avisada); o 403 é outra coisa: a pessoa está conectada, só não pode. Não derruba a sessão.
 */
export function readAdminDonationsResponse(status: number, rawBody: unknown): readonly ReceivedDonationSummary[] {
  if (status === 403) throw new Error(FORBIDDEN_MESSAGE)
  const data = rawBody && typeof rawBody === 'object' && !Array.isArray(rawBody) ? (rawBody as { data?: unknown }).data : undefined
  if (status !== 200 || !Array.isArray(data)) throw new Error(unavailable)
  return data as ReceivedDonationSummary[]
}
