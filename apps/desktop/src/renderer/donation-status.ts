export function donationStatusMessage(status: string, reason?: string | null): string {
  if (status === 'pago') return 'Doação confirmada'
  if (status === 'recusada') return 'Pagamento recusado. Você pode tentar novamente.'
  if (status === 'expirada') return 'Sessão expirada. Você pode tentar novamente.'
  if (status === 'indeterminada' && reason === 'STRIPE_HTTP_503') return 'Serviço de pagamentos indisponível. Consulte o pedido antes de tentar novamente'
  if (status === 'indeterminada') return 'Não foi possível confirmar a abertura do pagamento. Consulte o pedido antes de tentar novamente'
  if (status === 'falha_na_criacao' && reason === 'VALOR_NAO_ACEITO') return 'Valor não aceito pelo serviço de pagamentos. Outra quantia exige uma nova intenção.'
  if (status === 'falha_na_criacao') return 'Não foi possível abrir a sessão de pagamento.'
  return 'Aguardando confirmação do pagamento'
}

export function donationRequiresNewIntent(status: string, reason?: string | null): boolean {
  return status === 'falha_na_criacao' && reason === 'VALOR_NAO_ACEITO'
}

export function donationCreatedNotice(status: string): string {
  return status === 'pendente' ? 'Pedido criado. Aguardando confirmação do pagamento.' : ''
}

export function donationCanRetry(status: string, reason?: string | null): boolean {
  if (status === 'falha_na_criacao') return reason !== 'VALOR_NAO_ACEITO'
  return !['pago', 'indeterminada'].includes(status)
}
