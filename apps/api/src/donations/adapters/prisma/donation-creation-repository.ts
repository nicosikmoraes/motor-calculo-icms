import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { DonationCreationRepository, NewDonationIntent, PersistedDonationOpening } from '../../ports/donation-creation-repository.js';

export class PrismaDonationCreationRepository implements DonationCreationRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createIntent(input: NewDonationIntent): Promise<PersistedDonationOpening> {
    return this.prisma.$transaction(async (tx) => {
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
      return { orderId: order.id, paymentId: payment.id, amount: order.amount, currency: order.currency };
    });
  }

  async recordCheckout(input: PersistedDonationOpening & { checkoutSessionId: string; paymentIntentId: string | null; checkoutUrl: string | null }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: input.paymentId }, data: {
        checkoutSessionId: input.checkoutSessionId, paymentIntentId: input.paymentIntentId,
      } });
      await tx.donationOpeningReservation.deleteMany({ where: { orderId: input.orderId } });
      await tx.paymentEvent.create({ data: { orderId: input.orderId, paymentId: input.paymentId,
        origin: 'api', reason: null, toStatus: 'pendente' } });
    });
  }

  async recordIndeterminate(input: PersistedDonationOpening & { reason: string }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: input.paymentId }, data: { status: 'indeterminada', reason: input.reason } });
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
