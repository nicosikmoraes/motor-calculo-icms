export function allowedDonationCheckoutUrl(rawUrl: unknown): string | null {
  if (typeof rawUrl !== 'string') return null
  try {
    const url = new URL(rawUrl)
    if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com' || url.port !== ''
      || url.username !== '' || url.password !== '' || !url.pathname.startsWith('/c/pay/')) return null
    return url.toString()
  } catch { return null }
}
