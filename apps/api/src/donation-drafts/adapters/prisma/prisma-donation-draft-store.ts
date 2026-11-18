import { Prisma, type PrismaClient } from '../../../generated/prisma/client.js';
import type { DonationDraft, DonationDraftStore } from '../../ports/donation-draft-store.js';
import { draftFields, publicDraft } from './donation-draft-row.js';

export class PrismaDonationDraftStore implements DonationDraftStore {
  constructor(private readonly prisma: PrismaClient) {}

  async create(userId: string, amount: string): Promise<DonationDraft | null> {
    try {
      const row = await this.prisma.donationDraft.create({ data: { userId, amount }, select: draftFields });
      return publicDraft(row);
    } catch (error) {
      // A única FK desta escrita é a conta associada ao token.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') return null;
      throw error;
    }
  }

  async update(userId: string, id: string, amount: string): Promise<DonationDraft | null> {
    const [row] = await this.prisma.donationDraft.updateManyAndReturn({
      where: { id, userId },
      data: { amount },
      select: draftFields,
    });
    return row ? publicDraft(row) : null;
  }

  async remove(userId: string, id: string): Promise<boolean> {
    const { count } = await this.prisma.donationDraft.deleteMany({ where: { id, userId } });
    return count === 1;
  }
}
