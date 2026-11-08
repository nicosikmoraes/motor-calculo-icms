import type {
  DonationOpeningReservation,
  DonationOperationId,
  NewDonationOpening,
  VerifiedPaymentConfirmation,
} from '../domain/donation-persistence.js';

export interface DonationRepository {
  reserveOpening(opening: NewDonationOpening): Promise<DonationOpeningReservation | null>;
  releaseOpening(operation: DonationOperationId): Promise<boolean>;
  confirmPayment(confirmation: VerifiedPaymentConfirmation): Promise<boolean>;
}
