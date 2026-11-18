export interface DonationDraft {
  id: string;
  amount: string;
  currency: 'BRL';
  createdAt: Date;
  updatedAt: Date;
}

export interface DonationDraftQueries {
  list(userId: string): Promise<DonationDraft[] | null>;
  find(userId: string, id: string): Promise<DonationDraft | null>;
}

export interface DonationDraftStore {
  create(userId: string, amount: string): Promise<DonationDraft | null>;
  update(userId: string, id: string, amount: string): Promise<DonationDraft | null>;
  remove(userId: string, id: string): Promise<boolean>;
}
