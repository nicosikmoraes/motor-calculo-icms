import { createHash, createHmac } from 'node:crypto';
import type { DonationCreationRepository } from '../ports/donation-creation-repository.js';
import type { StripeCheckoutGateway } from '../ports/stripe-checkout-gateway.js';
import { DonationCreationError } from './create-donation.js';

const unavailableMessage = 'Não foi possível retomar o pagamento agora';
const blockedMessage = 'Pagamento em verificação; nenhuma nova tentativa foi aberta';

export class RetryDonation {
  constructor(private readonly repository: DonationCreationRepository, private readonly gateway: StripeCheckoutGateway,
    private readonly identitySecret: string) {}

  async inspectCurrent(intent: unknown) {
    if (typeof intent !== 'string' || intent.length < 16 || intent.length > 256) return null;
    let orderId: string | null;
    try { orderId = await this.repository.getOrderIdByIntentHash(createHash('sha256').update(intent).digest('hex')); }
    catch { throw new DonationCreationError('service_unavailable', { message: 'Serviço de doações indisponível. Tente novamente mais tarde' }); }
    return orderId ? this.inspect(orderId, intent) : null;
  }

  async inspect(orderId: string, intent: unknown) {
    const donation = await this.authorized(orderId, intent);
    if (!donation) return null;
    const attempts = donation.attempts;
    const latest = attempts[0];
    if (latest?.checkoutSessionId && donation.status === 'pendente' && latest.status !== 'paga') {
      try {
        const session = await this.gateway.retrieveCheckout(latest.checkoutSessionId);
        if (this.matches(donation, latest, session) && session.status === 'expired' && session.paymentStatus === 'unpaid') {
          await this.repository.markSessionExpired({ orderId, paymentId: latest.paymentId, sessionId: latest.checkoutSessionId });
          latest.status = 'expirada';
          donation.events.push({ paymentId: latest.paymentId, status: 'expirada', reason: 'SESSAO_EXPIRADA', occurredAt: new Date() });
        }
      } catch { /* Consulta não é evidência de expiração; mantenha o estado persistido. */ }
    }
    return this.publicState(donation);
  }

