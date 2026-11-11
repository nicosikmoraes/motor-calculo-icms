import { createHash, createHmac } from 'node:crypto';
import { DonationOperationConflictError, type DonationCreationRepository, type PersistedDonationOpening } from '../ports/donation-creation-repository.js';
import type { StripeCheckoutGateway } from '../ports/stripe-checkout-gateway.js';
import { StripeUnavailableError } from '../ports/stripe-checkout-gateway.js';

export interface DonationCreationConfiguration {
  stripeSecretKey?: string;
  successUrl?: string;
  cancelUrl?: string;
  identitySecret?: string;
}

export type DonationCreationFailureCode =
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

const amountPattern = /^\d+(?:\.\d{1,2})?$/;
const invalidMessage = 'Informe um valor em reais de pelo menos R$ 0,50, com até duas casas decimais';
type DonationCreationResult = { donation: Record<string, unknown>; replayed: boolean };
const inFlightCreations = new Map<string, { fingerprint: string; promise: Promise<DonationCreationResult> }>();

export function parseDonationAmount(value: unknown): { decimal: string; cents: string } | null {
  if (typeof value !== 'string' || !amountPattern.test(value)) return null;
  const [wholeInput, fraction = ''] = value.split('.');
  const whole = wholeInput.replace(/^0+(?=\d)/, '');
  const decimal = `${whole}.${fraction.padEnd(2, '0')}`;
  const cents = `${whole}${fraction.padEnd(2, '0')}`.replace(/^0+(?=\d)/, '');
  if (BigInt(cents) < 50n) return null;
  return { decimal, cents };
}

export function validateCreateDonationBody(body: unknown): { amount: string; cents: string } {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new DonationCreationError('invalid_input', { message: invalidMessage, field: 'amount' });
  }
  const names = Object.getOwnPropertyNames(body);
  const allowed = new Set(['amount', 'currency']);
  if (names.some((name) => !allowed.has(name))) {
    throw new DonationCreationError('invalid_input', { message: invalidMessage, field: 'amount' });
  }
  const input = body as Record<string, unknown>;
  const parsed = parseDonationAmount(input.amount);
  if (!parsed || input.currency !== 'BRL') {
    throw new DonationCreationError('invalid_input', { message: invalidMessage, field: !parsed ? 'amount' : 'currency' });
  }
  return { amount: parsed.decimal, cents: parsed.cents };
}

function safeIdentity(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value).digest('hex');
}

function safeStripeReason(error: unknown): string | null {
  const value = error as { code?: unknown; raw?: { code?: unknown }; type?: unknown };
  const code = typeof value?.code === 'string' ? value.code : typeof value?.raw?.code === 'string' ? value.raw.code : '';
  if (/^amount_(?:too_large|too_small)$/.test(code) || /^currency_(?:not_supported|invalid)$/.test(code)) {
    return 'VALOR_NAO_ACEITO';
  }
  return null;
}

export class CreateDonation {
  constructor(
    private readonly repository: DonationCreationRepository,
    private readonly gateway: StripeCheckoutGateway,
    private readonly config: DonationCreationConfiguration,
  ) {}

  async execute(headers: { intent: unknown; operation: unknown }, body: unknown) {
    const parsed = validateCreateDonationBody(body);
    if (typeof headers.intent !== 'string' || headers.intent.length < 16 || headers.intent.length > 256
      || typeof headers.operation !== 'string' || headers.operation.length < 16 || headers.operation.length > 256) {
      throw new DonationCreationError('invalid_input', { message: 'Informe uma chave de intenção e uma identidade de operação válidas' });
    }
    const secret = this.config.stripeSecretKey;
    const successUrl = this.config.successUrl;
    const cancelUrl = this.config.cancelUrl;
    if (typeof secret !== 'string' || !isTestStripeKey(secret) || !successUrl || !cancelUrl
      || !isSafeReturnUrl(successUrl) || !isSafeReturnUrl(cancelUrl)) {
      throw new DonationCreationError('service_unavailable', { message: 'Serviço de doações indisponível. Tente novamente mais tarde' });
    }
    const hashSecret = this.config.identitySecret ?? secret;
    const flightKey = `${createHash('sha256').update(headers.intent).digest('hex')}:${safeIdentity(hashSecret, headers.operation)}`;
    const existingFlight = inFlightCreations.get(flightKey);
    const fingerprint = createHash('sha256').update(`${parsed.amount}:BRL`).digest('hex');
    if (existingFlight) {
      if (existingFlight.fingerprint !== fingerprint) throw new DonationOperationConflictError();
      return existingFlight.promise.then((result) => ({ ...result, replayed: true }));
    }
    const execution = this.open(headers.intent, headers.operation, parsed, successUrl, cancelUrl, hashSecret);
    const flight = { fingerprint, promise: execution };
    inFlightCreations.set(flightKey, flight);
    try { return await execution; }
    finally { if (inFlightCreations.get(flightKey) === flight) inFlightCreations.delete(flightKey); }
  }

