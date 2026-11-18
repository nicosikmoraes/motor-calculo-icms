export interface NewDonationIntent {
  /** Dono do pedido: o `sub` do token de quem chama, nunca um campo do corpo (US11). */
  ownerId: string;
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

/** A chave de intenção já pertence a um pedido de outra pessoa (ou a um pedido antigo, sem dono). */
export class DonationIntentTakenError extends Error {
  constructor() { super('Esta chave de intenção já pertence a outro pedido'); }
}

/** O dono do token não existe mais no banco (ex.: banco recriado): é um problema de autenticação, não de serviço. */
export class DonationOwnerNotFoundError extends Error {
  constructor() { super('Dono do pedido não encontrado'); }
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
  markSessionExpired(input: { orderId: string; paymentId: string; sessionId: string }): Promise<void>;
  recordRetryExpirationFailure(input: { orderId: string; paymentId: string; sessionId: string }): Promise<void>;
  createRetry(input: { ownerId: string; orderId: string; intentKeyHash: string; currentPaymentId: string; currentStatus: string;
    operationKeyHash: string; fingerprint: string; stripeIdempotencyKey: string; firstSentAt: Date }): Promise<PersistedDonationOpening | null>;
}

export const DONATION_CREATION_REPOSITORY = Symbol('DONATION_CREATION_REPOSITORY');
