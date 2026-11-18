import type { DonationCreationRepository } from '../ports/donation-creation-repository.js';
import type { DonationOrderQueries } from '../ports/donation-order-queries.js';
import type { StripeCheckoutGateway } from '../ports/stripe-checkout-gateway.js';
import {
  donationServiceUnavailable,
  findOwnedDonation,
  hashDonationIntent,
  matchesDonationCheckout,
  requireTestCheckout,
  toDonationOrderView,
} from './donation-order.js';

export class InspectDonation {
  constructor(
    private readonly queries: DonationOrderQueries,
    private readonly repository: Pick<DonationCreationRepository, 'markSessionExpired'>,
    private readonly gateway: Pick<StripeCheckoutGateway, 'retrieveCheckout'>,
    private readonly config: { testCheckoutConfigured: boolean },
  ) {}

  async inspectCurrent(ownerId: string, intent: unknown) {
    requireTestCheckout(this.config.testCheckoutConfigured);
    const intentHash = hashDonationIntent(intent);
    if (!intentHash) return null;

    let orderId: string | null;
    try {
      orderId = await this.queries.getOrderIdByIntentHash(intentHash, ownerId);
    } catch {
      throw donationServiceUnavailable();
    }
    return orderId ? this.inspectOrder(ownerId, orderId, intentHash) : null;
  }

  async inspect(ownerId: string, orderId: string, intent: unknown) {
    requireTestCheckout(this.config.testCheckoutConfigured);
    const intentHash = hashDonationIntent(intent);
    return intentHash ? this.inspectOrder(ownerId, orderId, intentHash) : null;
  }

  private async inspectOrder(ownerId: string, orderId: string, intentHash: string) {
    const donation = await findOwnedDonation(this.queries, ownerId, orderId, intentHash);
    if (!donation) return null;

    const latest = donation.attempts[0];
    if (latest?.checkoutSessionId && donation.status === 'pendente' && latest.status !== 'paga') {
      try {
        const session = await this.gateway.retrieveCheckout(latest.checkoutSessionId);
        if (matchesDonationCheckout(donation.orderId, latest, session) && session.status === 'expired' && session.paymentStatus === 'unpaid') {
          await this.repository.markSessionExpired({ orderId, paymentId: latest.paymentId, sessionId: latest.checkoutSessionId });
          latest.status = 'expirada';
          donation.events.push({ paymentId: latest.paymentId, status: 'expirada', reason: 'SESSAO_EXPIRADA', occurredAt: new Date() });
        }
      } catch { /* Sem confirmação de expiração, devolve o estado persistido. */ }
    }
    return toDonationOrderView(donation);
  }
}
