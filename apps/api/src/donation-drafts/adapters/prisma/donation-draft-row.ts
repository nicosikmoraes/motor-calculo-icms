import type { Prisma } from '../../../generated/prisma/client.js';
import type { DonationDraft } from '../../ports/donation-draft-store.js';

export const draftFields = { id: true, amount: true, createdAt: true, updatedAt: true } as const;
type DraftRow = Prisma.DonationDraftGetPayload<{ select: typeof draftFields }>;

export function publicDraft({ id, amount, createdAt, updatedAt }: DraftRow): DonationDraft {
  return { id, amount: amount.toFixed(2), currency: 'BRL', createdAt, updatedAt };
}
