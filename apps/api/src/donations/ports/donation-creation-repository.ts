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
}

export const DONATION_CREATION_REPOSITORY = Symbol('DONATION_CREATION_REPOSITORY');
