import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { AdminDonationOrder, AdminDonationsQuery } from '../../ports/admin-donations-query.js';

export class PrismaAdminDonationsQuery implements AdminDonationsQuery {
  constructor(private readonly prisma: PrismaClient) {}

  listRecent(limit: number): Promise<AdminDonationOrder[]> {
    // LEFT JOIN: pedidos antigos, sem dono, também aparecem (com ownerEmail nulo).
    return this.prisma.$queryRaw<AdminDonationOrder[]>`
      SELECT o.id::text AS "orderId", o.amount::text AS amount, o.currency::text AS currency, o.status::text AS status,
        o.created_at AS "createdAt", u.email AS "ownerEmail"
      FROM donation_orders o
      LEFT JOIN users u ON u.id = o.user_id
      ORDER BY o.created_at DESC, o.id
      LIMIT ${limit}
    `;
  }
}
