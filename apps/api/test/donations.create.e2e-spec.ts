import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { DONATION_CREATION_REPOSITORY } from '../src/donations/ports/donation-creation-repository.js';
import { STRIPE_CLIENT } from '../src/donations/adapters/stripe/stripe.tokens.js';
import { createStripeClient } from '../src/donations/adapters/stripe/stripe-client.js';

const validSession = {
  id: 'cs_test_controlled',
  object: 'checkout.session',
  url: 'https://checkout.stripe.com/c/pay/cs_test_controlled',
  payment_intent: 'pi_test_controlled',
  livemode: false,
  metadata: { donation_order_id: 'order', donation_payment_id: 'payment' },
  amount_total: 1234,
  currency: 'brl',
  status: 'open',
};

function createControlledStripe() {
  const responses: Array<{ status: number; body: string; contentType: string } | Error> = [];
  let calls = 0;
  const requestBodies: string[] = [];
  const requestHeaders: Headers[] = [];
  const stripe = createStripeClient('sk_test_controlled', async (_input, init) => {
    calls += 1;
    if (typeof init?.body === 'string') requestBodies.push(init.body);
    requestHeaders.push(new Headers(init?.headers));
    const next = responses.shift();
    if (!next) throw new Error('No controlled Stripe response configured');
    if (next instanceof Error) throw next;
    return new Response(next.body, { status: next.status, headers: { 'content-type': next.contentType, 'request-id': 'req_controlled' } });
  });
  return {
    stripe,
    respond(status: number, body: string, contentType = 'application/json') { responses.push({ status, body, contentType }); },
    fail(error: Error) { responses.push(error); },
    callCount: () => calls,
    requestBodies,
    requestHeaders,
  };
}

