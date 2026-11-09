import type { DonationRepository } from '../ports/donation-repository.js';
import type { StripeCheckoutGateway } from '../ports/stripe-checkout-gateway.js';

export interface VerifiedStripeEvent {
  id: string;
  type: string;
  created: number;
  livemode: boolean;
  session: {
    id: string;
    object: string;
    orderId: string | null;
    paymentId: string | null;
    paymentIntentId?: string | null;
  };
}

export class HandleStripeEvent {
  constructor(
    private readonly repository: DonationRepository,
    private readonly gateway: StripeCheckoutGateway,
  ) {}

  async execute(event: VerifiedStripeEvent): Promise<void> {
    if (event.type === 'payment_intent.payment_failed' && event.session.object === 'payment_intent'
      && event.session.id && isUuid(event.session.orderId) && isUuid(event.session.paymentId)) {
      if (event.livemode) {
        const known = await this.repository.findPaymentForWebhook(event.session.orderId, event.session.paymentId, '');
        if (known) await this.repository.recordWebhookDivergence({ orderId: event.session.orderId,
          paymentId: event.session.paymentId, stripeEventId: event.id, reason: 'MODO_DIVERGENTE' });
        return;
      }
      const known = await this.repository.findPaymentForWebhook(event.session.orderId, event.session.paymentId, '');
      if (!known) return;
      if (known.paymentIntentId && known.paymentIntentId !== event.session.id) {
        await this.repository.recordWebhookDivergence({ orderId: event.session.orderId, paymentId: event.session.paymentId,
          stripeEventId: event.id, reason: 'PAYMENT_INTENT_DIVERGENTE' });
        return;
      }
      await this.repository.recordPaymentFailure({ orderId: event.session.orderId, paymentId: event.session.paymentId,
        paymentIntentId: event.session.id, stripeEventId: event.id, occurredAt: new Date(event.created * 1000) });
      return;
    }
    if (event.type === 'checkout.session.expired' && event.session.object === 'checkout.session' && event.session.id
      && isUuid(event.session.orderId) && isUuid(event.session.paymentId)) {
      if (event.livemode) return;
      const session = await this.gateway.retrieveCheckout(event.session.id);
      if (session.status !== 'expired' || session.paymentStatus !== 'unpaid' || session.id !== event.session.id || session.orderId !== event.session.orderId
        || session.paymentId !== event.session.paymentId || session.livemode) return;
      const known = await this.repository.findPaymentForWebhook(event.session.orderId, event.session.paymentId, session.id);
      if (known && !known.sessionLinkedElsewhere && (!known.checkoutSessionId || known.checkoutSessionId === session.id)) {
        await this.repository.recordSessionExpiration({ orderId: event.session.orderId,
        paymentId: event.session.paymentId, checkoutSessionId: session.id, stripeEventId: event.id,
        occurredAt: new Date(event.created * 1000) });
      }
      return;
    }
    if (event.type !== 'checkout.session.completed'
      || event.session.object !== 'checkout.session' || !event.session.id) return;
    const { orderId, paymentId } = event.session;
    if (!isUuid(orderId) || !isUuid(paymentId)) return;

    if (event.livemode) {
      const knownPayment = await this.repository.findPaymentForWebhook(orderId, paymentId, event.session.id);
      if (knownPayment) await this.repository.recordWebhookDivergence({
        orderId, paymentId, stripeEventId: event.id, reason: 'MODO_DIVERGENTE',
      });
      return;
    }

    // A valid signature proves the event came from Stripe; retrieve the current
    // session before using it as evidence for a payment transition.
    const session = await this.gateway.retrieveCheckout(event.session.id);
    const payment = await this.repository.findPaymentForWebhook(orderId, paymentId, session.id);
    if (!payment) return;

    const reason = session.id !== event.session.id || session.orderId !== orderId || session.paymentId !== paymentId
      ? 'SESSAO_DIVERGENTE'
      : session.livemode || event.livemode ? 'MODO_DIVERGENTE'
        : payment.sessionLinkedElsewhere ? 'SESSAO_JA_VINCULADA'
        : payment.checkoutSessionId !== null && payment.checkoutSessionId !== session.id ? 'SESSAO_JA_VINCULADA'
          : session.amountInCents !== payment.amountInCents ? 'VALOR_DIVERGENTE'
            : session.currency?.toLowerCase() !== 'brl' || payment.currency !== 'BRL' ? 'MOEDA_DIVERGENTE'
              : session.paymentStatus !== 'paid' ? 'PAGAMENTO_NAO_CONFIRMADO'
                : null;
    if (reason) {
      await this.repository.recordWebhookDivergence({ orderId, paymentId, stripeEventId: event.id, reason });
      return;
    }

    await this.repository.confirmPayment({
      orderId,
      paymentId,
      checkoutSessionId: session.id,
      ...(session.paymentIntentId ? { paymentIntentId: session.paymentIntentId } : {}),
      stripeEventId: event.id,
      confirmedAt: new Date(event.created * 1000),
    });
  }
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
