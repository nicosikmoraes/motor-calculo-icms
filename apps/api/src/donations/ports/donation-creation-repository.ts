export interface NewDonationIntent {
  intentKeyHash: string;
  amount: string;
  operationKeyHash: string;
  fingerprint: string;
  stripeIdempotencyKey: string;
  firstSentAt: Date;
}

export interface PersistedDonationOpening {
  orderId: string;
  paymentId: string;
  amount: string;
  currency: 'BRL';
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
}

export const DONATION_CREATION_REPOSITORY = Symbol('DONATION_CREATION_REPOSITORY');