  private async open(intent: string, operation: string, parsed: { amount: string; cents: string }, successUrl: string, cancelUrl: string, hashSecret: string) {
    const stripeIdempotencyKey = `donation_${safeIdentity(hashSecret, operation)}`;
    let opening: PersistedDonationOpening;
    try {
      opening = await this.repository.createIntent({
        intentKeyHash: createHash('sha256').update(intent).digest('hex'),
        amount: parsed.amount,
        operationKeyHash: safeIdentity(hashSecret, operation),
        fingerprint: createHash('sha256').update(`${parsed.amount}:BRL`).digest('hex'),
        stripeIdempotencyKey,
        firstSentAt: new Date(),
        amountInCents: parsed.cents,
        successUrl,
        cancelUrl,
      });
    } catch (error) {
      if (error instanceof DonationOperationConflictError) throw error;
      throw new DonationCreationError('service_unavailable', { message: 'Serviço de doações indisponível. Tente novamente mais tarde' });
    }

    if (opening.checkoutSessionId) {
      try {
        const session = await this.gateway.retrieveCheckout(opening.checkoutSessionId);
        const matches = session.id === opening.checkoutSessionId && session.orderId === opening.orderId
          && session.paymentId === opening.paymentId && session.amountInCents === opening.amountInCents
          && session.currency === 'brl' && !session.livemode;
        if (!matches) throw new Error('Checkout recuperado não corresponde à operação persistida');
        if (session.status === 'open' && session.url) {
          return { donation: { orderId: opening.orderId, paymentId: opening.paymentId, amount: opening.amount, currency: opening.currency,
            status: 'pendente', checkoutUrl: session.url }, replayed: true };
        }
        throw new DonationCreationError('result_uncertain', { orderId: opening.orderId, paymentId: opening.paymentId,
          status: 'pendente', message: 'Aguardando confirmação do pagamento' });
      } catch (error) {
        if (error instanceof DonationCreationError) throw error;
        throw new DonationCreationError('result_uncertain', { orderId: opening.orderId, paymentId: opening.paymentId,
          status: 'indeterminada', message: 'Pagamento em verificação; nenhuma nova tentativa foi aberta' });
      }
    }
    if (opening.status === 'falha_na_criacao') {
      throw new DonationCreationError('gateway_rejected_amount', { orderId: opening.orderId, paymentId: opening.paymentId,
        status: opening.status, reason: 'VALOR_NAO_ACEITO', message: 'Valor não aceito pelo serviço de pagamentos' });
    }
    if (Date.now() >= opening.firstSentAt.getTime() + 24 * 60 * 60 * 1000) {
      throw new DonationCreationError('result_uncertain', { orderId: opening.orderId, paymentId: opening.paymentId,
        status: 'indeterminada', message: 'Pagamento em verificação; nenhuma nova tentativa foi aberta' });
    }

    try {
      const session = await this.gateway.createCheckout({
        amountInCents: opening.amountInCents, currency: 'brl', orderId: opening.orderId,
        paymentId: opening.paymentId, idempotencyKey: opening.stripeIdempotencyKey,
        successUrl: opening.successUrl, cancelUrl: opening.cancelUrl,
      });
      if (!session.url) throw new Error('Checkout sem URL');
      await this.repository.recordCheckout({ ...opening, checkoutSessionId: session.id,
        paymentIntentId: session.paymentIntentId, checkoutUrl: session.url });
      return { donation: { orderId: opening.orderId, paymentId: opening.paymentId, amount: opening.amount,
        currency: opening.currency, status: 'pendente', checkoutUrl: session.url }, replayed: !opening.isNew };
    } catch (error) {
      const rejection = safeStripeReason(error);
      if (rejection) {
        await this.repository.recordCreationFailure({ ...opening, reason: rejection });
        throw new DonationCreationError('gateway_rejected_amount', { orderId: opening.orderId, paymentId: opening.paymentId,
          status: 'falha_na_criacao', reason: rejection, message: 'Valor não aceito pelo serviço de pagamentos' });
      }
      const unavailable = error instanceof StripeUnavailableError;
      await this.repository.recordIndeterminate({ ...opening, reason: unavailable ? 'STRIPE_HTTP_503' : 'RESULTADO_INCERTO' });
      throw new DonationCreationError(unavailable ? 'stripe_unavailable' : 'result_uncertain', {
        orderId: opening.orderId, paymentId: opening.paymentId, status: 'indeterminada',
        reason: unavailable ? 'STRIPE_HTTP_503' : 'RESULTADO_INCERTO',
        message: unavailable ? 'Serviço de pagamentos indisponível. Consulte o pedido antes de tentar novamente'
          : 'Não foi possível confirmar a abertura do pagamento. Consulte o pedido antes de tentar novamente',
      });
    }
  }
}

export function isTestStripeKey(secret: string | undefined): boolean {
  return typeof secret === 'string' && /^sk_test_[A-Za-z0-9_]+$/.test(secret)
}

export function isSafeReturnUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.length > 0;
  } catch { return false; }
}