describe('POST /donation-orders', () => {
  const savedEnv = { STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY };
  let app: any;
  let donations: any;
  let controlled: ReturnType<typeof createControlledStripe>;

  beforeEach(async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_controlled');
    vi.stubEnv('DONATION_SUCCESS_URL', 'https://example.test/donations/return?result=success');
    vi.stubEnv('DONATION_CANCEL_URL', 'https://example.test/donations/return?result=cancel');
    controlled = createControlledStripe();
    donations = {
      createIntent: vi.fn(async (input: Record<string, unknown>) => ({
        isNew: true, orderId: randomUUID(), paymentId: randomUUID(), amount: input.amount as string, currency: 'BRL' as const,
        amountInCents: input.amountInCents as string, stripeIdempotencyKey: input.stripeIdempotencyKey as string,
        firstSentAt: input.firstSentAt as Date, successUrl: input.successUrl as string, cancelUrl: input.cancelUrl as string,
        checkoutSessionId: null, checkoutUrl: null, status: 'pendente',
      })),
      recordCheckout: vi.fn(async () => undefined),
      recordIndeterminate: vi.fn(async () => undefined),
      recordCreationFailure: vi.fn(async () => undefined),
    };
    const testModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DONATION_CREATION_REPOSITORY).useValue(donations)
      .overrideProvider(STRIPE_CLIENT).useValue(controlled.stripe)
      .compile();
    app = testModule.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  afterAll(() => {
    if (savedEnv.STRIPE_SECRET_KEY === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = savedEnv.STRIPE_SECRET_KEY;
  });

  it.each([
    ['envelope de erro JSON', '{"error":{"type":"api_error","message":"indisponível"}}', 'application/json'],
    ['HTML', '<html>indisponível</html>', 'text/html'],
    ['JSON sem error', '{"message":"indisponível"}', 'application/json'],
    ['JSON malformado', '{"error":{"type":"api_error"', 'application/json'],
    ['corpo vazio', '', 'application/json'],
  ])('responde 503 e conserva IDs com 503 Stripe em %s, sem repetir envio', async (_label, body, contentType) => {
    controlled.respond(503, body, contentType);
    const response = await request(app.getHttpServer())
      .post('/donation-orders')
      .set('X-Donation-Intent', randomUUID())
      .set('Idempotency-Key', randomUUID())
      .send({ amount: '12.34', currency: 'BRL' })
      .expect(503);

    expect(response.body).toMatchObject({ orderId: expect.any(String), paymentId: expect.any(String), status: 'indeterminada', reason: 'STRIPE_HTTP_503' });
    expect(donations.createIntent).toHaveBeenCalledTimes(1);
    expect(donations.recordIndeterminate).toHaveBeenCalledTimes(1);
    expect(controlled.callCount()).toBe(1);
  });

  it('trata ausência de resposta como 202 incerto, com uma chamada ao Stripe', async () => {
    controlled.fail(new Error('socket closed'));
    const response = await request(app.getHttpServer())
      .post('/donation-orders')
      .set('X-Donation-Intent', randomUUID())
      .set('Idempotency-Key', randomUUID())
      .send({ amount: '12.34', currency: 'BRL' })
      .expect(202);

    expect(response.body).toMatchObject({ orderId: expect.any(String), paymentId: expect.any(String), status: 'indeterminada', reason: 'RESULTADO_INCERTO' });
    expect(donations.recordIndeterminate).toHaveBeenCalledTimes(1);
    expect(controlled.callCount()).toBe(1);
  });

  it('mantém o status HTTP associado à resposta certa em chamadas concorrentes', async () => {
    controlled.respond(503, '<html>down</html>', 'text/html');
    controlled.respond(400, '{"error":{"type":"invalid_request_error","code":"amount_too_large"}}');
    const send = (amount: string) => request(app.getHttpServer())
      .post('/donation-orders')
      .set('X-Donation-Intent', randomUUID())
      .set('Idempotency-Key', randomUUID())
      .send({ amount, currency: 'BRL' });
    const responses = await Promise.all([send('12.34'), send('13.34')]);
    expect(responses.map((response) => response.status).sort()).toEqual([422, 503]);
    expect(controlled.callCount()).toBe(2);
  });

  it('cria sessão com centavos exatos e não persiste a chave portadora como chave Stripe', async () => {
    controlled.respond(200, JSON.stringify(validSession));
    const intent = randomUUID();
    const idempotency = randomUUID();
    const response = await request(app.getHttpServer())
      .post('/donation-orders')
      .set('X-Donation-Intent', intent)
      .set('Idempotency-Key', idempotency)
      .send({ amount: '123456789012345678901234567890.37', currency: 'BRL' })
      .expect(201);

    expect(response.body).toMatchObject({ status: 'pendente', checkoutUrl: validSession.url });
    expect(donations.createIntent).toHaveBeenCalledWith(expect.objectContaining({
      amount: '123456789012345678901234567890.37',
    }));
    expect(donations.createIntent.mock.calls[0][0].stripeIdempotencyKey).not.toContain(intent);
    const sent = new URLSearchParams(controlled.requestBodies[0]);
    expect(sent.get('line_items[0][price_data][unit_amount]')).toBe('12345678901234567890123456789037');
    expect(controlled.requestHeaders[0].get('idempotency-key')).not.toBe(intent);
    expect(controlled.requestBodies[0]).not.toContain(intent);
    expect(controlled.callCount()).toBe(1);
  });

  it('não recebe nem envia dados do pagador, cartão, fiscais ou chaves portadoras', async () => {
    controlled.respond(200, JSON.stringify(validSession));
    const intent = randomUUID(); const operation = randomUUID();
    const response = await request(app.getHttpServer()).post('/donation-orders')
      .set('X-Donation-Intent', intent).set('Idempotency-Key', operation)
      .send({ amount: '10.00', currency: 'BRL' }).expect(201);
    const responseText = JSON.stringify(response.body);
    const stripeRequest = controlled.requestBodies[0];
    expect(responseText).not.toContain(intent);
    expect(responseText).not.toContain(operation);
    for (const sensitiveField of ['email', 'card[number]', 'card[cvc]', 'cnpj', 'cpf', 'tax_id', 'billing_address']) {
      expect(responseText.toLowerCase()).not.toContain(sensitiveField);
      expect(stripeRequest.toLowerCase()).not.toContain(sensitiveField);
    }
    expect(stripeRequest).not.toContain(intent);
    expect(stripeRequest).not.toContain(operation);
    expect(stripeRequest).toContain('donation_order_id');
    expect(stripeRequest).toContain('donation_payment_id');
  });

  it('rejeita campos pessoais adicionais antes de persistir ou chamar Stripe', async () => {
    await request(app.getHttpServer()).post('/donation-orders')
      .set('X-Donation-Intent', randomUUID()).set('Idempotency-Key', randomUUID())
      .send({ amount: '10.00', currency: 'BRL', email: 'pessoa@example.test', cpf: '12345678900' }).expect(422);
    expect(donations.createIntent).not.toHaveBeenCalled();
    expect(controlled.callCount()).toBe(0);
  });

  it.each([
    [{ amount: '', currency: 'BRL' }],
    [{ amount: '0', currency: 'BRL' }],
    [{ amount: '-1', currency: 'BRL' }],
    [{ amount: 'abc', currency: 'BRL' }],
    [{ amount: '1.001', currency: 'BRL' }],
    [{ amount: '0.49', currency: 'BRL' }],
    [{ amount: '1.00', currency: 'USD' }],
    [{ amount: '1.00', currency: 'BRL', constructor: 'x' }],
    [{ amount: '1.00', currency: 'BRL', toString: 'x' }],
  ])('rejeita entrada inválida sem criar pedido nem chamar gateway: %j', async (body) => {
    await request(app.getHttpServer())
      .post('/donation-orders')
      .set('X-Donation-Intent', randomUUID())
      .set('Idempotency-Key', randomUUID())
      .send(body)
      .expect(422);
    expect(donations.createIntent).not.toHaveBeenCalled();
    expect(controlled.callCount()).toBe(0);
  });

  it('rejeita chave de intenção ausente antes da persistência', async () => {
    await request(app.getHttpServer())
      .post('/donation-orders')
      .set('Idempotency-Key', randomUUID())
      .send({ amount: '10.00', currency: 'BRL' })
      .expect(422);
    expect(donations.createIntent).not.toHaveBeenCalled();
  });

  it('rejeita JSON com chave própria __proto__ antes de qualquer transformação', async () => {
    await request(app.getHttpServer())
      .post('/donation-orders')
      .set('Content-Type', 'application/json')
      .set('X-Donation-Intent', randomUUID())
      .set('Idempotency-Key', randomUUID())
      .send('{"amount":"10.00","currency":"BRL","__proto__":{"admin":true}}')
      .expect(422);
    expect(donations.createIntent).not.toHaveBeenCalled();
    expect(controlled.callCount()).toBe(0);
  });

  it('recusa configuração ausente ou de produção antes de criar intenção ou abrir sessão', async () => {
    for (const key of [undefined, 'sk_live_never_used']) {
      if (key === undefined) vi.stubEnv('STRIPE_SECRET_KEY', '');
      else vi.stubEnv('STRIPE_SECRET_KEY', key);
      await request(app.getHttpServer())
        .post('/donation-orders')
        .set('X-Donation-Intent', randomUUID())
        .set('Idempotency-Key', randomUUID())
        .send({ amount: '10.00', currency: 'BRL' })
        .expect(503);
    }
    expect(donations.createIntent).not.toHaveBeenCalled();
    expect(controlled.callCount()).toBe(0);
  });

  it('responde indisponibilidade do banco sem chamar Stripe', async () => {
    donations.createIntent.mockRejectedValueOnce(new Error('database unavailable'));
    await request(app.getHttpServer())
      .post('/donation-orders')
      .set('X-Donation-Intent', randomUUID())
      .set('Idempotency-Key', randomUUID())
      .send({ amount: '10.00', currency: 'BRL' })
      .expect(503);
    expect(donations.createIntent).toHaveBeenCalledTimes(1);
    expect(controlled.callCount()).toBe(0);
  });

  it('recusa limite do Stripe após registrar a intenção e não converte o valor grande em number', async () => {
    controlled.respond(400, '{"error":{"type":"invalid_request_error","code":"amount_too_large","message":"raw detail"}}');
    const amount = '999999999999999999999999999999999999999.99';
    const response = await request(app.getHttpServer())
      .post('/donation-orders')
      .set('X-Donation-Intent', randomUUID())
      .set('Idempotency-Key', randomUUID())
      .send({ amount, currency: 'BRL' })
      .expect(422);

    expect(response.body).toMatchObject({ orderId: expect.any(String), status: 'falha_na_criacao', reason: 'VALOR_NAO_ACEITO' });
    expect(donations.createIntent).toHaveBeenCalledWith(expect.objectContaining({ amount }));
    expect(donations.recordCreationFailure).toHaveBeenCalledTimes(1);
    const sent = new URLSearchParams(controlled.requestBodies[0]);
    expect(sent.get('line_items[0][price_data][unit_amount]')).toBe('99999999999999999999999999999999999999999');
    expect(JSON.stringify(response.body)).not.toContain('raw detail');
    expect(controlled.callCount()).toBe(1);
  });
});
