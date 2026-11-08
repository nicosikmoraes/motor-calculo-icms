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
