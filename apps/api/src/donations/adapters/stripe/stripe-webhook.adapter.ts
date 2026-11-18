import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Stripe from 'stripe';
import type { VerifiedPaymentEvent } from '../../domain/payment-event.js';
import { InvalidStripeWebhookError } from './invalid-stripe-webhook.error.js';
import { STRIPE_CLIENT } from './stripe.tokens.js';

@Injectable()
export class StripeWebhookAdapter {
  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
    private readonly config: ConfigService,
  ) {}

  verify(rawBody: Buffer | undefined, signature: string | undefined): VerifiedPaymentEvent | null {
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!secret || !signature || !rawBody) throw new InvalidStripeWebhookError();

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      throw new InvalidStripeWebhookError();
    }

    return toPaymentEvent(event);
  }
}

function toPaymentEvent(event: Stripe.Event): VerifiedPaymentEvent | null {
  const eventDetails = { id: event.id, occurredAt: new Date(event.created * 1000), liveMode: event.livemode };
  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.expired': {
      const session = event.data.object;
      if (session.object !== 'checkout.session' || !session.id) return null;
      return {
        ...eventDetails,
        kind: event.type === 'checkout.session.completed' ? 'checkout_completed' : 'checkout_expired',
        checkoutSessionId: session.id,
        orderId: session.metadata?.donation_order_id ?? null,
        paymentId: session.metadata?.donation_payment_id ?? null,
      };
    }
    case 'payment_intent.payment_failed': {
      const payment = event.data.object;
      if (payment.object !== 'payment_intent' || !payment.id) return null;
      return {
        ...eventDetails,
        kind: 'payment_failed',
        paymentIntentId: payment.id,
        orderId: payment.metadata?.donation_order_id ?? null,
        paymentId: payment.metadata?.donation_payment_id ?? null,
        amountInCents: Number.isSafeInteger(payment.amount) ? String(payment.amount) : null,
        currency: typeof payment.currency === 'string' ? payment.currency : null,
      };
    }
    default:
      return null;
  }
}
