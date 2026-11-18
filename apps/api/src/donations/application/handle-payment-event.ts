import type { CheckoutEvent, PaymentFailedEvent, VerifiedPaymentEvent } from '../domain/payment-event.js';
import type { DonationRepository } from '../ports/donation-repository.js';
import type { StripeCheckoutGateway } from '../ports/stripe-checkout-gateway.js';

export class HandlePaymentEvent {
  constructor(
    private readonly repository: DonationRepository,
    private readonly gateway: Pick<StripeCheckoutGateway, 'retrieveCheckout'>,
  ) {}

  async execute(event: VerifiedPaymentEvent): Promise<void> {
    const { orderId, paymentId } = event;
    if (!isUuid(orderId) || !isUuid(paymentId)) return;

    switch (event.kind) {
      case 'payment_failed':
        return this.recordFailure(event, orderId, paymentId);
      case 'checkout_expired':
        return this.recordExpiration(event, orderId, paymentId);
      case 'checkout_completed':
        return this.confirmCheckout(event, orderId, paymentId);
    }
  }

  private async recordFailure(event: PaymentFailedEvent, orderId: string, paymentId: string): Promise<void> {
    const payment = await this.repository.findPaymentForWebhook(orderId, paymentId, '');
    if (!payment) return;
    const reason = event.liveMode ? 'MODO_DIVERGENTE'
      : payment.paymentIntentId && payment.paymentIntentId !== event.paymentIntentId ? 'PAYMENT_INTENT_DIVERGENTE'
        : event.amountInCents !== payment.amountInCents ? 'VALOR_DIVERGENTE'
          : event.currency?.toUpperCase() !== payment.currency ? 'MOEDA_DIVERGENTE'
            : null;
    if (reason) {
      await this.repository.recordWebhookDivergence({ orderId, paymentId, stripeEventId: event.id, reason });
      return;
    }
    await this.repository.recordPaymentFailure({
      orderId, paymentId, paymentIntentId: event.paymentIntentId, stripeEventId: event.id, occurredAt: event.occurredAt,
    });
  }

  private async recordExpiration(event: CheckoutEvent, orderId: string, paymentId: string): Promise<void> {
    if (event.liveMode) return;
    const session = await this.gateway.retrieveCheckout(event.checkoutSessionId);
    if (session.status !== 'expired' || session.paymentStatus !== 'unpaid' || session.id !== event.checkoutSessionId
      || session.orderId !== orderId || session.paymentId !== paymentId || session.livemode) return;
    const payment = await this.repository.findPaymentForWebhook(orderId, paymentId, session.id);
    if (payment && !payment.sessionLinkedElsewhere && (!payment.checkoutSessionId || payment.checkoutSessionId === session.id)) {
      await this.repository.recordSessionExpiration({
        orderId, paymentId, checkoutSessionId: session.id, stripeEventId: event.id, occurredAt: event.occurredAt,
      });
    }
  }

  private async confirmCheckout(event: CheckoutEvent, orderId: string, paymentId: string): Promise<void> {
    if (event.liveMode) {
      const knownPayment = await this.repository.findPaymentForWebhook(orderId, paymentId, event.checkoutSessionId);
      if (knownPayment) await this.repository.recordWebhookDivergence({
        orderId, paymentId, stripeEventId: event.id, reason: 'MODO_DIVERGENTE',
      });
      return;
    }

    // A assinatura comprova a origem do aviso. O estado da sessão comprova o pagamento.
    const session = await this.gateway.retrieveCheckout(event.checkoutSessionId);
    const payment = await this.repository.findPaymentForWebhook(orderId, paymentId, session.id);
    if (!payment) return;

    const reason = session.id !== event.checkoutSessionId || session.orderId !== orderId || session.paymentId !== paymentId
      ? 'SESSAO_DIVERGENTE'
      : session.livemode ? 'MODO_DIVERGENTE'
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
      confirmedAt: event.occurredAt,
    });
  }
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
