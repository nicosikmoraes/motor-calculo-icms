import Stripe from 'stripe';

type HttpClientInterface = ReturnType<typeof Stripe.createFetchHttpClient>;
type HttpClientResponseInterface = Awaited<ReturnType<HttpClientInterface['makeRequest']>>;

export function createStripeClient(secretKey: string, fetcher: typeof fetch = fetch): Stripe {
  const fetchClient = Stripe.createFetchHttpClient(fetcher);
  const httpClient: HttpClientInterface = {
    getClientName: () => `status-aware-${fetchClient.getClientName()}`,
    async makeRequest(...args: Parameters<HttpClientInterface['makeRequest']>) {
      const response = await fetchClient.makeRequest(...args);
      return observeHttpStatus(response);
    },
  };
  return new Stripe(secretKey, { httpClient, maxNetworkRetries: 0 });
}

function observeHttpStatus(response: HttpClientResponseInterface): HttpClientResponseInterface {
  const statusCode = response.getStatusCode();
  if (statusCode !== 503) return response;
  return {
    getStatusCode: () => statusCode,
    getHeaders: () => response.getHeaders(),
    getRawResponse: () => response.getRawResponse(),
    toStream: (callback: Parameters<HttpClientResponseInterface['toStream']>[0]) => response.toStream(callback),
    async toJSON() {
      try {
        const payload = await response.toJSON();
        if (payload && typeof payload === 'object' && payload.error) return payload;
      } catch {
        // The SDK preserves this per-response error inside its normalized Stripe error.
      }
      const error = new Error('Stripe returned HTTP 503 without a usable error envelope') as Error & { statusCode: number };
      error.statusCode = statusCode;
      throw error;
    },
    dispose: () => response.dispose?.(),
  };
}
