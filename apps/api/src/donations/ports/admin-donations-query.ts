/** Um pedido na lista do administrador (US11). Só o que a spec permite: sem chave de intenção nem dados internos. */
export interface AdminDonationOrder {
  orderId: string;
  amount: string;
  currency: 'BRL';
  status: string;
  createdAt: Date;
  /** E-mail de quem doou; `null` para pedido antigo, criado antes do login. */
  ownerEmail: string | null;
}

export interface AdminDonationsQuery {
  listRecent(limit: number): Promise<AdminDonationOrder[]>;
}

export const ADMIN_DONATIONS_QUERY = Symbol('ADMIN_DONATIONS_QUERY');
