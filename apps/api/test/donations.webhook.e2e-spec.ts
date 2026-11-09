import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import Stripe from 'stripe';
import { AppModule } from '../src/app.module.js';
import { DONATION_REPOSITORY } from '../src/donations/ports/donation-repository.js';
import { DONATION_CREATION_REPOSITORY } from '../src/donations/ports/donation-creation-repository.js';
import { STRIPE_CLIENT } from '../src/donations/adapters/stripe/stripe.tokens.js';
import { createStripeClient } from '../src/donations/adapters/stripe/stripe-client.js';

const webhookSecret = 'whsec_controlled';

describe('POST /webhooks/stripe', () => {
  let app: any;
  let stripe: Stripe;
  let repo: any;
  let creationRepo: any;
  let retrieved: Record<string, unknown>;
  let checkoutCreateStarted: (() => void) | undefined;
  let checkoutCreateGate: Promise<void> | undefined;
  let checkoutCreateCalls: number;

  const validSession = (orderId: string, paymentId: string) => ({
    id: 'cs_test_paid', object: 'checkout.session', payment_intent: 'pi_test_paid',
    livemode: false, payment_status: 'paid', amount_total: 1234, currency: 'brl',
    metadata: { donation_order_id: orderId, donation_payment_id: paymentId },
  });

  beforeEach(async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', webhookSecret);
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_controlled');
    vi.stubEnv('DONATION_SUCCESS_URL', 'https://example.test/success');
    vi.stubEnv('DONATION_CANCEL_URL', 'https://example.test/cancel');
    checkoutCreateCalls = 0;
    checkoutCreateGate = undefined;
    const stripeFetch: typeof fetch = async (_input, init) => {
      if (init?.method === 'POST') {
        checkoutCreateCalls += 1;
        if (checkoutCreateGate) {
          checkoutCreateStarted?.();
          await checkoutCreateGate;
        }
        return new Response(JSON.stringify({ id: 'cs_test_paid', object: 'checkout.session', url: 'https://checkout.stripe.com/c/pay/cs_test_paid', livemode: false }),
          { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify(retrieved), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    stripe = createStripeClient('sk_test_controlled', stripeFetch);
    repo = {
      findPaymentForWebhook: vi.fn(async (orderId: string, paymentId: string) => {
        if (orderId !== knownOrderId || paymentId !== knownPaymentId) return null;
        return { orderId, paymentId, amountInCents: '1234', currency: 'BRL', checkoutSessionId: null, sessionLinkedElsewhere: false };
      }),
      recordWebhookDivergence: vi.fn(async () => undefined),
      confirmPayment: vi.fn(async () => true),
    };
    creationRepo = {
      createIntent: vi.fn(async (input: any) => ({ isNew: true, orderId: knownOrderId, paymentId: knownPaymentId,
        amount: input.amount, currency: 'BRL', amountInCents: input.amountInCents,
        stripeIdempotencyKey: input.stripeIdempotencyKey, firstSentAt: input.firstSentAt,
        successUrl: input.successUrl, cancelUrl: input.cancelUrl, checkoutSessionId: null,
        checkoutUrl: null, status: 'pendente' })),
      recordCheckout: vi.fn(async () => undefined), recordIndeterminate: vi.fn(async () => undefined),
      recordCreationFailure: vi.fn(async () => undefined),
    };
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DONATION_REPOSITORY).useValue(repo)
      .overrideProvider(DONATION_CREATION_REPOSITORY).useValue(creationRepo)
      .overrideProvider(STRIPE_CLIENT).useValue(stripe)
      .compile();
    app = module.createNestApplication({ rawBody: true });
    await app.init();
  });

  const knownOrderId = randomUUID();
  const knownPaymentId = randomUUID();

  afterEach(async () => { await app.close(); vi.unstubAllEnvs(); });

  function eventFor(session: Record<string, unknown>, type = 'checkout.session.completed') {
    return { id: `evt_${randomUUID().replaceAll('-', '')}`, object: 'event', api_version: '2025-08-27.basil', created: 1794140000,
      data: { object: session }, livemode: false, pending_webhooks: 1, request: null, type };
  }

  async function postEvent(event: Record<string, unknown>, signature = true) {
    const payload = JSON.stringify(event);
    const sig = stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret });
    const req = request(app.getHttpServer()).post('/webhooks/stripe').set('Content-Type', 'application/json');
    if (signature) req.set('Stripe-Signature', sig);
    return req.send(payload);
  }

  it('verifica assinatura sobre o corpo bruto e confirma somente a sessão paga correspondente em BRL', async () => {
    retrieved = validSession(knownOrderId, knownPaymentId);
    const response = await postEvent(eventFor(retrieved));
    expect(response.status).toBe(200);
    expect(repo.findPaymentForWebhook).toHaveBeenCalledWith(knownOrderId, knownPaymentId, 'cs_test_paid');
    expect(repo.confirmPayment).toHaveBeenCalledWith(expect.objectContaining({
      orderId: knownOrderId, paymentId: knownPaymentId, checkoutSessionId: 'cs_test_paid',
      paymentIntentId: 'pi_test_paid', stripeEventId: expect.stringMatching(/^evt_/),
    }));
    expect(JSON.stringify(response.body)).not.toContain(JSON.stringify(retrieved));
  });

  it.each(['ausente', 'inválida'])('não confirma com assinatura %s', async (kind) => {
    retrieved = validSession(knownOrderId, knownPaymentId);
    const event = eventFor(retrieved);
    const response = kind === 'ausente'
      ? await postEvent(event, false)
      : await request(app.getHttpServer()).post('/webhooks/stripe').set('Content-Type', 'application/json')
        .set('Stripe-Signature', 't=1,v1=invalid').send(JSON.stringify(event));
    expect(response.status).toBe(400);
    expect(repo.confirmPayment).not.toHaveBeenCalled();
  });

  it.each([
    ['livemode', { livemode: true }],
    ['valor divergente', { amount_total: 1235 }],
    ['moeda divergente', { currency: 'usd' }],
    ['pagamento pendente', { payment_status: 'unpaid' }],
  ])('não confirma sessão com %s', async (caseName, changes) => {
    retrieved = { ...validSession(knownOrderId, knownPaymentId), ...changes };
    expect((await postEvent(eventFor(retrieved))).status).toBe(200);
    expect(repo.confirmPayment).not.toHaveBeenCalled();
    if (caseName === 'valor divergente' || caseName === 'moeda divergente' || caseName === 'pagamento pendente') {
      expect(repo.recordWebhookDivergence).toHaveBeenCalledWith(expect.objectContaining({
        orderId: knownOrderId, paymentId: knownPaymentId,
        reason: caseName === 'valor divergente' ? 'VALOR_DIVERGENTE'
          : caseName === 'moeda divergente' ? 'MOEDA_DIVERGENTE' : 'PAGAMENTO_NAO_CONFIRMADO',
      }));
    }
  });

  it('não confirma pedido desconhecido nem aceita sessão já vinculada a outro pedido', async () => {
    retrieved = validSession(randomUUID(), randomUUID());
    expect((await postEvent(eventFor(retrieved))).status).toBe(200);
    expect(repo.confirmPayment).not.toHaveBeenCalled();

    retrieved = validSession(knownOrderId, knownPaymentId);
    repo.findPaymentForWebhook.mockResolvedValueOnce({ orderId: knownOrderId, paymentId: knownPaymentId,
      amountInCents: '1234', currency: 'BRL', checkoutSessionId: 'cs_linked_elsewhere', sessionLinkedElsewhere: false });
    expect((await postEvent(eventFor(retrieved))).status).toBe(200);
    expect(repo.confirmPayment).not.toHaveBeenCalled();
  });

  it('registra evento verificado de produção para tentativa conhecida sem consultar outra conta', async () => {
    retrieved = validSession(knownOrderId, knownPaymentId);
    const event = eventFor(retrieved);
    event.livemode = true;
    expect((await postEvent(event)).status).toBe(200);
    expect(repo.findPaymentForWebhook).toHaveBeenCalledWith(knownOrderId, knownPaymentId, 'cs_test_paid');
    expect(repo.recordWebhookDivergence).toHaveBeenCalledWith(expect.objectContaining({
      orderId: knownOrderId, paymentId: knownPaymentId, reason: 'MODO_DIVERGENTE',
    }));
    expect(repo.confirmPayment).not.toHaveBeenCalled();
  });

  it('reconcilia a sessão pelo metadata durável se o webhook chega antes da resposta de criação', async () => {
    retrieved = validSession(knownOrderId, knownPaymentId);
    let release!: () => void;
    checkoutCreateGate = new Promise<void>((resolve) => { release = resolve; });
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => { started = resolve; });
    checkoutCreateStarted = started;
    const createRequest = request(app.getHttpServer()).post('/donation-orders')
      .set('X-Donation-Intent', randomUUID()).set('Idempotency-Key', randomUUID())
      .send({ amount: '12.34', currency: 'BRL' });
    const pendingCreation = createRequest.then((response) => response);
    await startedPromise;
    expect(creationRepo.createIntent).toHaveBeenCalledTimes(1);

    try {
      expect((await postEvent(eventFor(validSession(knownOrderId, knownPaymentId)))).status).toBe(200);
      expect(repo.findPaymentForWebhook).toHaveBeenCalledWith(knownOrderId, knownPaymentId, 'cs_test_paid');
      expect(repo.confirmPayment).toHaveBeenCalledTimes(1);
      expect(checkoutCreateCalls).toBe(1);
    } finally { release(); }
    const creationResponse = await pendingCreation;
    expect(creationResponse.status).toBe(201);
    expect(checkoutCreateCalls).toBe(1);
  });

  it('recusa quando segredo de webhook não está configurado e não registra corpo bruto', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');
    retrieved = validSession(knownOrderId, knownPaymentId);
    const raw = JSON.stringify(eventFor(retrieved));
    const signature = stripe.webhooks.generateTestHeaderString({ payload: raw, secret: webhookSecret });
    const logger = vi.spyOn(console, 'log');
    const response = await request(app.getHttpServer()).post('/webhooks/stripe')
      .set('Content-Type', 'application/json').set('Stripe-Signature', signature).send(raw);
    expect(response.status).toBe(400);
    expect(repo.confirmPayment).not.toHaveBeenCalled();
    expect(logger.mock.calls.flat().join(' ')).not.toContain(raw);
    logger.mockRestore();
  });
});
