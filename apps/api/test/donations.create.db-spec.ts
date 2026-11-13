import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import request from 'supertest';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { AppModule } from '../src/app.module.js';
import { CreateDonation, DonationCreationError } from '../src/donations/application/create-donation.js';
import { PrismaDonationCreationRepository } from '../src/donations/adapters/prisma/donation-creation-repository.js';
import { PrismaDonationRepository } from '../src/donations/adapters/prisma/prisma-donation-repository.js';
import { StripeCheckoutAdapter } from '../src/donations/adapters/stripe/stripe-checkout.adapter.js';
import { STRIPE_CLIENT } from '../src/donations/adapters/stripe/stripe.tokens.js';
import { createStripeClient } from '../src/donations/adapters/stripe/stripe-client.js';
import { DONATION_CREATION_REPOSITORY } from '../src/donations/ports/donation-creation-repository.js';
import { DonationOperationConflictError } from '../src/donations/ports/donation-creation-repository.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('Defina DATABASE_URL para o PostgreSQL descartável antes de executar test:db.');

const pool = new Pool({ connectionString, connectionTimeoutMillis: 3000 });
const client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const orderIds: string[] = [];

afterEach(async () => {
  if (orderIds.length) {
    await pool.query('DELETE FROM donation_opening_reservations WHERE order_id = ANY($1::uuid[])', [orderIds]);
    await pool.query('DELETE FROM payment_events WHERE order_id = ANY($1::uuid[])', [orderIds]);
    await pool.query('DELETE FROM donation_operations WHERE order_id = ANY($1::uuid[])', [orderIds]);
    await pool.query('DELETE FROM payments WHERE order_id = ANY($1::uuid[])', [orderIds]);
    await pool.query('DELETE FROM donation_orders WHERE id = ANY($1::uuid[])', [orderIds]);
    orderIds.length = 0;
  }
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await client.$disconnect();
  await pool.end();
});

describe('reserva durável de operação idempotente', () => {
  it('retorna a mesma tentativa e snapshot após configuração mudar e rejeita fingerprint divergente', async () => {
    const repository = new PrismaDonationCreationRepository(client);
    const input = {
      intentKeyHash: randomUUID().replaceAll('-', ''), operationKeyHash: randomUUID().replaceAll('-', ''),
      amount: '12.34', fingerprint: 'fp-1234', stripeIdempotencyKey: `donation_${randomUUID().replaceAll('-', '')}`,
      firstSentAt: new Date('2026-11-08T12:00:00.000Z'), amountInCents: '1234',
      successUrl: 'https://example.test/original-success', cancelUrl: 'https://example.test/original-cancel',
    };
    const [first, concurrent] = await Promise.all([repository.createIntent(input), repository.createIntent(input)]);
    expect(concurrent).toMatchObject({ orderId: first.orderId, paymentId: first.paymentId });
    expect([first.isNew, concurrent.isNew].sort()).toEqual([false, true]);
    orderIds.push(first.orderId);

    const recovered = await repository.createIntent({ ...input, successUrl: 'https://example.test/changed-success', cancelUrl: 'https://example.test/changed-cancel' });
    expect(recovered).toMatchObject({ orderId: first.orderId, paymentId: first.paymentId, successUrl: input.successUrl,
      cancelUrl: input.cancelUrl, stripeIdempotencyKey: input.stripeIdempotencyKey, amountInCents: '1234' });
    await expect(repository.createIntent({ ...input, fingerprint: 'different-fingerprint', amount: '13.34' }))
      .rejects.toBeInstanceOf(DonationOperationConflictError);
    const rows = await pool.query('SELECT count(*)::int AS count FROM payments WHERE order_id = $1::uuid', [first.orderId]);
    expect(rows.rows[0].count).toBe(1);
  });
});

