/**
 * Caminho do Checkout hospedado: `/c/pay/` ou `/g/pay/` (o formato que o Stripe
 * devolve hoje), seguido do id da sessão. Qualquer outro caminho do domínio é recusado.
 */
const checkoutPath = /^\/[cg]\/pay\/cs_(?:test|live)_[A-Za-z0-9]+$/

export function allowedDonationCheckoutUrl(rawUrl: unknown): string | null {
  if (typeof rawUrl !== 'string') return null
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com' || url.port !== ''
      || url.username !== '' || url.password !== '' || !checkoutPath.test(url.pathname)) return null
    return url.toString()
  } catch { return null }
}
