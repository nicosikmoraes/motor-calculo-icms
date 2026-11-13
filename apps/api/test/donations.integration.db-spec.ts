import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import Stripe from 'stripe';
import request from 'supertest';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { AppModule } from '../src/app.module.js';
import { STRIPE_CLIENT } from '../src/donations/adapters/stripe/stripe.tokens.js';
import { createStripeClient } from '../src/donations/adapters/stripe/stripe-client.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('Defina DATABASE_URL para o PostgreSQL descartável antes de executar test:db.');
const pool = new Pool({ connectionString, connectionTimeoutMillis: 3000 });
const webhookSecret = 'whsec_integration_test';
const identitySecret = 'integration-identity-secret';
const orderIds: string[] = [];

describe('fluxo integrado de doação com PostgreSQL descartável', () => {
  let app: any;
  let prisma: PrismaClient;
  let stripe: Stripe;
  let checkout: Record<string, any> | null;
  let sessionSequence: number;

  beforeEach(async () => {
    vi.stubEnv('DATABASE_URL', connectionString!);
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_integration');
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', webhookSecret);
    vi.stubEnv('DONATION_IDENTITY_SECRET', identitySecret);
    vi.stubEnv('DONATION_SUCCESS_URL', 'https://example.test/donations/return?result=success');
    vi.stubEnv('DONATION_CANCEL_URL', 'https://example.test/donations/return?result=cancel');
    sessionSequence = 0;
    checkout = null;
    stripe = createStripeClient('sk_test_integration', async (input, init) => {
      const url = new URL(input.toString());
      if (init?.method === 'POST' && url.pathname === '/v1/checkout/sessions') {
        const body = new URLSearchParams(String(init.body));
        sessionSequence += 1;
        checkout = {
          id: `cs_test_integration_${sessionSequence}`, object: 'checkout.session',
          url: `https://checkout.stripe.com/c/pay/cs_test_integration_${sessionSequence}`,
          payment_intent: `pi_test_integration_${sessionSequence}`, livemode: false,
          status: 'open', payment_status: 'unpaid', amount_total: Number(body.get('line_items[0][price_data][unit_amount]')),
          currency: 'brl', metadata: {
            donation_order_id: body.get('metadata[donation_order_id]'),
            donation_payment_id: body.get('metadata[donation_payment_id]'),
          },
        };
        return new Response(JSON.stringify(checkout), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      if (url.pathname.startsWith('/v1/checkout/sessions/')) {
        const id = decodeURIComponent(url.pathname.split('/').at(-1) ?? '');
        if (checkout?.id !== id) return new Response(JSON.stringify({ error: { message: 'not found' } }), { status: 404 });
        return new Response(JSON.stringify(checkout), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify({ error: { message: 'unexpected Stripe request' } }), { status: 500 });
    });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(STRIPE_CLIENT).useValue(stripe)
      .compile();
    app = module.createNestApplication({ rawBody: true });
    await app.init();
    prisma = app.get(PrismaClient);
  });

  afterEach(async () => {
    if (app) await app.close();
    if (prisma) await prisma.$disconnect();
    if (orderIds.length) {
      const ids = [orderIds.splice(0)];
      await pool.query('DELETE FROM donation_opening_reservations WHERE order_id = ANY($1::uuid[])', ids);
      await pool.query('DELETE FROM payment_events WHERE order_id = ANY($1::uuid[])', ids);
      await pool.query('DELETE FROM donation_operations WHERE order_id = ANY($1::uuid[])', ids);
      await pool.query('DELETE FROM payments WHERE order_id = ANY($1::uuid[])', ids);
      await pool.query('DELETE FROM donation_orders WHERE id = ANY($1::uuid[])', ids);
    }
    vi.unstubAllEnvs();
  });

  afterAll(async () => pool.end());

  function signedEvent(type: string, object: Record<string, any>) {
    const event = { id: `evt_${randomUUID().replaceAll('-', '')}`, object: 'event', api_version: '2025-08-27.basil',
      created: Math.floor(Date.now() / 1000), data: { object }, livemode: false, pending_webhooks: 1, request: null, type };
    const payload = JSON.stringify(event);
    return { payload, signature: stripe.webhooks.generateTestHeaderString({ payload, secret: webhookSecret }) };
  }

  it('persiste a mesma intenção, recebe retorno pendente, confirma por webhook assinado e consulta como pago', async () => {
    const intent = randomUUID();
    const created = await request(app.getHttpServer()).post('/donation-orders')
      .set('X-Donation-Intent', intent).set('Idempotency-Key', randomUUID())
      .send({ amount: '12.34', currency: 'BRL' }).expect(201);
    const orderId = created.body.data.orderId as string;
    orderIds.push(orderId);

    const pendingRows = await pool.query(`SELECT o.status AS order_status, p.id::text AS payment_id, p.status AS payment_status
      FROM donation_orders o JOIN payments p ON p.order_id = o.id WHERE o.id = $1`, [orderId]);
    expect(pendingRows.rows).toHaveLength(1);
    expect(pendingRows.rows[0]).toMatchObject({ order_status: 'pendente', payment_status: 'pendente' });
    expect(checkout?.metadata).toEqual({ donation_order_id: orderId, donation_payment_id: pendingRows.rows[0].payment_id });

    await request(app.getHttpServer()).get('/donations/return?result=success').expect(200)
      .then((response) => expect(response.text).toContain('Aguardando confirmação do pagamento'));
    expect((await pool.query('SELECT status FROM donation_orders WHERE id = $1', [orderId])).rows[0].status).toBe('pendente');

    checkout = { ...checkout, status: 'complete', payment_status: 'paid' };
    const event = signedEvent('checkout.session.completed', { ...checkout });
    await request(app.getHttpServer()).post('/webhooks/stripe').set('Content-Type', 'application/json')
      .set('Stripe-Signature', event.signature).send(event.payload).expect(200);

    const current = await request(app.getHttpServer()).get('/donation-orders/current')
      .set('X-Donation-Intent', intent).expect(200);
    expect(current.body.data).toMatchObject({ orderId, status: 'pago', attempts: [
      expect.objectContaining({ paymentId: pendingRows.rows[0].payment_id, status: 'paga' }),
    ] });
    expect((await pool.query('SELECT status FROM donation_orders WHERE id = $1', [orderId])).rows[0].status).toBe('pago');
  });

  it('recebe recusa assinada, reabre tentativa somente após Stripe provar expiração e consulta o histórico', async () => {
    const intent = randomUUID();
    const created = await request(app.getHttpServer()).post('/donation-orders')
      .set('X-Donation-Intent', intent).set('Idempotency-Key', randomUUID())
      .send({ amount: '12.34', currency: 'BRL' }).expect(201);
    const orderId = created.body.data.orderId as string;
    orderIds.push(orderId);
    const originalPaymentId = checkout?.metadata.donation_payment_id as string;

    const failed = signedEvent('payment_intent.payment_failed', {
      id: checkout?.payment_intent, object: 'payment_intent', amount: 1234, currency: 'brl', livemode: false,
      metadata: { donation_order_id: orderId, donation_payment_id: originalPaymentId },
    });
    await request(app.getHttpServer()).post('/webhooks/stripe').set('Content-Type', 'application/json')
      .set('Stripe-Signature', failed.signature).send(failed.payload).expect(200);
    checkout = { ...checkout, status: 'expired', payment_status: 'unpaid' };

    const retried = await request(app.getHttpServer()).post(`/donation-orders/${orderId}/attempts`)
      .set('X-Donation-Intent', intent).set('Idempotency-Key', randomUUID())
      .expect(200);
    expect(retried.body.data).toMatchObject({ orderId, status: 'pendente', reused: false });
    const state = await request(app.getHttpServer()).get(`/donation-orders/${orderId}`)
      .set('X-Donation-Intent', intent).expect(200);
    expect(state.body.data.attempts).toHaveLength(2);
    expect(state.body.data.attempts[0]).toMatchObject({ status: 'pendente' });
    expect(state.body.data.attempts[1]).toMatchObject({ paymentId: originalPaymentId, status: 'expirada' });
    expect((await pool.query('SELECT count(*)::int AS attempts FROM payments WHERE order_id = $1', [orderId])).rows[0].attempts).toBe(2);
  });
});
