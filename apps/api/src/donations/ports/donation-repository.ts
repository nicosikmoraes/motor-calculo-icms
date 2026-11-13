import type {
  DonationOpeningReservation,
  DonationOperationId,
  NewDonationOpening,
  VerifiedPaymentConfirmation,
} from '../domain/donation-persistence.js';

export interface DonationRepository {
  findPaymentForWebhook(orderId: string, paymentId: string, checkoutSessionId: string): Promise<{
    orderId: string;
    paymentId: string;
    amountInCents: string;
    currency: 'BRL';
    checkoutSessionId: string | null;
    paymentIntentId?: string | null;
    sessionLinkedElsewhere: boolean;
  } | null>;
  recordWebhookDivergence(input: {
    orderId: string;
    paymentId: string;
    stripeEventId: string;
    reason: string;
  }): Promise<void>;
  recordPaymentFailure(input: { orderId: string; paymentId: string; paymentIntentId: string; stripeEventId: string; occurredAt: Date }): Promise<void>;
  recordSessionExpiration(input: { orderId: string; paymentId: string; checkoutSessionId: string; stripeEventId: string; occurredAt: Date }): Promise<void>;
  reserveOpening(opening: NewDonationOpening): Promise<DonationOpeningReservation | null>;
  releaseOpening(operation: DonationOperationId): Promise<boolean>;
  confirmPayment(confirmation: VerifiedPaymentConfirmation): Promise<boolean>;
}

export const DONATION_REPOSITORY = Symbol('DONATION_REPOSITORY');
