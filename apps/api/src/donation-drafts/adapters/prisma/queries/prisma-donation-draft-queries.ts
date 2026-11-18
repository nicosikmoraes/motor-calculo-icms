import type { PrismaClient } from '../../../../generated/prisma/client.js';
import type { DonationDraft, DonationDraftQueries } from '../../../ports/donation-draft-store.js';
import { draftFields, publicDraft } from '../donation-draft-row.js';

export class PrismaDonationDraftQueries implements DonationDraftQueries {
  constructor(private readonly prisma: PrismaClient) {}

  async list(userId: string): Promise<DonationDraft[] | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        donationDrafts: {
          select: draftFields,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        },
      },
    });
    return user?.donationDrafts.map(publicDraft) ?? null;
  }

  async find(userId: string, id: string): Promise<DonationDraft | null> {
    const row = await this.prisma.donationDraft.findUnique({ where: { id, userId }, select: draftFields });
    return row ? publicDraft(row) : null;
  }
}
