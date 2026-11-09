import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { DONATION_CREATION_REPOSITORY } from '../src/donations/ports/donation-creation-repository.js';
import { STRIPE_CLIENT } from '../src/donations/adapters/stripe/stripe.tokens.js';
import { createStripeClient } from '../src/donations/adapters/stripe/stripe-client.js';
import { DonationOperationConflictError } from '../src/donations/ports/donation-creation-repository.js';

const session = { id: 'cs_test_recovery', object: 'checkout.session', url: 'https://checkout.stripe.com/c/pay/cs_test_recovery', payment_intent: 'pi_test_recovery', livemode: false };

describe('recuperação de operação de doação', () => {
  let app: any;
  let calls: Array<{ body: string; idempotencyKey: string }>;
  let stripeSessions: Map<string, { body: string; session: typeof session }>;
  let stripeSessionIdsByPost: string[];
  let nextFailure: Error | null;
  let repo: any;
  let latestOpening: any;
  let retrieveCalls: number;
  let holdStripeResponse: (() => Promise<void>) | null;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-08T12:00:00.000Z'));
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_controlled');
    vi.stubEnv('DONATION_SUCCESS_URL', 'https://example.test/success-v1');
    vi.stubEnv('DONATION_CANCEL_URL', 'https://example.test/cancel-v1');
    calls = [];
    stripeSessions = new Map();
    stripeSessionIdsByPost = [];
    retrieveCalls = 0;
    latestOpening = null;
    holdStripeResponse = null;
    nextFailure = null;
    const stripe = createStripeClient('sk_test_controlled', async (_input, init) => {
      calls.push({ body: String(init?.body), idempotencyKey: new Headers(init?.headers).get('idempotency-key') ?? '' });
      if (holdStripeResponse) await holdStripeResponse();
      if (init?.method === 'GET') {
        retrieveCalls += 1;
        return new Response(JSON.stringify({ ...session, id: latestOpening.checkoutSessionId ?? session.id,
          url: latestOpening.checkoutUrl ?? session.url, amount_total: 1234, currency: 'brl', status: 'open',
          metadata: { donation_order_id: latestOpening.orderId, donation_payment_id: latestOpening.paymentId } }),
        { status: 200, headers: { 'content-type': 'application/json' } });
      }
      const body = String(init?.body);
      const idempotencyKey = new Headers(init?.headers).get('idempotency-key') ?? '';
      let stored = stripeSessions.get(idempotencyKey);
      if (stored && stored.body !== body) throw new Error('Stripe idempotency key reused with different parameters');
      if (!stored) {
        const id = `cs_test_stateful_${stripeSessions.size + 1}`;
        stored = { body, session: { ...session, id, url: `https://checkout.stripe.com/c/pay/${id}` } };
        stripeSessions.set(idempotencyKey, stored);
      }
      stripeSessionIdsByPost.push(stored.session.id);
      if (nextFailure) { const failure = nextFailure; nextFailure = null; throw failure; }
      return new Response(JSON.stringify(stored.session), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    const operations = new Map<string, any>();
    repo = {
      createIntent: vi.fn(async (input: any) => {
        const key = `${input.intentKeyHash}:${input.operationKeyHash}`;
        const prior = operations.get(key);
        if (prior) {
          if (prior.fingerprint !== input.fingerprint) throw new DonationOperationConflictError();
          return { ...prior, isNew: false };
        }
        const opening = { isNew: true, orderId: randomUUID(), paymentId: randomUUID(), amount: input.amount, currency: 'BRL' as const,
          amountInCents: input.amountInCents, stripeIdempotencyKey: input.stripeIdempotencyKey, firstSentAt: input.firstSentAt,
          successUrl: input.successUrl, cancelUrl: input.cancelUrl, checkoutSessionId: null, checkoutUrl: null, status: 'pendente',
          fingerprint: input.fingerprint };
        operations.set(key, opening);
        latestOpening = opening;
        return opening;
      }),
      recordCheckout: vi.fn(async (input: any) => { const opening = [...operations.values()].find((value) => value.paymentId === input.paymentId); Object.assign(opening, input); }),
      recordIndeterminate: vi.fn(async (input: any) => { const opening = [...operations.values()].find((value) => value.paymentId === input.paymentId); opening.status = 'indeterminada'; }),
      recordCreationFailure: vi.fn(async () => undefined),
    };
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DONATION_CREATION_REPOSITORY).useValue(repo)
      .overrideProvider(STRIPE_CLIENT).useValue(stripe).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => { await app.close(); vi.useRealTimers(); vi.unstubAllEnvs(); });

  const send = (intent: string, operation: string, amount = '12.34') => request(app.getHttpServer())
    .post('/donation-orders').set('X-Donation-Intent', intent).set('Idempotency-Key', operation)
    .send({ amount, currency: 'BRL' });

  it('repetir após perder a resposta recupera a mesma sessão pela chave Stripe idempotente', async () => {
    const intent = randomUUID(); const operation = randomUUID();
    nextFailure = new Error('socket closed after Stripe created the session');
    const first = await send(intent, operation);
    expect(first.status).toBe(202);
    const second = await send(intent, operation);
    expect(second.status).toBe(200);
    const storedSession = [...stripeSessions.values()][0]?.session;
    expect(second.body).toMatchObject({ orderId: first.body.orderId, paymentId: first.body.paymentId, checkoutUrl: storedSession?.url });
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual(calls[0]);
    expect(stripeSessions.size).toBe(1);
    expect(stripeSessionIdsByPost).toEqual([storedSession?.id, storedSession?.id]);
    expect([...stripeSessions.values()][0]).toEqual({ body: calls[0].body, session: storedSession });
  });

  it('concorrência compartilha pedido e tentativa e usa uma única chave Stripe idempotente', async () => {
    const intent = randomUUID(); const operation = randomUUID();
    const [a, b] = await Promise.all([send(intent, operation), send(intent, operation)]);
    expect(a.body.orderId).toBe(b.body.orderId);
    expect(a.body.paymentId).toBe(b.body.paymentId);
    const checkoutPosts = calls.filter((call) => call.body !== 'undefined');
    expect(checkoutPosts.length).toBeGreaterThan(0);
    expect(new Set(checkoutPosts.map((call) => call.idempotencyKey))).toEqual(new Set([checkoutPosts[0].idempotencyKey]));
    expect(new Set(checkoutPosts.map((call) => call.body))).toEqual(new Set([checkoutPosts[0].body]));
  });

  it('recupera sessão cujo ID já foi persistido, valida vínculo e não confirma o pedido', async () => {
    const intent = randomUUID(); const operation = randomUUID();
    const first = await send(intent, operation).expect(201);
    const second = await send(intent, operation).expect(200);
    expect(second.body).toMatchObject({ orderId: first.body.orderId, paymentId: first.body.paymentId,
      status: 'pendente', checkoutUrl: first.body.checkoutUrl });
    expect(retrieveCalls).toBe(1);
    expect(calls.filter((call) => call.body !== 'undefined')).toHaveLength(1);
    expect(repo.recordCheckout).toHaveBeenCalledTimes(1);
  });

  it('reuso da identidade com outro valor retorna 409 antes de chamar Stripe', async () => {
    const intent = randomUUID(); const operation = randomUUID();
    await send(intent, operation).expect(201);
    await send(intent, operation, '13.34').expect(409);
    expect(calls).toHaveLength(1);
  });

  it('concorrência da mesma identidade com fingerprints distintos rejeita a perdedora sem segundo Checkout', async () => {
    vi.useRealTimers();
    const intent = randomUUID(); const operation = randomUUID();
    let entered!: () => void;
    let release!: () => void;
    const enteredStripe = new Promise<void>((resolve) => { entered = resolve; });
    const stripeGate = new Promise<void>((resolve) => { release = resolve; });
    holdStripeResponse = async () => { entered(); await stripeGate; };
    const firstRequest = send(intent, operation, '12.34').then((response) => response);
    await enteredStripe;
    const secondRequest = send(intent, operation, '13.34').then((response) => response);
    await new Promise((resolve) => setTimeout(resolve, 0));
    release();
    const responses = await Promise.all([firstRequest, secondRequest]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    const posts = calls.filter((call) => call.body !== 'undefined');
    expect(posts).toHaveLength(1);
  });

  it('retoma antes de 24h com os parâmetros persistidos mesmo se URLs de ambiente mudarem', async () => {
    const intent = randomUUID(); const operation = randomUUID();
    nextFailure = new Error('socket closed after Stripe created the session');
    await send(intent, operation);
    const originalBody = calls[0].body; const originalKey = calls[0].idempotencyKey;
    vi.setSystemTime(new Date('2026-11-09T11:59:59.999Z'));
    vi.stubEnv('DONATION_SUCCESS_URL', 'https://example.test/success-v2');
    vi.stubEnv('DONATION_CANCEL_URL', 'https://example.test/cancel-v2');
    await send(intent, operation);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toEqual({ body: originalBody, idempotencyKey: originalKey });
  });

  it('na fronteira de 24h permite repetição imediatamente antes e bloqueia no instante seguinte', async () => {
    const intent = randomUUID(); const operation = randomUUID();
    nextFailure = new Error('socket closed after Stripe created the session');
    await send(intent, operation);
    vi.setSystemTime(new Date('2026-11-09T11:59:59.999Z'));
    nextFailure = new Error('socket closed after Stripe created the session');
    await send(intent, operation);
    const postsBeforeBoundary = calls.filter((call) => call.body !== 'undefined').length;
    vi.setSystemTime(new Date('2026-11-09T12:00:00.000Z'));
    expect(Date.now() - repo.createIntent.mock.calls[0][0].firstSentAt.getTime()).toBe(24 * 60 * 60 * 1000);
    const response = await send(intent, operation);
    expect(response.body.message).toBe('Pagamento em verificação; nenhuma nova tentativa foi aberta');
    expect(calls.filter((call) => call.body !== 'undefined')).toHaveLength(postsBeforeBoundary);
  });
});
