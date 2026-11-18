import type { DonationInputError, DonationOrderSummary } from '@motor/contracts'

/**
 * Único ponto do aplicativo que conhece o formato das respostas da API de doações:
 * sucesso vem em `{ data }` e erro em `{ error: { statusCode, message, ... } }`.
 * O resto do desktop recebe só o pedido, o erro de entrada ou uma exceção com mensagem.
 */
export type DonationApiResult = DonationOrderSummary | DonationInputError | null

const fallbackMessage = 'Não foi possível retomar o pagamento agora'

type Envelope = { data?: unknown; error?: Record<string, unknown> } | null

export function readDonationResponse(status: number, path: string, rawBody: unknown): DonationApiResult {
  const body = (rawBody && typeof rawBody === 'object' ? rawBody : null) as Envelope
  const error = body?.error && typeof body.error === 'object' ? body.error : null
  const data = body?.data && typeof body.data === 'object' ? body.data as Record<string, unknown> : null

  if (status === 404 && path === '/donation-orders/current') return null
  if (status === 422 && error?.reason === 'VALOR_NAO_ACEITO') {
    const { statusCode: _statusCode, ...rejected } = error
    return rejected as unknown as DonationOrderSummary
  }
  if (status === 422 && (error?.field === 'amount' || error?.field === 'currency') && typeof error.message === 'string') {
    return { kind: 'invalid_input', field: error.field, message: error.message }
  }
  if (status < 200 || status >= 300 || status === 202) {
    const message = typeof error?.message === 'string' ? error.message
      : typeof data?.message === 'string' ? data.message : fallbackMessage
    throw new Error(message)
  }
  if (!data) throw new Error(fallbackMessage)
  return data as unknown as DonationOrderSummary
}
