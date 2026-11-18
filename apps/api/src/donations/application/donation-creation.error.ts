type DonationCreationFailureCode =
  | 'invalid_input'
  | 'service_unavailable'
  | 'gateway_rejected_amount'
  | 'stripe_unavailable'
  | 'result_uncertain';

export class DonationCreationError extends Error {
  constructor(readonly code: DonationCreationFailureCode, readonly details: Record<string, unknown>) {
    super(String(details.message ?? 'Falha ao criar doação'));
  }
}
