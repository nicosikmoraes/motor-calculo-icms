import { createHash } from 'node:crypto';
import type { DonationOrderQueries, OwnedDonationOrder } from '../ports/donation-order-queries.js';
import type { CheckoutSession } from '../ports/stripe-checkout-gateway.js';
import { DonationCreationError } from './donation-creation.error.js';

type DonationAttempt = OwnedDonationOrder['attempts'][number];

export function donationServiceUnavailable(): DonationCreationError {
  return new DonationCreationError('service_unavailable', {
    message: 'Serviço de doações indisponível. Tente novamente mais tarde',
  });
}

export function requireTestCheckout(configured: boolean): void {
  if (!configured) throw donationServiceUnavailable();
}

export function hashDonationIntent(intent: unknown): string | null {
  if (typeof intent !== 'string' || intent.length < 16 || intent.length > 256) return null;
  return createHash('sha256').update(intent).digest('hex');
}

export async function findOwnedDonation(queries: Pick<DonationOrderQueries, 'getAuthorizedDonation'>,
  ownerId: string, orderId: string, intentHash: string): Promise<OwnedDonationOrder | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) return null;
  try {
    return await queries.getAuthorizedDonation(orderId, intentHash, ownerId);
  } catch {
    throw donationServiceUnavailable();
  }
}

export function matchesDonationCheckout(orderId: string, attempt: DonationAttempt, session: CheckoutSession): boolean {
  return session.id === attempt.checkoutSessionId && session.orderId === orderId && session.paymentId === attempt.paymentId
    && session.amountInCents === attempt.checkoutParameters?.amountInCents && session.currency?.toLowerCase() === 'brl' && !session.livemode;
}

export function toDonationOrderView(donation: OwnedDonationOrder) {
  return {
    orderId: donation.orderId, amount: donation.amount, currency: donation.currency, status: donation.status,
    attempts: donation.attempts.map(({ paymentId, status, reason, checkoutSessionId, checkoutUrl }) => ({
      paymentId, status, reason, checkoutSessionId,
      checkoutUrl: donation.status === 'pago' || status === 'expirada' ? null : checkoutUrl,
    })),
    events: donation.events,
  };
}
