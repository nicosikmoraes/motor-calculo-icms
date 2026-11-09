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
      await tx.payment.update({ where: { id: input.paymentId }, data: {
        checkoutSessionId: input.checkoutSessionId, paymentIntentId: input.paymentIntentId, checkoutUrl: input.checkoutUrl,
      } });
      await tx.donationOpeningReservation.deleteMany({ where: { orderId: input.orderId } });
      await tx.paymentEvent.create({ data: { orderId: input.orderId, paymentId: input.paymentId,
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
}
