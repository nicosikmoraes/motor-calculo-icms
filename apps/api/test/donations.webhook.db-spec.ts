import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import Stripe from 'stripe';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaDonationCreationRepository } from '../src/donations/adapters/prisma/donation-creation-repository.js';
import { PrismaDonationRepository } from '../src/donations/adapters/prisma/prisma-donation-repository.js';
import { StripeCheckoutAdapter } from '../src/donations/adapters/stripe/stripe-checkout.adapter.js';
import { CreateDonation } from '../src/donations/application/create-donation.js';
import { HandleStripeEvent } from '../src/donations/application/handle-stripe-event.js';
import { createHash } from 'node:crypto';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('Defina DATABASE_URL para o PostgreSQL descartável antes de executar test:db.');
const pool = new Pool({ connectionString, connectionTimeoutMillis: 3000 });
const orderIds: string[] = [];

afterEach(async () => {
  if (orderIds.length === 0) return;
  const ids = [orderIds];
  await pool.query('DELETE FROM donation_opening_reservations WHERE order_id = ANY($1::uuid[])', ids);
  await pool.query('DELETE FROM payment_events WHERE order_id = ANY($1::uuid[])', ids);
  await pool.query('DELETE FROM donation_operations WHERE order_id = ANY($1::uuid[])', ids);
  await pool.query('DELETE FROM payments WHERE order_id = ANY($1::uuid[])', ids);
  await pool.query('DELETE FROM donation_orders WHERE id = ANY($1::uuid[])', ids);
  orderIds.length = 0;
});
afterAll(async () => pool.end());

