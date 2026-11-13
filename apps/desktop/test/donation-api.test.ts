import { describe, expect, it } from 'vitest'
import { readDonationResponse } from '../src/main/donation-api'

const order = { orderId: 'pedido-1', paymentId: 'pagamento-1', amount: '10.00', currency: 'BRL', status: 'pendente',
  checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_1' }

describe('leitura das respostas da API de doações', () => {
  it('entrega o pedido que vem dentro de data', () => {
    expect(readDonationResponse(201, '/donation-orders', { data: order })).toEqual(order)
    expect(readDonationResponse(200, '/donation-orders/current', { data: { ...order, status: 'pago' } }))
      .toMatchObject({ orderId: 'pedido-1', status: 'pago' })
  })

  it('trata 404 do pedido atual como "nenhum pedido ainda"', () => {
    expect(readDonationResponse(404, '/donation-orders/current',
      { error: { statusCode: 404, message: 'Pedido não encontrado' } })).toBeNull()
  })

  it('devolve o erro de entrada com o campo que a API apontou', () => {
    expect(readDonationResponse(422, '/donation-orders',
      { error: { statusCode: 422, message: 'Informe um valor em reais', field: 'amount' } }))
      .toEqual({ kind: 'invalid_input', field: 'amount', message: 'Informe um valor em reais' })
  })

  it('devolve o pedido recusado pelo Stripe com o motivo VALOR_NAO_ACEITO', () => {
    expect(readDonationResponse(422, '/donation-orders', { error: { statusCode: 422, orderId: 'pedido-1',
      paymentId: 'pagamento-1', status: 'falha_na_criacao', reason: 'VALOR_NAO_ACEITO', message: 'Valor não aceito' } }))
      .toEqual({ orderId: 'pedido-1', paymentId: 'pagamento-1', status: 'falha_na_criacao', reason: 'VALOR_NAO_ACEITO',
        message: 'Valor não aceito' })
  })

  it('transforma o 202 incerto em aviso com a mensagem que veio em data', () => {
    expect(() => readDonationResponse(202, '/donation-orders', { data: { ...order, status: 'indeterminada',
      message: 'Pagamento em verificação; nenhuma nova tentativa foi aberta' } }))
      .toThrow('Pagamento em verificação; nenhuma nova tentativa foi aberta')
  })

  it('usa a mensagem do erro da API e cai numa mensagem própria quando não há corpo', () => {
    expect(() => readDonationResponse(503, '/donation-orders',
      { error: { statusCode: 503, message: 'Serviço de doações indisponível. Tente novamente mais tarde' } }))
      .toThrow('Serviço de doações indisponível. Tente novamente mais tarde')
    expect(() => readDonationResponse(500, '/donation-orders', null)).toThrow('Não foi possível retomar o pagamento agora')
  })

  it('não aceita mais o objeto na raiz, do formato antigo', () => {
    expect(() => readDonationResponse(200, '/donation-orders/current', order)).toThrow()
  })
})
