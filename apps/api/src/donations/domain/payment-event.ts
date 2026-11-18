interface PaymentEventDetails {
  id: string;
  occurredAt: Date;
  liveMode: boolean;
  orderId: string | null;
  paymentId: string | null;
}

export interface CheckoutEvent extends PaymentEventDetails {
  kind: 'checkout_completed' | 'checkout_expired';
  checkoutSessionId: string;
}

export interface PaymentFailedEvent extends PaymentEventDetails {
  kind: 'payment_failed';
  paymentIntentId: string;
  amountInCents: string | null;
  currency: string | null;
}

export type VerifiedPaymentEvent = CheckoutEvent | PaymentFailedEvent;
