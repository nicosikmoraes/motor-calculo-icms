const unavailableMessage = 'Serviço de doações indisponível. Tente novamente mais tarde'

/** A API usada pelo desktop roda no loopback local. */
export function donationApiBaseUrl(): URL {
  const url = new URL(process.env.DONATION_API_URL ?? 'http://127.0.0.1:3000')
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
    throw new Error(unavailableMessage)
  }
  return url
}

export function withApiAvailability<T>(action: () => Promise<T>): Promise<T> {
  return action().catch((error: unknown) => {
    if (error instanceof Error && error.message !== 'fetch failed') throw error
    throw new Error(unavailableMessage)
  })
}