describe('Criação de doação com valor acima do limite DECIMAL(65,2)', () => {
  it('persiste 64 dígitos inteiros exatos, envia esse valor ao Stripe e registra VALOR_NAO_ACEITO', async () => {
    const amount = `${'1'}${'0'.repeat(63)}.37`;
    const intent = randomUUID();
    const operation = randomUUID();
    const outgoingBodies: string[] = [];
    let stripeCalls = 0;
    const stripe = createStripeClient('sk_test_controlled', async (_input, init) => {
      stripeCalls += 1;
      outgoingBodies.push(typeof init?.body === 'string' ? init.body : '');
      return new Response(
        '{"error":{"type":"invalid_request_error","code":"amount_too_large","message":"Stripe boundary"}}',
        { status: 400, headers: { 'content-type': 'application/json', 'request-id': 'req_large_amount' } },
      );
    });
    const gateway = new StripeCheckoutAdapter(stripe);
    const service = new CreateDonation(
      new PrismaDonationCreationRepository(client),
      gateway,
      {
        stripeSecretKey: 'sk_test_controlled',
        successUrl: 'https://example.test/donations/return?result=success',
        cancelUrl: 'https://example.test/donations/return?result=cancel',
      },
    );

    let failure: DonationCreationError | undefined;
    try {
      await service.execute({ intent, operation }, { amount, currency: 'BRL' });
    } catch (error) {
      if (error instanceof DonationCreationError) failure = error;
      else throw error;
    }

    expect(failure).toMatchObject({
      code: 'gateway_rejected_amount',
      details: { orderId: expect.any(String), status: 'falha_na_criacao', reason: 'VALOR_NAO_ACEITO' },
    });
    const orderId = failure?.details.orderId as string | undefined;
    expect(orderId).toBeDefined();
    if (!orderId) return;
    orderIds.push(orderId);

    const persisted = await pool.query(
      'SELECT amount::text, status FROM donation_orders WHERE id = $1::uuid', [orderId],
    );
    expect(persisted.rows).toEqual([{ amount, status: 'pendente' }]);
    const payment = await pool.query(
      'SELECT status, reason FROM payments WHERE order_id = $1::uuid', [orderId],
    );
    expect(payment.rows).toEqual([{ status: 'falha_na_criacao', reason: 'VALOR_NAO_ACEITO' }]);
    await expect(pool.query('UPDATE donation_orders SET amount = amount + 1 WHERE id = $1::uuid', [orderId]))
      .rejects.toMatchObject({ code: '23514' });
    await expect(pool.query(
      'INSERT INTO donation_orders (intent_key_hash, amount) VALUES ($1, $2::numeric)',
      [randomUUID(), '10.001'],
    )).rejects.toMatchObject({ code: '23514' });
    expect(stripeCalls).toBe(1);
    const sent = new URLSearchParams(outgoingBodies[0]);
    expect(sent.get('line_items[0][price_data][unit_amount]')).toBe(`${'1'}${'0'.repeat(63)}37`);
  });
});

describe('POST de criação com PostgreSQL real durante HTTP 503 do Stripe', () => {
  it('prova persistência antes da chamada e confere IDs, estados e reserva duráveis após 503', async () => {
    vi.stubEnv('DATABASE_URL', connectionString!);
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_controlled');
    vi.stubEnv('DONATION_SUCCESS_URL', 'https://example.test/donations/return?result=success');
    vi.stubEnv('DONATION_CANCEL_URL', 'https://example.test/donations/return?result=cancel');

    let openingObservedDuringStripe: {
      orderId: string;
      amount: string;
      orderStatus: string;
      paymentId: string;
      paymentStatus: string;
      operationCount: number;
      reservationCount: number;
    } | undefined;
    let stripeCalls = 0;
    const stripe = createStripeClient('sk_test_controlled', async (_input, init) => {
      stripeCalls += 1;
      const form = new URLSearchParams(typeof init?.body === 'string' ? init.body : String(init?.body ?? ''));
      const orderId = form.get('metadata[donation_order_id]');
      const paymentId = form.get('metadata[donation_payment_id]');
      if (orderId && paymentId) {
        const [order, payment, operation, reservation] = await Promise.all([
          pool.query('SELECT amount::text, status FROM donation_orders WHERE id = $1::uuid', [orderId]),
          pool.query('SELECT status FROM payments WHERE id = $1::uuid AND order_id = $2::uuid', [paymentId, orderId]),
          pool.query('SELECT count(*)::int AS count FROM donation_operations WHERE order_id = $1::uuid AND payment_id = $2::uuid', [orderId, paymentId]),
          pool.query('SELECT count(*)::int AS count FROM donation_opening_reservations WHERE order_id = $1::uuid', [orderId]),
        ]);
        openingObservedDuringStripe = {
          orderId,
          amount: order.rows[0]?.amount,
          orderStatus: order.rows[0]?.status,
          paymentId,
          paymentStatus: payment.rows[0]?.status,
          operationCount: operation.rows[0].count,
          reservationCount: reservation.rows[0].count,
        };
      }
      return new Response('{"error":{"type":"api_error","message":"unavailable"}}', {
        status: 503,
        headers: { 'content-type': 'application/json', 'request-id': 'req_db_503' },
      });
    });
    const testModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaClient).useValue(client)
      .overrideProvider(DONATION_CREATION_REPOSITORY).useValue(new PrismaDonationCreationRepository(client))
      .overrideProvider(STRIPE_CLIENT).useValue(stripe)
      .compile();
    const app = testModule.createNestApplication();
    await app.init();

    try {
      const amount = '98765432109876543210.43';
      const response = await request(app.getHttpServer())
        .post('/donation-orders')
        .set('X-Donation-Intent', randomUUID())
        .set('Idempotency-Key', randomUUID())
        .send({ amount, currency: 'BRL' })
        .expect(503);
      expect(stripeCalls).toBe(1);

      // Guarantee 1: independent PostgreSQL reads from inside fetch prove the
      // intent transaction committed before control crossed the Stripe boundary.
      expect(openingObservedDuringStripe).toMatchObject({
        amount,
        orderStatus: 'pendente',
        paymentStatus: 'pendente',
        operationCount: 1,
        reservationCount: 1,
      });

      // Guarantee 2: response identifiers must identify those same real rows,
      // and the indeterminate state plus reservation survive the HTTP 503.
      expect(response.body.error).toMatchObject({
        statusCode: 503,
        orderId: openingObservedDuringStripe?.orderId,
        paymentId: openingObservedDuringStripe?.paymentId,
        status: 'indeterminada',
        reason: 'STRIPE_HTTP_503',
      });
      const orderId = response.body.error.orderId as string;
      const paymentId = response.body.error.paymentId as string;
      orderIds.push(orderId);
      const [order, payment, reservation, event] = await Promise.all([
        pool.query('SELECT id::text, amount::text, status FROM donation_orders WHERE id = $1::uuid', [orderId]),
        pool.query('SELECT id::text, order_id::text, status, reason FROM payments WHERE id = $1::uuid AND order_id = $2::uuid', [paymentId, orderId]),
        pool.query('SELECT order_id::text FROM donation_opening_reservations WHERE order_id = $1::uuid', [orderId]),
        pool.query('SELECT payment_id::text, to_status, reason FROM payment_events WHERE order_id = $1::uuid ORDER BY occurred_at DESC LIMIT 1', [orderId]),
      ]);
      expect(order.rows).toEqual([{ id: orderId, amount, status: 'pendente' }]);
      expect(payment.rows).toEqual([{ id: paymentId, order_id: orderId, status: 'indeterminada', reason: 'STRIPE_HTTP_503' }]);
      expect(reservation.rows).toEqual([{ order_id: orderId }]);
      expect(event.rows).toEqual([{ payment_id: paymentId, to_status: 'indeterminada', reason: 'STRIPE_HTTP_503' }]);
      expect(stripeCalls).toBe(1);
    } finally {
      await app.close();
    }
  });
});

