import { describe, expect, it } from 'vitest'
import { FORBIDDEN_MESSAGE, readAdminDonationsResponse } from '../src/main/modules/donations/adapters/http/admin-donations-api'

const row = { orderId: 'pedido-1', amount: '25.00', currency: 'BRL', status: 'pago', createdAt: '2026-11-17T12:00:00.000Z', ownerEmail: 'ana@example.test' }

describe('leitura da lista de doações do administrador', () => {
  it('entrega a lista que vem dentro de data', () => {
    expect(readAdminDonationsResponse(200, { data: [row, { ...row, orderId: 'pedido-2', ownerEmail: null }] }))
      .toEqual([row, { ...row, orderId: 'pedido-2', ownerEmail: null }])
  })

  it('CA10: 403 vira a mensagem de permissão, não sessão expirada', () => {
    expect(() => readAdminDonationsResponse(403, { error: { statusCode: 403, message: 'Sem permissão para esta ação' } }))
      .toThrow(FORBIDDEN_MESSAGE)
    expect(FORBIDDEN_MESSAGE).toBe('Sua conta não tem permissão para ver esta página.')
  })

  it('outras falhas ou corpo fora do formato viram mensagem própria', () => {
    expect(() => readAdminDonationsResponse(500, null)).toThrow('Não foi possível carregar as doações agora.')
    expect(() => readAdminDonationsResponse(200, { data: 'não é lista' })).toThrow('Não foi possível carregar as doações agora.')
    expect(() => readAdminDonationsResponse(200, [row])).toThrow('Não foi possível carregar as doações agora.')
  })
})
