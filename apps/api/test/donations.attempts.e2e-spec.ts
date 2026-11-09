import { createHmac, randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import Stripe from 'stripe';
import { AppModule } from '../src/app.module.js';
import { DONATION_REPOSITORY } from '../src/donations/ports/donation-repository.js';
import { STRIPE_CHECKOUT_GATEWAY } from '../src/donations/ports/stripe-checkout-gateway.js';
import { STRIPE_CLIENT } from '../src/donations/adapters/stripe/stripe.tokens.js';
import { RetryDonation } from '../src/donations/application/retry-donation.js';

const webhookSecret = 'whsec_attempts_test';

describe('tentativas de doação', () => {
  let app: any;
  let stripe: Stripe;
  let repo: any;
  let gateway: any;
  let retryService: any;
  const orderId = randomUUID();
  const paymentId = randomUUID();

  beforeEach(async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', webhookSecret);
    repo = {
      findPaymentForWebhook: vi.fn(async () => ({ orderId, paymentId, amountInCents: '1234', currency: 'BRL',
        checkoutSessionId: 'cs_attempt', sessionLinkedElsewhere: false })),
      recordWebhookDivergence: vi.fn(async () => undefined),
      recordPaymentFailure: vi.fn(async () => undefined),
      recordSessionExpiration: vi.fn(async () => undefined),
      confirmPayment: vi.fn(async () => true),
    };
    gateway = { retrieveCheckout: vi.fn(async (id: string) => ({ id, url: null, paymentIntentId: null, orderId, paymentId,
      amountInCents: '1234', currency: 'brl', livemode: false, status: 'expired', paymentStatus: 'unpaid' })) };
    retryService = { inspect: vi.fn(async () => ({ orderId, status: 'pendente', attempts: [] })),
      inspectCurrent: vi.fn(async () => ({ orderId, status: 'pendente', attempts: [] })),
      retry: vi.fn(async () => ({ orderId, paymentId, status: 'pendente', reused: true })) };
    stripe = new Stripe('sk_test_attempts');
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DONATION_REPOSITORY).useValue(repo)
      .overrideProvider(STRIPE_CHECKOUT_GATEWAY).useValue(gateway)
      .overrideProvider(RetryDonation).useValue(retryService)
      .overrideProvider(STRIPE_CLIENT).useValue(stripe)
      .compile();
    app = module.createNestApplication({ rawBody: true });
    await app.init();
  });

  afterEach(async () => { await app.close(); vi.unstubAllEnvs(); });

  it('registra recusa somente por evento Stripe assinado e ligado à tentativa', async () => {
    const event = {
      id: `evt_${randomUUID().replaceAll('-', '')}`, object: 'event', api_version: '2025-08-27.basil',
      created: 1794140000, data: { object: {
        id: 'pi_attempt', object: 'payment_intent', livemode: false,
        metadata: { donation_order_id: orderId, donation_payment_id: paymentId },
      } }, livemode: false, pending_webhooks: 1, request: null, type: 'payment_intent.payment_failed',
    };
    const payload = JSON.stringify(event);
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
    const accepted = await request(app.getHttpServer()).post('/webhooks/stripe').set('Content-Type', 'application/json')
      .set('Stripe-Signature', signature).send(payload);

    expect(accepted.status).toBe(200);
    expect(repo.recordPaymentFailure).toHaveBeenCalledWith(expect.objectContaining({
      orderId, paymentId, paymentIntentId: 'pi_attempt', stripeEventId: event.id,
    }));
    expect(repo.confirmPayment).not.toHaveBeenCalled();

    const unsigned = await request(app.getHttpServer()).post('/webhooks/stripe').set('Content-Type', 'application/json')
      .send(payload);
    expect(unsigned.status).toBe(400);
    expect(repo.recordPaymentFailure).toHaveBeenCalledTimes(1);
  });

  it('aceita expiração somente após consultar sessão associada no Stripe', async () => {
    const event = { id: `evt_${randomUUID().replaceAll('-', '')}`, object: 'event', api_version: '2025-08-27.basil',
      created: 1794140000, data: { object: { id: 'cs_attempt', object: 'checkout.session', livemode: false,
        metadata: { donation_order_id: orderId, donation_payment_id: paymentId } } },
      livemode: false, pending_webhooks: 1, request: null, type: 'checkout.session.expired' };
    const payload = JSON.stringify(event);
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
    const accepted = await request(app.getHttpServer()).post('/webhooks/stripe').set('Content-Type', 'application/json')
      .set('Stripe-Signature', signature).send(payload);
    expect(accepted.status).toBe(200);
    expect(gateway.retrieveCheckout).toHaveBeenCalledWith('cs_attempt');
    expect(repo.recordSessionExpiration).toHaveBeenCalledWith(expect.objectContaining({ orderId, paymentId,
      checkoutSessionId: 'cs_attempt', stripeEventId: event.id }));
  });

  it.each(['paid', 'unknown', null])('não registra expiração quando o Stripe informa paymentStatus=%s', async (paymentStatus) => {
    gateway.retrieveCheckout.mockResolvedValue({ id: 'cs_attempt', url: null, paymentIntentId: null, orderId, paymentId,
      amountInCents: '1234', currency: 'brl', livemode: false, status: 'expired', paymentStatus } as any);
    const event = { id: `evt_${randomUUID().replaceAll('-', '')}`, object: 'event', api_version: '2025-08-27.basil',
      created: 1794140000, data: { object: { id: 'cs_attempt', object: 'checkout.session', livemode: false,
        metadata: { donation_order_id: orderId, donation_payment_id: paymentId } } },
      livemode: false, pending_webhooks: 1, request: null, type: 'checkout.session.expired' };
    const payload = JSON.stringify(event);
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
    const accepted = await request(app.getHttpServer()).post('/webhooks/stripe').set('Content-Type', 'application/json')
      .set('Stripe-Signature', signature).send(payload);
    expect(accepted.status).toBe(200);
    expect(repo.recordSessionExpiration).not.toHaveBeenCalled();
  });

  it('consulta e retoma pelo endpoint com a chave de intenção e identidade no cabeçalho', async () => {
    const current = await request(app.getHttpServer()).get('/donation-orders/current')
      .set('X-Donation-Intent', 'intent-portador-123456789');
    expect(current.status).toBe(200);
    expect(retryService.inspectCurrent).toHaveBeenCalledWith('intent-portador-123456789');
    const read = await request(app.getHttpServer()).get(`/donation-orders/${orderId}`)
      .set('X-Donation-Intent', 'intent-portador-123456789');
    expect(read.status).toBe(200);
    expect(retryService.inspect).toHaveBeenCalledWith(orderId, 'intent-portador-123456789');
    const attempted = await request(app.getHttpServer()).post(`/donation-orders/${orderId}/attempts`)
      .set('X-Donation-Intent', 'intent-portador-123456789').set('Idempotency-Key', 'attempt-operation-123456');
    expect(attempted.status).toBe(200);
    expect(retryService.retry).toHaveBeenCalledWith(orderId, 'intent-portador-123456789', 'attempt-operation-123456');
  });

  it('retorno do Checkout informa que a confirmação depende da consulta ao pedido', async () => {
    const returned = await request(app.getHttpServer()).get('/donations/return?result=success');
    expect(returned.status).toBe(200);
    expect(returned.headers['content-type']).toContain('text/html');
    expect(returned.text).toContain('Aguardando confirmação do pagamento');
  });
});