describe('confirmação concorrente durante a criação Stripe', () => {
  it('preserva estado pago se a confirmação transacional chega antes da resposta incerta', async () => {
    const confirmationRepository = new PrismaDonationRepository(client);
    let confirmationResult: boolean | undefined;
    let observedIds: { orderId: string; paymentId: string } | undefined;
    let stripeCalls = 0;
    const stripe = createStripeClient('sk_test_controlled', async (_input, init) => {
      stripeCalls += 1;
      const form = new URLSearchParams(typeof init?.body === 'string' ? init.body : String(init?.body ?? ''));
      const orderId = form.get('metadata[donation_order_id]');
      const paymentId = form.get('metadata[donation_payment_id]');
      if (!orderId || !paymentId) throw new Error('Stripe não recebeu os IDs persistidos da operação');
      observedIds = { orderId, paymentId };
      orderIds.push(orderId);

      // Simula o evento concorrente usando apenas a transação de confirmação de T1.
      confirmationResult = await confirmationRepository.confirmPayment({
        orderId,
        paymentId,
        checkoutSessionId: 'cs_test_confirmed_during_open',
        paymentIntentId: 'pi_test_confirmed_during_open',
        stripeEventId: `evt_${randomUUID()}`,
        confirmedAt: new Date('2026-11-08T18:00:00.000Z'),
      });
      throw new Error('socket closed after Stripe created the session');
    });
    const service = new CreateDonation(
      new PrismaDonationCreationRepository(client),
      new StripeCheckoutAdapter(stripe),
      {
        stripeSecretKey: 'sk_test_controlled',
        successUrl: 'https://example.test/donations/return?result=success',
        cancelUrl: 'https://example.test/donations/return?result=cancel',
      },
    );

    await expect(service.execute({ intent: randomUUID(), operation: randomUUID() }, { amount: '12.34', currency: 'BRL' }))
      .rejects.toMatchObject({ code: 'result_uncertain' });
    expect(stripeCalls).toBe(1);
    expect(confirmationResult).toBe(true);
    expect(observedIds).toBeDefined();
    const [order, payment, events] = await Promise.all([
      pool.query('SELECT status FROM donation_orders WHERE id = $1::uuid', [observedIds?.orderId]),
      pool.query('SELECT status, reason, checkout_session_id FROM payments WHERE id = $1::uuid', [observedIds?.paymentId]),
      pool.query("SELECT to_status FROM payment_events WHERE order_id = $1::uuid ORDER BY occurred_at", [observedIds?.orderId]),
    ]);
    expect(order.rows).toEqual([{ status: 'pago' }]);
    expect(payment.rows).toEqual([{ status: 'paga', reason: null, checkout_session_id: 'cs_test_confirmed_during_open' }]);
    expect(events.rows.map((row) => row.to_status)).toEqual(['paga']);
  });
});
