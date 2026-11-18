import type { PrismaClient } from '../../../../generated/prisma/client.js';
import type { DonationOrderQueries, OwnedDonationOrder } from '../../../ports/donation-order-queries.js';

export class PrismaDonationOrderQueries implements DonationOrderQueries {
  constructor(private readonly prisma: PrismaClient) {}

  async getOrderIdByIntentHash(intentKeyHash: string, ownerId: string): Promise<string | null> {
    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id::text AS id FROM donation_orders WHERE intent_key_hash = ${intentKeyHash} AND user_id = ${ownerId}::uuid LIMIT 1
    `;
    return rows[0]?.id ?? null;
  }

  async getAuthorizedDonation(orderId: string, intentKeyHash: string, ownerId: string): Promise<OwnedDonationOrder | null> {
    const orders = await this.prisma.$queryRaw<Array<Omit<OwnedDonationOrder, 'attempts' | 'events'>>>`
      SELECT id::text AS "orderId", amount::text AS amount, currency::text AS currency, status::text AS status
      FROM donation_orders WHERE id = ${orderId}::uuid AND intent_key_hash = ${intentKeyHash} AND user_id = ${ownerId}::uuid
    `;
    const order = orders[0];
    if (!order || order.currency !== 'BRL') return null;
    const attempts = await this.prisma.$queryRaw<OwnedDonationOrder['attempts']>`
      SELECT id::text AS "paymentId", status::text AS status, reason, checkout_session_id AS "checkoutSessionId",
        checkout_url AS "checkoutUrl", payment_intent_id AS "paymentIntentId", stripe_idempotency_key AS "stripeIdempotencyKey",
        first_sent_at AS "firstSentAt", checkout_parameters AS "checkoutParameters", op.operation_key AS "operationKeyHash"
      FROM payments p LEFT JOIN donation_operations op ON op.payment_id = p.id
      WHERE p.order_id = ${orderId}::uuid ORDER BY p.created_at DESC, p.id DESC
    `;
    const events = await this.prisma.$queryRaw<OwnedDonationOrder['events']>`
      SELECT payment_id::text AS "paymentId", to_status::text AS status, reason, occurred_at AS "occurredAt"
      FROM payment_events WHERE order_id = ${orderId}::uuid ORDER BY occurred_at, id
    `;
    return { ...order, attempts, events };
  }
}
