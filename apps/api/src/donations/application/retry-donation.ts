import { createHash, createHmac } from 'node:crypto';
import type { DonationCreationRepository } from '../ports/donation-creation-repository.js';
import type { DonationOrderQueries } from '../ports/donation-order-queries.js';
import type { StripeCheckoutGateway } from '../ports/stripe-checkout-gateway.js';
import type { DonationCreationConfiguration } from './create-donation.js';
import { DonationCreationError } from './donation-creation.error.js';
import {
  findOwnedDonation,
  hashDonationIntent,
  matchesDonationCheckout,
  requireTestCheckout,
  toDonationOrderView,
} from './donation-order.js';

const unavailableMessage = 'Não foi possível retomar o pagamento agora';
const blockedMessage = 'Pagamento em verificação; nenhuma nova tentativa foi aberta';
type RetryDonationConfiguration = Pick<DonationCreationConfiguration, 'identitySecret' | 'testCheckoutConfigured'>;

export class RetryDonation {
  constructor(
    private readonly repository: DonationCreationRepository,
    private readonly queries: Pick<DonationOrderQueries, 'getAuthorizedDonation'>,
    private readonly gateway: StripeCheckoutGateway,
    private readonly config: RetryDonationConfiguration,
  ) {}

  async retry(ownerId: string, orderId: string, intent: unknown, operation: unknown) {
    requireTestCheckout(this.config.testCheckoutConfigured);
    if (typeof operation !== 'string' || operation.length < 16 || operation.length > 256) {
      throw new DonationCreationError('invalid_input', { message: 'Informe uma identidade de operação válida' });
    }
    const intentHash = hashDonationIntent(intent);
    if (!intentHash) return null;
    const donation = await findOwnedDonation(this.queries, ownerId, orderId, intentHash);
    if (!donation) return null;
    const latest = donation.attempts[0];
    if (donation.status === 'pago') {
      if (latest?.checkoutSessionId) {
        try {
          const session = await this.gateway.retrieveCheckout(latest.checkoutSessionId);
          if (matchesDonationCheckout(donation.orderId, latest, session) && session.status === 'open') {
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
      return toDonationOrderView(donation);
    }
    if (!latest) throw new DonationCreationError('result_uncertain', { message: blockedMessage });
    const operationHash = createHmac('sha256', this.config.identitySecret).update(operation).digest('hex');
    const priorOperation = donation.attempts.find((attempt) => attempt.operationKeyHash === operationHash);
    if (priorOperation && priorOperation.paymentId !== latest.paymentId) {
      return { ...toDonationOrderView(donation), paymentId: priorOperation.paymentId, status: priorOperation.status,
        checkoutUrl: priorOperation.status === 'paga' ? null : priorOperation.checkoutUrl, reused: true };
    }

    if (latest.checkoutSessionId) {
      let session;
      try { session = await this.gateway.retrieveCheckout(latest.checkoutSessionId); }
      catch { throw new DonationCreationError('stripe_unavailable', { message: unavailableMessage }); }
      if (!matchesDonationCheckout(donation.orderId, latest, session)) throw new DonationCreationError('stripe_unavailable', { message: unavailableMessage });
      if (session.status === 'open' && session.url) return { ...toDonationOrderView(donation), checkoutUrl: session.url,
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
          && Date.now() - latest.firstSentAt.getTime() < 24 * 60 * 60 * 1000
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
    if (priorOperation) return { ...toDonationOrderView(donation), paymentId: latest.paymentId, status: latest.status,
      checkoutUrl: latest.status === 'expirada' ? null : latest.checkoutUrl, reused: true };

    const stripeIdempotencyKey = `donation_${operationHash}`;
    const fingerprint = createHash('sha256').update(`${donation.amount}:BRL`).digest('hex');
    const opening = await this.repository.createRetry({ ownerId, orderId, intentKeyHash: intentHash,
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
      const afterOpening = await this.queries.getAuthorizedDonation(orderId, intentHash, ownerId);
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
}
