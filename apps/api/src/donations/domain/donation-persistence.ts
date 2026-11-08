export interface DonationOperationId {
  orderId: string;
  operationKey: string;
}

export interface NewDonationOpening extends DonationOperationId {
  fingerprint: string;
  stripeIdempotencyKey: string;
}

export interface DonationOpeningReservation extends DonationOperationId {
  paymentId: string;
}

export interface VerifiedPaymentConfirmation {
  orderId: string;
  paymentId: string;
  checkoutSessionId: string;
  paymentIntentId?: string;
  stripeEventId: string;
  confirmedAt: Date;
}
