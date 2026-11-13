import { describe, expect, it } from 'vitest'
import { allowedDonationCheckoutUrl } from '../src/main/donation-checkout'

describe('abertura restrita de Checkout', () => {
  it('aceita apenas links HTTPS de Checkout hospedado do Stripe', () => {
    expect(allowedDonationCheckoutUrl('https://checkout.stripe.com/c/pay/cs_test_123'))
      .toBe('https://checkout.stripe.com/c/pay/cs_test_123')
  })

  it('aceita o formato /g/pay/ que o Stripe devolveu na demonstração, com o fragmento intacto', () => {
    const real = 'https://checkout.stripe.com/g/pay/cs_test_a0hLEQrtntzJOr6lLxADMOQR1N2IWY8jPi8RQUsQ7jCyxBXj8vJRAa66dK'
      + '#fidnandhYHdWcXxpYCc%2FJ2FgY2RwaXEnKSdicyc%2FNiknZHVsTmB8Jz8ndW5acWB2cVowNFBVMEZyRjBCZzFKS0IwUl9RXDVTcWhJYUFNQFVu'
    expect(allowedDonationCheckoutUrl(real)).toBe(real)
  })

  it.each([
    'http://checkout.stripe.com/c/pay/cs_test_123',
    'https://checkout.stripe.com.evil.test/c/pay/cs_test_123',
    'https://checkout.stripe.com:8443/c/pay/cs_test_123',
    'https://user:secret@checkout.stripe.com/c/pay/cs_test_123',
    'https://evil.test/c/pay/cs_test_123',
    'https://checkout.stripe.com/redirect?url=https://evil.test',
    'https://checkout.stripe.com/x/pay/cs_test_123',
    'https://checkout.stripe.com/g/pay/',
    'https://checkout.stripe.com/g/pay/not_a_session',
    'https://checkout.stripe.com/g/pay/cs_test_123/../../redirect',
    'javascript:alert(1)',
    'not a URL',
  ])('rejeita URL fora da origem e do caminho permitido: %s', (url) => {
    expect(allowedDonationCheckoutUrl(url)).toBeNull()
  })
})
