export interface CreateCheckoutInput {
  amountInCents: string;
  currency: 'brl';
  orderId: string;
  paymentId: string;
  idempotencyKey: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSession {
  id: string;
  url: string | null;
  paymentIntentId: string | null;
  orderId: string | null;
  paymentId: string | null;
  amountInCents: string | null;
  currency: string | null;
  livemode: boolean;
  status: string | null;
  paymentStatus: 'paid' | 'unpaid' | 'no_payment_required' | null;
}

export interface StripeCheckoutGateway {
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession>;
  retrieveCheckout(sessionId: string): Promise<CheckoutSession>;
}

export class StripeUnavailableError extends Error {
  constructor() {
    super('The payment provider is unavailable');
    this.name = 'StripeUnavailableError';
  }
}

export const STRIPE_CHECKOUT_GATEWAY = Symbol('STRIPE_CHECKOUT_GATEWAY');
