import type { PrismaClient } from '../../../generated/prisma/client.js';
import { DonationOperationConflictError, type DonationCreationRepository, type NewDonationIntent, type PersistedDonationOpening } from '../../ports/donation-creation-repository.js';

export class PrismaDonationCreationRepository implements DonationCreationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createIntent(input: NewDonationIntent): Promise<PersistedDonationOpening> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.intentKeyHash}))`;
      const existing = await tx.$queryRaw<Array<{
        orderId: string; amount: string; currency: 'BRL'; paymentId: string; fingerprint: string;
        stripeIdempotencyKey: string; firstSentAt: Date | null; checkoutParameters: any; checkoutSessionId: string | null;
        checkoutUrl: string | null; status: string;
      }>>`
        SELECT o.id::text AS "orderId", o.amount::text AS amount, o.currency::text AS currency,
          p.id::text AS "paymentId", op.fingerprint, p.stripe_idempotency_key AS "stripeIdempotencyKey",
          p.first_sent_at AS "firstSentAt", p.checkout_parameters AS "checkoutParameters",
          p.checkout_session_id AS "checkoutSessionId", p.checkout_url AS "checkoutUrl", p.status::text AS status
        FROM donation_orders o
        JOIN donation_operations op ON op.order_id = o.id AND op.operation_key = ${input.operationKeyHash}
        JOIN payments p ON p.id = op.payment_id
        WHERE o.intent_key_hash = ${input.intentKeyHash}
      `;
      if (existing[0]) {
        const row = existing[0];
        if (row.fingerprint !== input.fingerprint) throw new DonationOperationConflictError();
        const snapshot = row.checkoutParameters as { amountInCents: string; successUrl: string; cancelUrl: string } | null;
        if (!snapshot || !row.firstSentAt) throw new Error('Snapshot da operação de doação ausente');
        return { isNew: false, orderId: row.orderId, paymentId: row.paymentId, amount: row.amount, currency: row.currency,
          amountInCents: snapshot.amountInCents, stripeIdempotencyKey: row.stripeIdempotencyKey, firstSentAt: row.firstSentAt,
          successUrl: snapshot.successUrl, cancelUrl: snapshot.cancelUrl, checkoutSessionId: row.checkoutSessionId,
          checkoutUrl: row.checkoutUrl, status: row.status };
      }
      const [order] = await tx.$queryRaw<Array<{ id: string; amount: string; currency: 'BRL' }>>`
        INSERT INTO donation_orders (intent_key_hash, amount, currency)
        VALUES (${input.intentKeyHash}, ${input.amount}::numeric, 'BRL')
        RETURNING id::text, amount::text, currency::text
      `;
      const payment = await tx.payment.create({
        data: {
          orderId: order.id,
          stripeIdempotencyKey: input.stripeIdempotencyKey,
          firstSentAt: input.firstSentAt,
          checkoutParameters: { amountInCents: input.amountInCents, currency: 'brl', successUrl: input.successUrl, cancelUrl: input.cancelUrl },
          status: 'pendente',
        },
        select: { id: true },
      });
      await tx.donationOperation.create({
        data: { orderId: order.id, operationKey: input.operationKeyHash,
          fingerprint: input.fingerprint, paymentId: payment.id },
      });
      await tx.donationOpeningReservation.create({
        data: { orderId: order.id, operationKey: input.operationKeyHash },
      });
      return { isNew: true, orderId: order.id, paymentId: payment.id, amount: order.amount, currency: order.currency,
        amountInCents: input.amountInCents, stripeIdempotencyKey: input.stripeIdempotencyKey, firstSentAt: input.firstSentAt,
        successUrl: input.successUrl, cancelUrl: input.cancelUrl, checkoutSessionId: null, checkoutUrl: null, status: 'pendente' };
    });
  }

  async recordCheckout(input: PersistedDonationOpening & { checkoutSessionId: string; paymentIntentId: string | null; checkoutUrl: string | null }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.payment.updateMany({ where: { id: input.paymentId, orderId: input.orderId, status: { not: 'paga' } }, data: {
        checkoutSessionId: input.checkoutSessionId, paymentIntentId: input.paymentIntentId, checkoutUrl: input.checkoutUrl,
        status: 'pendente', reason: null,
      } });
      await tx.donationOpeningReservation.deleteMany({ where: { orderId: input.orderId } });
      if (updated.count) await tx.paymentEvent.create({ data: { orderId: input.orderId, paymentId: input.paymentId,
        origin: 'api', reason: null, toStatus: 'pendente' } });
    });
  }

  async recordIndeterminate(input: PersistedDonationOpening & { reason: string }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const transitioned = await tx.payment.updateMany({
        where: { id: input.paymentId, orderId: input.orderId, status: { not: 'paga' } },
        data: { status: 'indeterminada', reason: input.reason },
      });
      if (transitioned.count === 0) return;
      await tx.paymentEvent.create({ data: { orderId: input.orderId, paymentId: input.paymentId,
        origin: 'api', toStatus: 'indeterminada', reason: input.reason } });
    });
  }

  async recordCreationFailure(input: PersistedDonationOpening & { reason: string }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: input.paymentId }, data: { status: 'falha_na_criacao', reason: input.reason } });
      await tx.donationOpeningReservation.deleteMany({ where: { orderId: input.orderId } });
      await tx.paymentEvent.create({ data: { orderId: input.orderId, paymentId: input.paymentId,
        origin: 'api', toStatus: 'falha_na_criacao', reason: input.reason } });
    });
  }

  async getAuthorizedDonation(orderId: string, intentKeyHash: string) {
    const orders = await this.prisma.$queryRaw<Array<{ orderId: string; amount: string; currency: 'BRL'; status: string }>>`
      SELECT id::text AS "orderId", amount::text AS amount, currency::text AS currency, status::text AS status
      FROM donation_orders WHERE id = ${orderId}::uuid AND intent_key_hash = ${intentKeyHash}
    `;
    const order = orders[0];
    if (!order || order.currency !== 'BRL') return null;
    const attempts = await this.prisma.$queryRaw<Array<{ paymentId: string; status: string; reason: string | null;
      checkoutSessionId: string | null; checkoutUrl: string | null; paymentIntentId: string | null; stripeIdempotencyKey: string;
      operationKeyHash: string | null;
      firstSentAt: Date | null; checkoutParameters: { amountInCents: string; currency: 'brl'; successUrl: string; cancelUrl: string } | null }>>`
      SELECT id::text AS "paymentId", status::text AS status, reason, checkout_session_id AS "checkoutSessionId",
        checkout_url AS "checkoutUrl", payment_intent_id AS "paymentIntentId", stripe_idempotency_key AS "stripeIdempotencyKey",
        first_sent_at AS "firstSentAt", checkout_parameters AS "checkoutParameters", op.operation_key AS "operationKeyHash"
      FROM payments p LEFT JOIN donation_operations op ON op.payment_id = p.id
      WHERE p.order_id = ${orderId}::uuid ORDER BY p.created_at DESC, p.id DESC
    `;
    const events = await this.prisma.$queryRaw<Array<{ paymentId: string; status: string | null; reason: string | null; occurredAt: Date }>>`
      SELECT payment_id::text AS "paymentId", to_status::text AS status, reason, occurred_at AS "occurredAt"
      FROM payment_events WHERE order_id = ${orderId}::uuid ORDER BY occurred_at, id
    `;
    return { ...order, attempts, events };
  }

  async markSessionExpired(input: { orderId: string; paymentId: string; sessionId: string }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.payment.updateMany({ where: { id: input.paymentId, orderId: input.orderId,
        checkoutSessionId: input.sessionId, status: { not: 'paga' } }, data: { status: 'expirada', reason: 'SESSAO_EXPIRADA' } });
      if (updated.count) await tx.paymentEvent.create({ data: { orderId: input.orderId, paymentId: input.paymentId,
        origin: 'gateway', toStatus: 'expirada', reason: 'SESSAO_EXPIRADA' } });
    });
  }

  async recordRetryExpirationFailure(input: { orderId: string; paymentId: string; sessionId: string }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.updateMany({ where: { id: input.paymentId, orderId: input.orderId,
        checkoutSessionId: input.sessionId, status: { not: 'paga' } },
        data: { status: 'indeterminada', reason: 'EXPIRACAO_SESSAO_EXCEDENTE_FALHOU' } });
      await tx.paymentEvent.create({ data: { orderId: input.orderId, paymentId: input.paymentId,
        origin: 'api', toStatus: null, reason: 'EXPIRACAO_SESSAO_EXCEDENTE_FALHOU' } });
    });
  }

  async createRetry(input: { orderId: string; intentKeyHash: string; currentPaymentId: string; currentStatus: string;
    operationKeyHash: string; fingerprint: string; stripeIdempotencyKey: string; firstSentAt: Date }): Promise<PersistedDonationOpening | null> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM donation_orders WHERE id = ${input.orderId}::uuid FOR NO KEY UPDATE`;
      const [order] = await tx.$queryRaw<Array<{ orderId: string; amount: string; currency: 'BRL'; status: string }>>`
        SELECT id::text AS "orderId", amount::text AS amount, currency::text AS currency, status::text AS status
        FROM donation_orders WHERE id = ${input.orderId}::uuid AND intent_key_hash = ${input.intentKeyHash}
      `;
      if (!order || order.status !== 'pendente' || await tx.donationOpeningReservation.findUnique({ where: { orderId: input.orderId } })) return null;
      const [latest] = await tx.$queryRaw<Array<{ id: string; status: string; reason: string | null; params: { amountInCents: string; currency: 'brl'; successUrl: string; cancelUrl: string } | null }>>`
        SELECT id::text AS id, status::text AS status, reason, checkout_parameters AS params
        FROM payments WHERE order_id = ${input.orderId}::uuid ORDER BY created_at DESC, id DESC LIMIT 1
      `;
      if (!latest || latest.id !== input.currentPaymentId || latest.status !== input.currentStatus) return null;
      if (!(latest.status === 'expirada' || latest.status === 'falha_na_criacao'
        && latest.reason !== 'VALOR_NAO_ACEITO')) return null;
      const parameters = latest.params;
      if (!parameters) return null;
      const payment = await tx.payment.create({ data: { orderId: input.orderId, stripeIdempotencyKey: input.stripeIdempotencyKey,
        firstSentAt: input.firstSentAt, checkoutParameters: parameters, status: 'pendente' }, select: { id: true } });
      await tx.donationOperation.create({ data: { orderId: input.orderId, operationKey: input.operationKeyHash,
        fingerprint: input.fingerprint, paymentId: payment.id } });
      await tx.donationOpeningReservation.create({ data: { orderId: input.orderId, operationKey: input.operationKeyHash } });
      return { isNew: true, orderId: order.orderId, paymentId: payment.id, amount: order.amount, currency: 'BRL',
        amountInCents: parameters.amountInCents, stripeIdempotencyKey: input.stripeIdempotencyKey, firstSentAt: input.firstSentAt,
        successUrl: parameters.successUrl, cancelUrl: parameters.cancelUrl, checkoutSessionId: null, checkoutUrl: null, status: 'pendente' };
    });
  }
}