describe('retomada autenticada da tentativa', () => {
  const orderId = randomUUID(); const paymentId = randomUUID(); const nextPaymentId = randomUUID();
  const intent = randomUUID(); const operation = randomUUID();
  const baseAttempt = { paymentId, status: 'recusada', reason: 'RECUSA_CARTAO', checkoutSessionId: 'cs_retry',
    checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_retry', paymentIntentId: 'pi_retry', stripeIdempotencyKey: 'stripe-old',
    firstSentAt: new Date('2026-11-08T12:00:00Z'), checkoutParameters: { amountInCents: '1234', currency: 'brl' as const,
      successUrl: 'https://example.test/success', cancelUrl: 'https://example.test/cancel' } };

  function fixture(overrides: Record<string, unknown> = {}, sessionStatus = 'open', options: { payDuringCreation?: boolean; expireFails?: boolean } = {}) {
    const donation: any = { orderId, amount: '12.34', currency: 'BRL', status: 'pendente', attempts: [{ ...baseAttempt, ...overrides }], events: [] };
    const opening = { isNew: true, orderId, paymentId: nextPaymentId, amount: '12.34', currency: 'BRL', amountInCents: '1234',
      stripeIdempotencyKey: 'stripe-next', firstSentAt: new Date(), successUrl: 'https://example.test/success',
      cancelUrl: 'https://example.test/cancel', checkoutSessionId: null, checkoutUrl: null, status: 'pendente' };
    const repository: any = { getAuthorizedDonation: vi.fn(async () => donation), markSessionExpired: vi.fn(async () => { donation.attempts[0].status = 'expirada'; }),
      recordRetryExpirationFailure: vi.fn(async () => undefined),
      createRetry: vi.fn(async () => opening), recordCheckout: vi.fn(async () => undefined), recordIndeterminate: vi.fn(async () => undefined) };
    const session: any = { id: baseAttempt.checkoutSessionId, url: 'https://checkout.stripe.com/c/pay/cs_retry', paymentIntentId: 'pi_retry',
      orderId, paymentId, amountInCents: '1234', currency: 'brl', livemode: false, status: sessionStatus, paymentStatus: 'unpaid' };
    const gateway: any = { retrieveCheckout: vi.fn(async () => session), expireCheckout: vi.fn(async () => {
      if (options.expireFails) throw new Error('Stripe session is not expirable');
      return { ...session, id: 'cs_retry_next', status: 'expired' };
    }), createCheckout: vi.fn(async () => {
      if (options.payDuringCreation) donation.status = 'pago';
      return { ...session, id: 'cs_retry_next', url: 'https://checkout.stripe.com/c/pay/cs_retry_next', paymentId: nextPaymentId, status: 'open' };
    }) };
    return { service: new RetryDonation(repository, gateway, 'identity-test-secret'), repository, gateway, donation };
  }

  it('reutiliza a mesma sessão quando a consulta autenticada a encontra aberta', async () => {
    const { service, repository, gateway } = fixture();
    const result = await service.retry(orderId, intent, operation);
    expect(result).toMatchObject({ paymentId, checkoutUrl: baseAttempt.checkoutUrl, reused: true });
    expect(repository.createRetry).not.toHaveBeenCalled();
    expect(gateway.createCheckout).not.toHaveBeenCalled();
  });

  it('cria nova tentativa no mesmo pedido e valor somente após consulta confirmar expiração', async () => {
    const { service, repository, gateway } = fixture({}, 'expired');
    const result = await service.retry(orderId, intent, operation);
    expect(result).toMatchObject({ orderId, paymentId: nextPaymentId, amount: '12.34', status: 'pendente', reused: false });
    expect(repository.markSessionExpired).toHaveBeenCalledWith({ orderId, paymentId, sessionId: 'cs_retry' });
    expect(repository.createRetry).toHaveBeenCalledWith(expect.objectContaining({ currentStatus: 'expirada' }));
    expect(gateway.createCheckout).toHaveBeenCalledTimes(1);
  });

  it('replay da mesma operação após recusa sem session id repete mesma tentativa, parâmetros e Stripe key dentro de 24h', async () => {
    const priorOperationHash = createHmac('sha256', 'identity-test-secret').update(operation).digest('hex');
    const { service, repository, gateway, donation } = fixture({ status: 'recusada', reason: 'RECUSA_CARTAO',
      checkoutSessionId: null, checkoutUrl: null, operationKeyHash: priorOperationHash,
      firstSentAt: new Date(Date.now() - 60_000), checkoutParameters: { amountInCents: '1234', currency: 'brl',
        successUrl: 'https://example.test/success', cancelUrl: 'https://example.test/cancel' } });
    donation.attempts[0].checkoutParameters = { amountInCents: '1234', currency: 'brl',
      successUrl: 'https://example.test/success', cancelUrl: 'https://example.test/cancel' };
    donation.attempts[0].stripeIdempotencyKey = 'stripe-same-attempt';
    gateway.createCheckout.mockRejectedValueOnce(new Error('response lost'));
    await expect(service.retry(orderId, intent, operation)).rejects.toMatchObject({ code: 'result_uncertain' });
    gateway.createCheckout.mockResolvedValueOnce({ id: 'cs_recovered_same_attempt', url: 'https://checkout.stripe.com/c/pay/cs_recovered_same_attempt',
      paymentIntentId: 'pi_retry', orderId, paymentId, amountInCents: '1234', currency: 'brl', livemode: false,
      status: 'open', paymentStatus: 'unpaid' } as any);
    const recovered = await service.retry(orderId, intent, operation);
    expect(recovered).toMatchObject({ paymentId, status: 'pendente', reused: true,
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_recovered_same_attempt' });
    expect(gateway.createCheckout).toHaveBeenCalledWith(expect.objectContaining({ paymentId, idempotencyKey: 'stripe-same-attempt',
      amountInCents: '1234', successUrl: 'https://example.test/success', cancelUrl: 'https://example.test/cancel' }));
    expect(gateway.createCheckout).toHaveBeenCalledTimes(2);
    expect(repository.recordCheckout).toHaveBeenCalledWith(expect.objectContaining({ paymentId,
      checkoutSessionId: 'cs_recovered_same_attempt', checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_recovered_same_attempt' }));
    expect(repository.createRetry).not.toHaveBeenCalled();
  });

  it('bloqueia operação nova após recusa sem session id e bloqueia replay da mesma operação fora de 24h', async () => {
    const priorOperationHash = createHmac('sha256', 'identity-test-secret').update(operation).digest('hex');
    const oldAttempt = { status: 'recusada', reason: 'RECUSA_CARTAO', checkoutSessionId: null, checkoutUrl: null,
      operationKeyHash: priorOperationHash, firstSentAt: new Date(Date.now() - 25 * 60 * 60_000),
      checkoutParameters: { amountInCents: '1234', currency: 'brl', successUrl: 'https://example.test/success', cancelUrl: 'https://example.test/cancel' } };
    const same = fixture(oldAttempt);
    await expect(same.service.retry(orderId, intent, operation)).rejects.toMatchObject({ code: 'result_uncertain' });
    const different = fixture({ ...oldAttempt, operationKeyHash: null });
    await expect(different.service.retry(orderId, intent, randomUUID())).rejects.toMatchObject({ code: 'result_uncertain' });
    expect(same.repository.createRetry).not.toHaveBeenCalled();
    expect(different.repository.createRetry).not.toHaveBeenCalled();
    expect(same.gateway.createCheckout).not.toHaveBeenCalled();
    expect(different.gateway.createCheckout).not.toHaveBeenCalled();
  });

  it('permite nova identidade após rejeição conclusiva sem sessão, mas repete a operação original sem duplicar', async () => {
    const priorOperationHash = createHmac('sha256', 'identity-test-secret').update(operation).digest('hex');
    const conclusiveFailure = { status: 'falha_na_criacao', reason: 'GATEWAY_REJEITOU_CRIACAO', checkoutSessionId: null,
      checkoutUrl: null, operationKeyHash: priorOperationHash };
    const same = fixture(conclusiveFailure);
    const repeated = await same.service.retry(orderId, intent, operation);
    expect(repeated).toMatchObject({ paymentId, status: 'falha_na_criacao', reused: true });
    expect(same.repository.createRetry).not.toHaveBeenCalled();
    expect(same.gateway.createCheckout).not.toHaveBeenCalled();

    const fresh = fixture(conclusiveFailure);
    const retried = await fresh.service.retry(orderId, intent, randomUUID());
    expect(retried).toMatchObject({ orderId, paymentId: nextPaymentId, status: 'pendente', reused: false });
    expect(fresh.repository.createRetry).toHaveBeenCalledWith(expect.objectContaining({ currentStatus: 'falha_na_criacao' }));
    expect(fresh.gateway.createCheckout).toHaveBeenCalledTimes(1);
  });

  it('consulta o Stripe sem usar relógio local e só registra expiração remota não paga', async () => {
    const { service, repository, gateway } = fixture({}, 'expired');
    const result = await service.inspect(orderId, intent);
    expect(gateway.retrieveCheckout).toHaveBeenCalledWith('cs_retry');
    expect(repository.markSessionExpired).toHaveBeenCalledWith({ orderId, paymentId, sessionId: 'cs_retry' });
    expect(result?.attempts[0]).toMatchObject({ paymentId, status: 'expirada' });
  });

  it('expira sessão aberta excedente quando a confirmação do pedido vence a corrida', async () => {
    const { service, gateway, repository } = fixture({}, 'expired', { payDuringCreation: true });
    const result = await service.retry(orderId, intent, operation);
    expect(gateway.expireCheckout).toHaveBeenCalledWith('cs_retry_next');
    expect(result).toMatchObject({ status: 'pago', checkoutUrl: null });
    expect(repository.recordRetryExpirationFailure).not.toHaveBeenCalled();
  });

  it('bloqueia Checkout excedente e registra incerteza quando expire falha na corrida com confirmação', async () => {
    const { service, gateway, repository } = fixture({}, 'expired', { payDuringCreation: true, expireFails: true });
    const result = await service.retry(orderId, intent, operation);
    expect(gateway.expireCheckout).toHaveBeenCalledWith('cs_retry_next');
    expect(result).toMatchObject({ status: 'pago', checkoutUrl: null });
    expect(repository.recordRetryExpirationFailure).toHaveBeenCalledWith({ orderId, paymentId: nextPaymentId, sessionId: 'cs_retry_next' });
  });

  it('ao consultar nova tentativa de pedido pago, pede expiração de sessão ainda aberta e mantém pago se falhar', async () => {
    const { gateway, repository, donation } = fixture({}, 'open', { expireFails: true });
    donation.status = 'pago';
    const serviceForPaid = new RetryDonation(repository, gateway, 'identity-test-secret');
    const result = await serviceForPaid.retry(orderId, intent, operation);
    expect(result).toMatchObject({ status: 'pago' });
    expect(gateway.expireCheckout).toHaveBeenCalledWith('cs_retry');
    expect(repository.recordRetryExpirationFailure).toHaveBeenCalledWith({ orderId, paymentId, sessionId: 'cs_retry' });
  });

  it.each([
    ['sessão concluída aguardando webhook', { status: 'pendente' }, 'complete', 'pendente'],
    ['estado incerto sem sessão', { status: 'indeterminada', checkoutSessionId: null }, 'open', 'pendente'],
    ['pedido pago', { status: 'pendente' }, 'open', 'pago'],
    ['valor rejeitado pelo gateway', { status: 'falha_na_criacao', reason: 'VALOR_NAO_ACEITO', checkoutSessionId: null }, 'open', 'pendente'],
  ])('bloqueia nova abertura para %s', async (_name, attempt, sessionStatus, orderStatus) => {
    const { service, repository, gateway, donation } = fixture(attempt as Record<string, unknown>, sessionStatus);
    donation.status = orderStatus;
    if (orderStatus === 'pago') await service.retry(orderId, intent, operation);
    else await expect(service.retry(orderId, intent, operation)).rejects.toMatchObject({ code: 'result_uncertain' });
    expect(repository.createRetry).not.toHaveBeenCalled();
    expect(gateway.createCheckout).not.toHaveBeenCalled();
  });
});
