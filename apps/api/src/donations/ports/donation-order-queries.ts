export interface OwnedDonationOrder {
  orderId: string;
  amount: string;
  currency: 'BRL';
  status: string;
  attempts: Array<{
    paymentId: string;
    status: string;
    reason: string | null;
    checkoutSessionId: string | null;
    checkoutUrl: string | null;
    paymentIntentId: string | null;
    stripeIdempotencyKey: string;
    operationKeyHash: string | null;
    firstSentAt: Date | null;
    checkoutParameters: { amountInCents: string; currency: 'brl'; successUrl: string; cancelUrl: string } | null;
  }>;
  events: Array<{ paymentId: string; status: string | null; reason: string | null; occurredAt: Date }>;
}

export interface DonationOrderQueries {
  /** Pedido de outra pessoa ou sem dono é indistinguível de um pedido inexistente. */
  getOrderIdByIntentHash(intentKeyHash: string, ownerId: string): Promise<string | null>;
  getAuthorizedDonation(orderId: string, intentKeyHash: string, ownerId: string): Promise<OwnedDonationOrder | null>;
}

export const DONATION_ORDER_QUERIES = Symbol('DONATION_ORDER_QUERIES');
