import type { DonationDraft, DonationDraftQueries, DonationDraftStore } from '../ports/donation-draft-store.js';
import { DonationDraftAccessError } from './donation-draft-access.error.js';

export class ManageDonationDrafts {
  constructor(
    private readonly drafts: DonationDraftStore,
    private readonly queries: DonationDraftQueries,
  ) {}

  async create(userId: string, amount: string): Promise<DonationDraft> {
    const draft = await this.drafts.create(userId, amount);
    if (!draft) throw new DonationDraftAccessError('account-not-found');
    return draft;
  }

  async list(userId: string): Promise<DonationDraft[]> {
    const drafts = await this.queries.list(userId);
    if (!drafts) throw new DonationDraftAccessError('account-not-found');
    return drafts;
  }

  async get(userId: string, id: string): Promise<DonationDraft> {
    const draft = await this.queries.find(userId, id);
    if (!draft) throw new DonationDraftAccessError('draft-not-found');
    return draft;
  }

  async update(userId: string, id: string, amount: string): Promise<DonationDraft> {
    const draft = await this.drafts.update(userId, id, amount);
    if (!draft) throw new DonationDraftAccessError('draft-not-found');
    return draft;
  }

  async remove(userId: string, id: string): Promise<void> {
    if (!await this.drafts.remove(userId, id)) {
      throw new DonationDraftAccessError('draft-not-found');
    }
  }
}
