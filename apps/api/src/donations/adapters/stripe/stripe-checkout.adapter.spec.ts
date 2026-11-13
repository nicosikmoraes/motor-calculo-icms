import { describe, expect, it } from 'vitest';
import { StripeCheckoutAdapter } from './stripe-checkout.adapter.js';
import { createStripeClient } from './stripe-client.js';

interface CapturedRequest {
  url: string;
  body: URLSearchParams;
  idempotencyKey: string | null;
}

function adapterCapturingRequests() {
  const requests: CapturedRequest[] = [];
  const stripe = createStripeClient('sk_test_controlled', async (input, init) => {
    const headers = new Headers(init?.headers);
    requests.push({
      url: String(input),
      body: new URLSearchParams(typeof init?.body === 'string' ? init.body : ''),
      idempotencyKey: headers.get('idempotency-key'),
    });
    return new Response(JSON.stringify({
      id: 'cs_test_controlled',
      object: 'checkout.session',
      url: 'https://checkout.stripe.com/c/pay/cs_test_controlled',
      payment_intent: null,
      metadata: { donation_order_id: 'pedido-1', donation_payment_id: 'pagamento-1' },
      amount_total: 1000,
      currency: 'brl',
      livemode: false,
      status: 'open',
      payment_status: 'unpaid',
    }), { status: 200, headers: { 'content-type': 'application/json', 'request-id': 'req_controlled' } });
  });
  return { adapter: new StripeCheckoutAdapter(stripe), requests };
}

describe('StripeCheckoutAdapter.createCheckout', () => {
  it('abre o Checkout sem payment_method_types, que a API atual do Stripe recusa', async () => {
    const { adapter, requests } = adapterCapturingRequests();

    const session = await adapter.createCheckout({
      amountInCents: '1000',
      currency: 'brl',
      orderId: 'pedido-1',
      paymentId: 'pagamento-1',
      idempotencyKey: 'operacao-1',
      successUrl: 'https://example.test/donations/return?result=success',
      cancelUrl: 'https://example.test/donations/return?result=cancel',
    });

    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request.url).toContain('/v1/checkout/sessions');
    expect([...request.body.keys()].filter((key) => key.startsWith('payment_method_types'))).toEqual([]);

    expect(request.body.get('mode')).toBe('payment');
    expect(request.body.get('line_items[0][quantity]')).toBe('1');
    expect(request.body.get('line_items[0][price_data][currency]')).toBe('brl');
    expect(request.body.get('line_items[0][price_data][unit_amount]')).toBe('1000');
    expect(request.body.get('success_url')).toBe('https://example.test/donations/return?result=success');
    expect(request.body.get('cancel_url')).toBe('https://example.test/donations/return?result=cancel');
    expect(request.body.get('metadata[donation_order_id]')).toBe('pedido-1');
    expect(request.body.get('metadata[donation_payment_id]')).toBe('pagamento-1');
    expect(request.body.get('payment_intent_data[metadata][donation_order_id]')).toBe('pedido-1');
    expect(request.body.get('payment_intent_data[metadata][donation_payment_id]')).toBe('pagamento-1');
    expect(request.idempotencyKey).toBe('operacao-1');

    expect(session).toMatchObject({
      id: 'cs_test_controlled',
      url: 'https://checkout.stripe.com/c/pay/cs_test_controlled',
      orderId: 'pedido-1',
      paymentId: 'pagamento-1',
      amountInCents: '1000',
      livemode: false,
    });
  });
});