describe('Webhook de doação com PostgreSQL', () => {
  it('concilia os IDs persistidos e enviados ao Stripe antes da resposta de criação', async () => {
    const client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    const creation = new PrismaDonationCreationRepository(client);
    const repository = new PrismaDonationRepository(client);
    const orderIdempotency = `intent-${randomUUID()}`;
    const operationKey = `operation-${randomUUID()}`;
    let postBody: URLSearchParams | undefined;
    let releasePost!: () => void;
    let startedPost!: () => void;
    const postGate = new Promise<void>((resolve) => { releasePost = resolve; });
    const started = new Promise<void>((resolve) => { startedPost = resolve; });
    const session = (id: string, metadata: Record<string, string>) => ({
      id, object: 'checkout.session', url: 'https://checkout.stripe.com/c/pay/cs_test_early',
      payment_intent: 'pi_test_early', livemode: false, status: 'complete', payment_status: 'paid',
      amount_total: 1234, currency: 'brl', metadata,
    });
    const fetchControl: typeof fetch = async (_input, init) => {
      if (init?.method === 'POST') {
        postBody = new URLSearchParams(String(init.body));
        startedPost();
        await postGate;
        return new Response(JSON.stringify(session('cs_test_early', {
          donation_order_id: postBody.get('metadata[donation_order_id]') ?? '',
          donation_payment_id: postBody.get('metadata[donation_payment_id]') ?? '',
        })), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(JSON.stringify(session('cs_test_early', {
        donation_order_id: postBody?.get('metadata[donation_order_id]') ?? '',
        donation_payment_id: postBody?.get('metadata[donation_payment_id]') ?? '',
      })), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const stripe = new StripeCheckoutAdapter(new Stripe('sk_test_controlled', { httpClient: Stripe.createFetchHttpClient(fetchControl) }));
    const create = new CreateDonation(creation, stripe, {
      stripeSecretKey: 'sk_test_controlled', successUrl: 'https://example.test/success',
      cancelUrl: 'https://example.test/cancel', identitySecret: 'test-identity-secret',
    });
    const handler = new HandleStripeEvent(repository, stripe);
    let pendingCreation: ReturnType<typeof create.execute> | undefined;
    try {
      pendingCreation = create.execute({ intent: orderIdempotency, operation: operationKey }, { amount: '12.34', currency: 'BRL' });
      await started;
      const persistedBeforeWebhook = await pool.query(
        `SELECT o.id::text AS order_id, p.id::text AS payment_id, o.status AS order_status, p.status AS payment_status
         FROM donation_orders o JOIN payments p ON p.order_id = o.id WHERE o.intent_key_hash = $1`,
        [createHash('sha256').update(orderIdempotency).digest('hex')],
      );
      expect(persistedBeforeWebhook.rows).toHaveLength(1);
      const [persisted] = persistedBeforeWebhook.rows;
      expect(persisted).toMatchObject({ order_status: 'pendente', payment_status: 'pendente' });
      orderIds.push(persisted.order_id);
      expect(postBody?.get('metadata[donation_order_id]')).toBe(persisted.order_id);
      expect(postBody?.get('metadata[donation_payment_id]')).toBe(persisted.payment_id);

      await handler.execute({
        id: `evt_${randomUUID().replaceAll('-', '')}`,
        created: Math.floor(Date.now() / 1000), livemode: false,
        type: 'checkout.session.completed',
        session: { id: 'cs_test_early', object: 'checkout.session', orderId: persisted.order_id, paymentId: persisted.payment_id },
      });
      const confirmed = await pool.query(
        `SELECT o.id::text AS order_id, p.id::text AS payment_id, o.status AS order_status, p.status AS payment_status,
                p.checkout_session_id
         FROM donation_orders o JOIN payments p ON p.order_id = o.id WHERE o.id = $1`,
        [persisted.order_id],
      );
      expect(confirmed.rows).toEqual([{
        order_id: persisted.order_id, payment_id: persisted.payment_id,
        order_status: 'pago', payment_status: 'paga', checkout_session_id: 'cs_test_early',
      }]);
      releasePost();
      const created = await pendingCreation!;
      expect(created.donation.orderId).toBe(persisted.order_id);
      expect(created.donation.paymentId).toBe(persisted.payment_id);
      expect((await pool.query(
        `SELECT (SELECT count(*)::int FROM donation_orders WHERE intent_key_hash = $1) AS order_count,
                (SELECT count(*)::int FROM payments WHERE order_id = $2) AS payment_count`,
        [createHash('sha256').update(orderIdempotency).digest('hex'), persisted.order_id],
      )).rows).toEqual([{ order_count: 1, payment_count: 1 }]);
    } finally {
      releasePost();
      await client.$disconnect();
    }
  });

  it('persiste divergência verificável só com IDs e motivo, sem alterar estados ou criar pedido desconhecido', async () => {
    const client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
    const orderId = randomUUID();
    const paymentId = randomUUID();
    orderIds.push(orderId);
    try {
      await pool.query('INSERT INTO donation_orders (id, intent_key_hash, amount) VALUES ($1, $2, $3)', [orderId, randomUUID(), '12.34']);
      await pool.query('INSERT INTO payments (id, order_id, stripe_idempotency_key) VALUES ($1, $2, $3)', [paymentId, orderId, randomUUID()]);
      const repository = new PrismaDonationRepository(client);
      const retrieved = {
        id: 'cs_test_divergent', url: null, paymentIntentId: null, orderId, paymentId,
        amountInCents: '1235', currency: 'brl', livemode: false, status: 'complete', paymentStatus: 'paid' as const,
      };
      const handler = new HandleStripeEvent(repository, { createCheckout: async () => retrieved,
        retrieveCheckout: async () => retrieved, expireCheckout: async () => retrieved });
      const eventId = `evt_${randomUUID().replaceAll('-', '')}`;
      await handler.execute({ id: eventId, type: 'checkout.session.completed', created: 1794140000, livemode: false,
        session: { id: retrieved.id, object: 'checkout.session', orderId, paymentId } });
      expect((await pool.query(
        `SELECT origin, to_status, reason, stripe_event_id FROM payment_events WHERE order_id = $1 AND payment_id = $2`, [orderId, paymentId],
      )).rows).toEqual([{ origin: 'webhook', to_status: null, reason: 'VALOR_DIVERGENTE', stripe_event_id: eventId }]);
      expect((await pool.query(
        `SELECT o.status AS order_status, p.status AS payment_status, p.checkout_session_id FROM donation_orders o JOIN payments p ON p.order_id = o.id WHERE o.id = $1`, [orderId],
      )).rows).toEqual([{ order_status: 'pendente', payment_status: 'pendente', checkout_session_id: null }]);

      const beforeUnknown = await pool.query('SELECT count(*)::int AS count FROM donation_orders');
      const unknownOrderId = randomUUID();
      await handler.execute({ id: `evt_${randomUUID().replaceAll('-', '')}`, type: 'checkout.session.completed',
        created: 1794140001, livemode: false, session: { id: retrieved.id, object: 'checkout.session',
          orderId: unknownOrderId, paymentId: randomUUID() } });
      expect((await pool.query('SELECT count(*)::int AS count FROM donation_orders')).rows).toEqual(beforeUnknown.rows);
      expect((await pool.query('SELECT count(*)::int AS count FROM payment_events WHERE order_id = $1', [unknownOrderId])).rows)
        .toEqual([{ count: 0 }]);
    } finally { await client.$disconnect(); }
  });
});
