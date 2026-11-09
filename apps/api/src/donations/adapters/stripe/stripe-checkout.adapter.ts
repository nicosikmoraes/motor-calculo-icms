import { Inject, Injectable } from '@nestjs/common';
import type Stripe from 'stripe';
import { StripeUnavailableError, type CreateCheckoutInput, type CheckoutSession, type StripeCheckoutGateway } from '../../ports/stripe-checkout-gateway.js';
import { STRIPE_CLIENT } from './stripe.tokens.js';

function isHttp503(error: unknown): boolean {
  const seen = new Set<unknown>();
  const visit = (value: unknown): boolean => {
    if (!value || typeof value !== 'object' || seen.has(value)) return false;
    seen.add(value);
    const obj = value as Record<string, unknown>;
    return obj.statusCode === 503 || obj._statusCode === 503
      || visit(obj.exception) || visit(obj.detail) || visit(obj.cause) || visit(obj.raw);
  };
  return visit(error);
}

@Injectable()
export class StripeCheckoutAdapter implements StripeCheckoutGateway {
  constructor(@Inject(STRIPE_CLIENT) private readonly stripe: Stripe) {}

  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutSession> {
    let session: Stripe.Checkout.Session;
    try {
      session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'brl',
          // Keep the decimal integer text intact; JSON sends it as text so the
          // provider, rather than JS precision loss, decides oversized values.
          unit_amount: input.amountInCents as unknown as number,
          product_data: { name: 'Doação ao ContabiliNico' },
        },
      }],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      metadata: { donation_order_id: input.orderId, donation_payment_id: input.paymentId },
      payment_intent_data: { metadata: { donation_order_id: input.orderId, donation_payment_id: input.paymentId } },
      } as unknown as Stripe.Checkout.SessionCreateParams, { idempotencyKey: input.idempotencyKey, maxNetworkRetries: 0 });
    } catch (error) {
      if (isHttp503(error)) throw new StripeUnavailableError();
      throw error;
    }
    return this.mapSession(session);
  }

  async retrieveCheckout(sessionId: string): Promise<CheckoutSession> {
    const session = await this.stripe.checkout.sessions.retrieve(sessionId);
    return this.mapSession(session);
  }

  private mapSession(session: Stripe.Checkout.Session): CheckoutSession {
    const paymentIntent = session.payment_intent;
    return {
      id: session.id, url: session.url,
      paymentIntentId: typeof paymentIntent === 'string' ? paymentIntent : paymentIntent?.id ?? null,
      orderId: session.metadata?.donation_order_id ?? null,
      paymentId: session.metadata?.donation_payment_id ?? null,
      amountInCents: session.amount_total === null ? null : String(session.amount_total),
      currency: session.currency,
      livemode: session.livemode,
      status: session.status,
    };
  }
}
