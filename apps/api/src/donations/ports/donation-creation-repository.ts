export interface NewDonationIntent {
  intentKeyHash: string;
  amount: string;
  operationKeyHash: string;
  fingerprint: string;
  stripeIdempotencyKey: string;
  firstSentAt: Date;
  amountInCents: string;
  successUrl: string;
  cancelUrl: string;
}

export interface PersistedDonationOpening {
  isNew: boolean;
  orderId: string;
  paymentId: string;
  amount: string;
  currency: 'BRL';
  amountInCents: string;
  stripeIdempotencyKey: string;
  firstSentAt: Date;
  successUrl: string;
  cancelUrl: string;
  checkoutSessionId: string | null;
  checkoutUrl: string | null;
  status: string;
}

export class DonationOperationConflictError extends Error {
  constructor() { super('A identidade da operação já foi usada com parâmetros diferentes'); }
}

export interface DonationCreationRepository {
  createIntent(input: NewDonationIntent): Promise<PersistedDonationOpening>;
  recordCheckout(input: PersistedDonationOpening & {
    checkoutSessionId: string;
    paymentIntentId: string | null;
    checkoutUrl: string | null;
  }): Promise<void>;
  recordIndeterminate(input: PersistedDonationOpening & { reason: string }): Promise<void>;
  recordCreationFailure(input: PersistedDonationOpening & { reason: string }): Promise<void>;
  getAuthorizedDonation(orderId: string, intentKeyHash: string): Promise<{
    orderId: string; amount: string; currency: 'BRL'; status: string;
    attempts: Array<{ paymentId: string; status: string; reason: string | null; checkoutSessionId: string | null;
      checkoutUrl: string | null; paymentIntentId: string | null; stripeIdempotencyKey: string;
      operationKeyHash: string | null;
      firstSentAt: Date | null; checkoutParameters: { amountInCents: string; currency: 'brl'; successUrl: string; cancelUrl: string } | null }>;
    events: Array<{ paymentId: string; status: string | null; reason: string | null; occurredAt: Date }>;
  } | null>;
  markSessionExpired(input: { orderId: string; paymentId: string; sessionId: string }): Promise<void>;
  recordRetryExpirationFailure(input: { orderId: string; paymentId: string; sessionId: string }): Promise<void>;
  createRetry(input: { orderId: string; intentKeyHash: string; currentPaymentId: string; currentStatus: string;
    operationKeyHash: string; fingerprint: string; stripeIdempotencyKey: string; firstSentAt: Date }): Promise<PersistedDonationOpening | null>;
}

export const DONATION_CREATION_REPOSITORY = Symbol('DONATION_CREATION_REPOSITORY');
