import type { PrismaClient } from '../../../generated/prisma/client.js';
import type {
  DonationOpeningReservation,
  DonationOperationId,
  NewDonationOpening,
  VerifiedPaymentConfirmation,
} from '../../domain/donation-persistence.js';
import type { DonationRepository } from '../../ports/donation-repository.js';

export class PrismaDonationRepository implements DonationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findPaymentForWebhook(orderId: string, paymentId: string, _checkoutSessionId: string) {
    const rows = await this.prisma.$queryRaw<Array<{
      orderId: string; paymentId: string; amount: string; currency: 'BRL'; checkoutSessionId: string | null; paymentIntentId: string | null;
      sessionLinkedElsewhere: boolean;
    }>>`
      SELECT o.id::text AS "orderId", p.id::text AS "paymentId", o.amount::text AS amount,
        o.currency::text AS currency, p.checkout_session_id AS "checkoutSessionId", p.payment_intent_id AS "paymentIntentId",
        EXISTS (SELECT 1 FROM payments linked WHERE linked.checkout_session_id = ${_checkoutSessionId}
          AND (linked.order_id <> o.id OR linked.id <> p.id)) AS "sessionLinkedElsewhere"
      FROM donation_orders o
      JOIN payments p ON p.order_id = o.id
      WHERE o.id = ${orderId}::uuid AND p.id = ${paymentId}::uuid
      LIMIT 1
    `;
    const row = rows[0];
    if (!row || row.currency !== 'BRL') return null;
    const amountInCents = decimalToCents(row.amount);
    if (amountInCents === null) return null;
    return { orderId: row.orderId, paymentId: row.paymentId, amountInCents,
      currency: row.currency, checkoutSessionId: row.checkoutSessionId, paymentIntentId: row.paymentIntentId,
      sessionLinkedElsewhere: row.sessionLinkedElsewhere };
  }

  async recordPaymentFailure(input: { orderId: string; paymentId: string; paymentIntentId: string; stripeEventId: string; occurredAt: Date }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const inserted = await tx.paymentEvent.createMany({ data: [{ orderId: input.orderId, paymentId: input.paymentId,
        stripeEventId: input.stripeEventId, origin: 'webhook', toStatus: null, reason: 'EVENTO_EM_PROCESSAMENTO',
        occurredAt: input.occurredAt }], skipDuplicates: true });
      if (inserted.count === 0) return;
      const updated = await tx.payment.updateMany({ where: { id: input.paymentId, orderId: input.orderId,
        status: { not: 'paga' }, OR: [{ paymentIntentId: input.paymentIntentId }, { paymentIntentId: null }] },
        data: { status: 'recusada', paymentIntentId: input.paymentIntentId, reason: 'RECUSA_CARTAO' } });
      await tx.paymentEvent.updateMany({ where: { stripeEventId: input.stripeEventId }, data: {
        toStatus: updated.count ? 'recusada' : null, reason: updated.count ? 'RECUSA_CARTAO' : 'RECUSA_APOS_CONFIRMACAO' } });
    });
  }

  async recordSessionExpiration(input: { orderId: string; paymentId: string; checkoutSessionId: string; stripeEventId: string; occurredAt: Date }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const inserted = await tx.paymentEvent.createMany({ data: [{ orderId: input.orderId, paymentId: input.paymentId,
        stripeEventId: input.stripeEventId, origin: 'webhook', toStatus: null, reason: 'EVENTO_EM_PROCESSAMENTO',
        occurredAt: input.occurredAt }], skipDuplicates: true });
      if (inserted.count === 0) return;
      const updated = await tx.payment.updateMany({ where: { id: input.paymentId, orderId: input.orderId,
        checkoutSessionId: input.checkoutSessionId, status: { not: 'paga' } }, data: { status: 'expirada', reason: 'SESSAO_EXPIRADA' } });
      await tx.paymentEvent.updateMany({ where: { stripeEventId: input.stripeEventId }, data: {
        toStatus: updated.count ? 'expirada' : null, reason: updated.count ? 'SESSAO_EXPIRADA' : 'EXPIRACAO_APOS_CONFIRMACAO' } });
    });
  }

  async recordWebhookDivergence({ orderId, paymentId, stripeEventId, reason }: {
    orderId: string; paymentId: string; stripeEventId: string; reason: string;
  }): Promise<void> {
    await this.prisma.paymentEvent.create({ data: {
      orderId,
      paymentId,
      stripeEventId,
      origin: 'webhook',
      toStatus: null,
      reason,
    } });
  }

  async reserveOpening({
    orderId,
    operationKey,
    fingerprint,
    stripeIdempotencyKey,
  }: NewDonationOpening): Promise<DonationOpeningReservation | null> {
    return this.prisma.$transaction(async (tx) => {
      // Serializa a aquisição por pedido. A reserva permanece após o commit.
      const orders = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM donation_orders
        WHERE id = ${orderId}::uuid AND status = 'pendente'
        FOR NO KEY UPDATE
      `;
      if (orders.length === 0 || await tx.donationOpeningReservation.findUnique({ where: { orderId } })) {
        return null;
      }

      const payment = await tx.payment.create({
        data: { orderId, stripeIdempotencyKey },
        select: { id: true },
      });
      await tx.donationOperation.create({
        data: { orderId, operationKey, fingerprint, paymentId: payment.id },
      });
      await tx.donationOpeningReservation.create({ data: { orderId, operationKey } });
      return { orderId, operationKey, paymentId: payment.id };
    });
  }

  async releaseOpening({ orderId, operationKey }: DonationOperationId): Promise<boolean> {
    const result = await this.prisma.donationOpeningReservation.deleteMany({
      where: { orderId, operationKey },
    });
    return result.count === 1;
  }

  async confirmPayment({
    orderId,
    paymentId,
    checkoutSessionId,
    paymentIntentId,
    stripeEventId,
    confirmedAt,
  }: VerifiedPaymentConfirmation): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const lockedOrder = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM donation_orders WHERE id = ${orderId}::uuid FOR NO KEY UPDATE`;
      if (lockedOrder.length === 0) return false;
      const payment = await tx.payment.updateMany({
        where: {
          id: paymentId,
          orderId,
          status: { not: 'paga' },
          OR: [{ checkoutSessionId }, { checkoutSessionId: null }],
          ...(paymentIntentId !== undefined && {
            AND: { OR: [{ paymentIntentId }, { paymentIntentId: null }] },
          }),
        },
        data: {
          status: 'paga',
          checkoutSessionId,
          paymentIntentId,
          confirmedAt,
        },
      });
      if (payment.count === 0) return false;

      await tx.donationOrder.updateMany({
        where: { id: orderId, status: 'pendente' },
        data: { status: 'pago', confirmedAt },
      });
      await tx.paymentEvent.create({
        data: {
          orderId,
          paymentId,
          stripeEventId,
          origin: 'webhook',
          toStatus: 'paga',
          occurredAt: confirmedAt,
        },
      });
      return true;
    });
  }
}

function decimalToCents(amount: string): string | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount);
  if (!match) return null;
  const whole = match[1].replace(/^0+(?=\d)/, '');
  return `${whole}${(match[2] ?? '').padEnd(2, '0')}`.replace(/^0+(?=\d)/, '');
}
