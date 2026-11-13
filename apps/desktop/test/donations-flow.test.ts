import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DesktopApi, DonationOrderSummary } from '@motor/contracts'
import { createDonation, loadCurrentDonation, retryDonation, startNewDonationIntent } from '../src/renderer/services/donations'
import { donationCanRetry, donationCreatedNotice, donationRequiresNewIntent, donationStatusMessage } from '../src/renderer/donation-status'

const store = new Map<string, string>()
const donation: DonationOrderSummary = { orderId: '00000000-0000-4000-8000-000000000001', amount: '10.00', currency: 'BRL', status: 'pendente' }
const api = {
  getCurrentDonation: vi.fn(), createDonation: vi.fn(), retryDonation: vi.fn(), openDonationCheckout: vi.fn(),
} as unknown as DesktopApi

beforeEach(() => {
  store.clear()
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value) },
    removeItem: (key: string) => { store.delete(key) },
  })
  vi.stubGlobal('window', { desktopApi: api })
  vi.stubGlobal('crypto', { randomUUID: vi.fn().mockReturnValueOnce('intent-1234567890123456').mockReturnValue('operation-123456789012') })
  vi.mocked(api.getCurrentDonation).mockResolvedValue(null)
  vi.mocked(api.createDonation).mockResolvedValue(donation)
  vi.mocked(api.retryDonation).mockResolvedValue(donation)
})

afterEach(() => vi.unstubAllGlobals())

describe('retomada da área de apoio', () => {
  it('recupera por GET current após perder a resposta e reabrir a área com a intenção persistida', async () => {
    vi.mocked(api.createDonation).mockRejectedValueOnce(new Error('offline'))
    await expect(createDonation('10.00')).rejects.toThrow('offline')
    const savedBeforeRestart = JSON.parse(store.get('contabilinico.donations.intent.v1')!)
    vi.mocked(api.getCurrentDonation).mockImplementation(async (intent) => {
      expect(store.has('contabilinico.donations.intent.v1')).toBe(true)
      return intent === savedBeforeRestart.intent ? donation : null
    })

    // loadCurrentDonation is stateless: a fresh renderer reconstructs its request from localStorage.
    await expect(loadCurrentDonation()).resolves.toEqual(donation)
    expect(api.getCurrentDonation).toHaveBeenCalledWith(savedBeforeRestart.intent)
    expect(JSON.parse(store.get('contabilinico.donations.intent.v1')!).intent).toBe(savedBeforeRestart.intent)
  })

  it('mantém a mesma identidade da operação quando a resposta de criação se perde', async () => {
    vi.mocked(api.createDonation).mockRejectedValueOnce(new Error('offline'))
    await expect(createDonation('10.00')).rejects.toThrow('offline')
    const storedAfterLoss = JSON.parse(store.get('contabilinico.donations.intent.v1')!)
    await createDonation('10.00')
    const retryPayload = vi.mocked(api.createDonation).mock.calls[1][0]
    expect(retryPayload).toEqual({ intent: storedAfterLoss.intent, operation: storedAfterLoss.operation, amount: '10.00', currency: 'BRL' })
    expect(store.get('contabilinico.donations.intent.v1')).not.toContain('"operation"')
  })

  it('limpa a identidade da operação quando o servidor rejeita o formato do valor', async () => {
    vi.mocked(api.createDonation).mockResolvedValueOnce({ kind: 'invalid_input', field: 'amount', message: 'Valor inválido' })
    await expect(createDonation('1.234')).resolves.toMatchObject({ kind: 'invalid_input', field: 'amount' })
    expect(store.get('contabilinico.donations.intent.v1')).not.toContain('"operation"')
  })

  it('mantém a identidade da nova tentativa se a resposta de retry se perde', async () => {
    vi.mocked(api.retryDonation).mockRejectedValueOnce(new Error('offline'))
    await expect(retryDonation(donation.orderId)).rejects.toThrow('offline')
    const storedAfterLoss = JSON.parse(store.get('contabilinico.donations.intent.v1')!)
    await retryDonation(donation.orderId)
    expect(api.retryDonation).toHaveBeenNthCalledWith(2, { orderId: donation.orderId,
      intent: storedAfterLoss.intent, operation: storedAfterLoss.operation })
  })

  it('cria outra intenção para corrigir uma quantia recusada sem reaproveitar a chave anterior', async () => {
    await loadCurrentDonation()
    const previous = JSON.parse(store.get('contabilinico.donations.intent.v1')!).intent
    startNewDonationIntent()
    const next = JSON.parse(store.get('contabilinico.donations.intent.v1')!)
    expect(next.intent).not.toBe(previous)
    expect(next.operation).toBeUndefined()
  })
})

describe('mensagens e ações de pagamento', () => {
  it('explica resultado incerto e evita oferecer retry automático', () => {
    expect(donationStatusMessage('indeterminada')).toContain('Não foi possível confirmar a abertura')
    expect(donationCanRetry('indeterminada')).toBe(false)
    expect(donationStatusMessage('indeterminada', 'STRIPE_HTTP_503')).toContain('Consulte o pedido antes de tentar novamente')
  })

  it('orienta valor rejeitado a criar nova intenção e bloqueia retry do mesmo pedido', () => {
    expect(donationRequiresNewIntent('falha_na_criacao', 'VALOR_NAO_ACEITO')).toBe(true)
    expect(donationCanRetry('falha_na_criacao', 'VALOR_NAO_ACEITO')).toBe(false)
    expect(donationCanRetry('falha_na_criacao', 'STRIPE_REJECTION')).toBe(true)
    expect(donationStatusMessage('falha_na_criacao', 'VALOR_NAO_ACEITO')).toContain('Outra quantia exige uma nova intenção')
  })

  it('não anuncia pagamento pendente após falha conclusiva ou resultado incerto', () => {
    expect(donationCreatedNotice('pendente')).toContain('Aguardando confirmação')
    expect(donationCreatedNotice('falha_na_criacao')).toBe('')
    expect(donationCreatedNotice('indeterminada')).toBe('')
  })
})
