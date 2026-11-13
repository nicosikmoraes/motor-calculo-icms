import { describe, expect, it } from 'vitest'
import { allowedDonationCheckoutUrl } from '../src/main/donation-checkout'

describe('abertura restrita de Checkout', () => {
  it('aceita apenas links HTTPS de Checkout hospedado do Stripe', () => {
    expect(allowedDonationCheckoutUrl('https://checkout.stripe.com/c/pay/cs_test_123'))
      .toBe('https://checkout.stripe.com/c/pay/cs_test_123')
  })

  it.each([
    'http://checkout.stripe.com/c/pay/cs_test_123',
    'https://checkout.stripe.com.evil.test/c/pay/cs_test_123',
    'https://checkout.stripe.com:8443/c/pay/cs_test_123',
    'https://user:secret@checkout.stripe.com/c/pay/cs_test_123',
    'https://evil.test/c/pay/cs_test_123',
    'https://checkout.stripe.com/redirect?url=https://evil.test',
    'javascript:alert(1)',
    'not a URL',
  ])('rejeita URL fora da origem e do caminho permitido: %s', (url) => {
    expect(allowedDonationCheckoutUrl(url)).toBeNull()
  })
})
