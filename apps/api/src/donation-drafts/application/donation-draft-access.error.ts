export class DonationDraftAccessError extends Error {
  constructor(readonly code: 'account-not-found' | 'draft-not-found') {
    super(code === 'account-not-found' ? 'Não autenticado' : 'Rascunho de doação não encontrado');
  }
}