  async retry(orderId: string, intent: unknown, operation: unknown) {
    if (typeof operation !== 'string' || operation.length < 16 || operation.length > 256) {
      throw new DonationCreationError('invalid_input', { message: 'Informe uma identidade de operação válida' });
    }
    const donation = await this.authorized(orderId, intent);
    if (!donation) return null;
    const latest = donation.attempts[0];
    if (donation.status === 'pago') {
      if (latest?.checkoutSessionId) {
        try {
          const session = await this.gateway.retrieveCheckout(latest.checkoutSessionId);
          if (this.matches(donation, latest, session) && session.status === 'open') {
            try {
              const expired = await this.gateway.expireCheckout(session.id);
              if (expired.status !== 'expired') throw new Error('Sessão excedente não foi expirada');
              await this.repository.markSessionExpired({ orderId, paymentId: latest.paymentId, sessionId: session.id });
            } catch {
              await this.repository.recordRetryExpirationFailure({ orderId, paymentId: latest.paymentId, sessionId: session.id });
            }
          }
        } catch { /* Pedido pago continua monotônico; nenhum URL de Checkout será devolvido. */ }
      }
      return this.publicState(donation);
    }
    if (!latest) throw new DonationCreationError('result_uncertain', { message: blockedMessage });
    const operationHash = createHmac('sha256', this.identitySecret).update(operation).digest('hex');
    const priorOperation = donation.attempts.find((attempt) => attempt.operationKeyHash === operationHash);
    if (priorOperation && priorOperation.paymentId !== latest.paymentId) {
      return { ...this.publicState(donation), paymentId: priorOperation.paymentId, status: priorOperation.status,
        checkoutUrl: priorOperation.status === 'paga' ? null : priorOperation.checkoutUrl, reused: true };
    }

    if (latest.checkoutSessionId) {
      let session;
      try { session = await this.gateway.retrieveCheckout(latest.checkoutSessionId); }
      catch { throw new DonationCreationError('stripe_unavailable', { message: unavailableMessage }); }
      if (!this.matches(donation, latest, session)) throw new DonationCreationError('stripe_unavailable', { message: unavailableMessage });
      if (session.status === 'open' && session.url) return { ...this.publicState(donation), checkoutUrl: session.url,
        paymentId: latest.paymentId, reused: true };
      if (session.status !== 'expired' || session.paymentStatus !== 'unpaid') {
        throw new DonationCreationError('result_uncertain', { message: blockedMessage });
      }
      await this.repository.markSessionExpired({ orderId, paymentId: latest.paymentId, sessionId: session.id });
      latest.status = 'expirada';
    } else {
      const conclusivelyRejectedBeforeSession = latest.status === 'falha_na_criacao'
        && latest.reason !== 'VALOR_NAO_ACEITO';
      if (!conclusivelyRejectedBeforeSession) {
        // A PaymentIntent refusal does not prove that Checkout stopped accepting payment.
        // Only the same operation may replay the durable original request/key within a safe window.
        const replayable = priorOperation?.paymentId === latest.paymentId
          && ['indeterminada', 'pendente', 'recusada'].includes(latest.status)
          && latest.firstSentAt !== null
          && Date.now() - latest.firstSentAt.getTime() < 23 * 60 * 60 * 1000
          && latest.checkoutParameters !== null;
        if (!replayable) throw new DonationCreationError('result_uncertain', { message: blockedMessage });
        try {
          const parameters = latest.checkoutParameters!;
          const session = await this.gateway.createCheckout({ amountInCents: parameters.amountInCents, currency: 'brl', orderId,
            paymentId: latest.paymentId, idempotencyKey: latest.stripeIdempotencyKey,
            successUrl: parameters.successUrl, cancelUrl: parameters.cancelUrl });
          if (!session.url) throw new Error('Checkout sem URL');
          await this.repository.recordCheckout({ isNew: false, orderId, paymentId: latest.paymentId, amount: donation.amount,
            currency: 'BRL', amountInCents: parameters.amountInCents, stripeIdempotencyKey: latest.stripeIdempotencyKey,
            firstSentAt: latest.firstSentAt!, successUrl: parameters.successUrl, cancelUrl: parameters.cancelUrl,
            checkoutSessionId: session.id, paymentIntentId: session.paymentIntentId, checkoutUrl: session.url, status: 'pendente' });
          return { orderId, paymentId: latest.paymentId, amount: donation.amount, currency: 'BRL', status: 'pendente',
            checkoutUrl: session.url, reused: true };
        } catch {
          throw new DonationCreationError('result_uncertain', { message: unavailableMessage });
        }
      }
    }
    if (priorOperation) return { ...this.publicState(donation), paymentId: latest.paymentId, status: latest.status,
      checkoutUrl: latest.status === 'expirada' ? null : latest.checkoutUrl, reused: true };

    const intentHash = createHash('sha256').update(String(intent)).digest('hex');
    const stripeIdempotencyKey = `donation_${operationHash}`;
    const fingerprint = createHash('sha256').update(`${donation.amount}:BRL`).digest('hex');
    const opening = await this.repository.createRetry({ orderId, intentKeyHash: intentHash,
      currentPaymentId: latest.paymentId, currentStatus: latest.status, operationKeyHash: operationHash,
      fingerprint, stripeIdempotencyKey, firstSentAt: new Date() });
    if (!opening) throw new DonationCreationError('result_uncertain', { message: blockedMessage });
    try {
      const session = await this.gateway.createCheckout({ amountInCents: opening.amountInCents, currency: 'brl', orderId,
        paymentId: opening.paymentId, idempotencyKey: opening.stripeIdempotencyKey,
        successUrl: opening.successUrl, cancelUrl: opening.cancelUrl });
      if (!session.url) throw new Error('Checkout sem URL');
      await this.repository.recordCheckout({ ...opening, checkoutSessionId: session.id,
        paymentIntentId: session.paymentIntentId, checkoutUrl: session.url });
      const afterOpening = await this.repository.getAuthorizedDonation(orderId, intentHash);
      if (!afterOpening || afterOpening.status === 'pago') {
        try {
          const expired = await this.gateway.expireCheckout(session.id);
          if (expired.status !== 'expired') throw new Error('Sessão excedente não foi expirada');
          await this.repository.markSessionExpired({ orderId, paymentId: opening.paymentId, sessionId: session.id });
        } catch {
          await this.repository.recordRetryExpirationFailure({ orderId, paymentId: opening.paymentId, sessionId: session.id });
        }
        return { orderId, paymentId: opening.paymentId, amount: opening.amount, currency: 'BRL',
          status: afterOpening?.status ?? 'pendente', checkoutUrl: null, reused: false };
      }
      return { orderId, paymentId: opening.paymentId, amount: opening.amount, currency: 'BRL', status: 'pendente',
        checkoutUrl: session.url, reused: false };
    } catch {
      await this.repository.recordIndeterminate({ ...opening, reason: 'RESULTADO_INCERTO' });
      throw new DonationCreationError('result_uncertain', { orderId, paymentId: opening.paymentId,
        status: 'indeterminada', message: unavailableMessage });
    }
  }

  private async authorized(orderId: string, intent: unknown) {
    if (!isUuid(orderId) || typeof intent !== 'string' || intent.length < 16 || intent.length > 256) return null;
    try { return await this.repository.getAuthorizedDonation(orderId, createHash('sha256').update(intent).digest('hex')); }
    catch { throw new DonationCreationError('service_unavailable', { message: 'Serviço de doações indisponível. Tente novamente mais tarde' }); }
  }

  private matches(donation: NonNullable<Awaited<ReturnType<DonationCreationRepository['getAuthorizedDonation']>>>,
    attempt: NonNullable<typeof donation>['attempts'][number], session: Awaited<ReturnType<StripeCheckoutGateway['retrieveCheckout']>>) {
    const params = attempt.checkoutParameters;
    return session.id === attempt.checkoutSessionId && session.orderId === donation.orderId && session.paymentId === attempt.paymentId
      && session.amountInCents === params?.amountInCents && session.currency?.toLowerCase() === 'brl' && !session.livemode;
  }

  private publicState(donation: NonNullable<Awaited<ReturnType<DonationCreationRepository['getAuthorizedDonation']>>>) {
    return { orderId: donation.orderId, amount: donation.amount, currency: donation.currency,
      status: donation.status, attempts: donation.attempts.map(({ paymentId, status, reason, checkoutSessionId, checkoutUrl }) =>
        ({ paymentId, status, reason, checkoutSessionId, checkoutUrl: donation.status === 'pago' ? null : checkoutUrl })), events: donation.events };
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
