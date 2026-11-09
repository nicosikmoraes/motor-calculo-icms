import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { Pool } from 'pg';
import request from 'supertest';
import Stripe from 'stripe';
import { AppModule } from '../src/app.module.js';
import { STRIPE_CHECKOUT_GATEWAY } from '../src/donations/ports/stripe-checkout-gateway.js';
import { STRIPE_CLIENT } from '../src/donations/adapters/stripe/stripe.tokens.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('Defina DATABASE_URL para o PostgreSQL descartável antes de executar test:db.');

const webhookSecret = 'whsec_atomicity_test';
const pool = new Pool({ connectionString, connectionTimeoutMillis: 3000 });
const orderIds: string[] = [];

describe('atomicidade do webhook com PostgreSQL', () => {
  let app: any;
  let stripe: Stripe;
  let orderId: string;
  let paymentId: string;
  let sessionId: string;

  beforeEach(async () => {
    vi.stubEnv('DATABASE_URL', connectionString!);
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', webhookSecret);
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_atomicity');
    orderId = randomUUID();
    paymentId = randomUUID();
    sessionId = `cs_test_${randomUUID().replaceAll('-', '')}`;
    orderIds.push(orderId);
    await pool.query('INSERT INTO donation_orders (id, intent_key_hash, amount) VALUES ($1, $2, $3)', [orderId, randomUUID(), '12.34']);
    await pool.query('INSERT INTO payments (id, order_id, stripe_idempotency_key) VALUES ($1, $2, $3)', [paymentId, orderId, randomUUID()]);

    stripe = new Stripe('sk_test_atomicity');
    const gateway = {
      createCheckout: vi.fn(),
      retrieveCheckout: vi.fn(async (id: string) => ({
        id, url: null, paymentIntentId: `pi_test_${paymentId.replaceAll('-', '')}`, orderId, paymentId,
        amountInCents: '1234', currency: 'brl', livemode: false, status: 'complete', paymentStatus: 'paid' as const,
      })),
    };
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(STRIPE_CLIENT).useValue(stripe)
      .overrideProvider(STRIPE_CHECKOUT_GATEWAY).useValue(gateway)
      .compile();
    app = module.createNestApplication({ rawBody: true });
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    await pool.query('ALTER TABLE payment_events DROP CONSTRAINT IF EXISTS payment_events_test_injected_failure');
    if (orderIds.length) {
      await pool.query('DELETE FROM payment_events WHERE order_id = ANY($1::uuid[])', [orderIds]);
      await pool.query('DELETE FROM donation_operations WHERE order_id = ANY($1::uuid[])', [orderIds]);
      await pool.query('DELETE FROM payments WHERE order_id = ANY($1::uuid[])', [orderIds]);
      await pool.query('DELETE FROM donation_orders WHERE id = ANY($1::uuid[])', [orderIds]);
    }
    await pool.end();
  });

  function signedPayload(eventId: string) {
    const event = {
      id: eventId, object: 'event', api_version: '2025-08-27.basil', created: 1794140000,
      data: { object: {
        id: sessionId, object: 'checkout.session', payment_intent: `pi_test_${paymentId.replaceAll('-', '')}`,
        livemode: false, payment_status: 'paid', amount_total: 1234, currency: 'brl',
        metadata: { donation_order_id: orderId, donation_payment_id: paymentId },
      } },
      livemode: false, pending_webhooks: 1, request: null, type: 'checkout.session.completed',
    };
    const payload = JSON.stringify(event);
    return { payload, signature: stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret }) };
  }

  async function post(eventId: string) {
    const { payload, signature } = signedPayload(eventId);
    return request(app.getHttpServer()).post('/webhooks/stripe')
      .set('Content-Type', 'application/json').set('Stripe-Signature', signature).send(payload);
  }

  async function storedState(eventId: string) {
    const result = await pool.query(
      `SELECT o.status AS order_status, o.confirmed_at AS order_confirmed_at,
              p.status AS payment_status, p.checkout_session_id, p.payment_intent_id,
              p.confirmed_at AS payment_confirmed_at,
              (SELECT count(*)::int FROM payment_events e WHERE e.order_id = o.id AND e.to_status = 'paga') AS confirmations,
              (SELECT count(*)::int FROM payment_events e WHERE e.order_id = o.id AND e.stripe_event_id = $2) AS event_id_rows
       FROM donation_orders o JOIN payments p ON p.order_id = o.id WHERE o.id = $1`, [orderId, eventId],
    );
    return result.rows[0];
  }

  it('processa o mesmo evento repetido e concorrente com uma única confirmação persistida', async () => {
    const eventId = `evt_${randomUUID().replaceAll('-', '')}`;
    const responses = await Promise.all(Array.from({ length: 6 }, () => post(eventId)));

    expect(responses.map(({ status }) => status)).toEqual([200, 200, 200, 200, 200, 200]);
    expect(await storedState(eventId)).toMatchObject({
      order_status: 'pago', payment_status: 'paga', checkout_session_id: sessionId,
      payment_intent_id: `pi_test_${paymentId.replaceAll('-', '')}`, confirmations: 1, event_id_rows: 1,
    });
  });

  it('não cria uma segunda confirmação para IDs de evento diferentes da mesma sessão', async () => {
    const eventId = `evt_${randomUUID().replaceAll('-', '')}`;
    const first = await post(eventId);
    const second = await post(`evt_${randomUUID().replaceAll('-', '')}`);

    expect([first.status, second.status]).toEqual([200, 200]);
    expect(await storedState(eventId)).toMatchObject({
      order_status: 'pago', payment_status: 'paga', checkout_session_id: sessionId,
      payment_intent_id: `pi_test_${paymentId.replaceAll('-', '')}`, confirmations: 1, event_id_rows: 1,
    });
  });

  it('faz rollback integral e responde 503 após falha entre gravações; a reentrega conclui', async () => {
    const eventId = `evt_${randomUUID().replaceAll('-', '')}`;
    await pool.query(
      `ALTER TABLE payment_events ADD CONSTRAINT payment_events_test_injected_failure
       CHECK (stripe_event_id IS DISTINCT FROM '${eventId}')`,
    );

    const failed = await post(eventId);
    expect(failed.status).toBe(503);
    expect(await storedState(eventId)).toEqual({
      order_status: 'pendente', order_confirmed_at: null,
      payment_status: 'pendente', checkout_session_id: null, payment_intent_id: null,
      payment_confirmed_at: null, confirmations: 0, event_id_rows: 0,
    });

    await pool.query('ALTER TABLE payment_events DROP CONSTRAINT payment_events_test_injected_failure');
    const retried = await post(eventId);
    expect(retried.status).toBe(200);
    expect(await storedState(eventId)).toMatchObject({
      order_status: 'pago', payment_status: 'paga', checkout_session_id: sessionId,
      payment_intent_id: `pi_test_${paymentId.replaceAll('-', '')}`, confirmations: 1, event_id_rows: 1,
    });
    const confirmedState = await storedState(eventId);
    expect(confirmedState.order_confirmed_at).toBeInstanceOf(Date);
    expect(confirmedState.payment_confirmed_at).toBeInstanceOf(Date);
  });
});
