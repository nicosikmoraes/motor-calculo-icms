import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaDonationRepository } from '../src/donations/adapters/prisma/prisma-donation-repository.js';
import { PrismaDonationCreationRepository } from '../src/donations/adapters/prisma/donation-creation-repository.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('Defina DATABASE_URL para o PostgreSQL descartável antes de executar test:db.');
const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const orderIds: string[] = [];

describe('histórico e monotonicidade das tentativas no PostgreSQL', () => {
  const repository = new PrismaDonationRepository(prisma);

  afterAll(async () => {
    if (orderIds.length) {
      await pool.query('DELETE FROM donation_opening_reservations WHERE order_id = ANY($1::uuid[])', [orderIds]);
      await pool.query('DELETE FROM payment_events WHERE order_id = ANY($1::uuid[])', [orderIds]);
      await pool.query('DELETE FROM donation_operations WHERE order_id = ANY($1::uuid[])', [orderIds]);
      await pool.query('DELETE FROM payments WHERE order_id = ANY($1::uuid[])', [orderIds]);
      await pool.query('DELETE FROM donation_orders WHERE id = ANY($1::uuid[])', [orderIds]);
    }
    await prisma.$disconnect();
    await pool.end();
  });

  it('preserva recusa seguida de sucesso, evento antigo depois de pago e segunda confirmação sem refund', async () => {
    const orderId = randomUUID(); const firstPaymentId = randomUUID(); const secondPaymentId = randomUUID();
    const firstPi = 'pi_test_first'; const secondPi = 'pi_test_second';
    orderIds.push(orderId);
    await pool.query('INSERT INTO donation_orders (id, intent_key_hash, amount) VALUES ($1, $2, $3)', [orderId, randomUUID(), '12.34']);
    await pool.query('INSERT INTO payments (id, order_id, stripe_idempotency_key, payment_intent_id, checkout_session_id) VALUES ($1, $2, $3, $4, $5)',
      [firstPaymentId, orderId, randomUUID(), firstPi, 'cs_test_first']);
    await pool.query('INSERT INTO payments (id, order_id, stripe_idempotency_key, payment_intent_id, checkout_session_id) VALUES ($1, $2, $3, $4, $5)',
      [secondPaymentId, orderId, randomUUID(), secondPi, 'cs_test_second']);

    await Promise.all([1, 2].map(() => repository.recordPaymentFailure({ orderId, paymentId: firstPaymentId, paymentIntentId: firstPi,
      stripeEventId: 'evt_attempt_declined', occurredAt: new Date('2026-11-08T12:00:00Z') })));
    await repository.confirmPayment({ orderId, paymentId: firstPaymentId, checkoutSessionId: 'cs_test_first',
      paymentIntentId: firstPi, stripeEventId: 'evt_attempt_paid', confirmedAt: new Date('2026-11-08T12:01:00Z') });
    await repository.recordPaymentFailure({ orderId, paymentId: firstPaymentId, paymentIntentId: firstPi,
      stripeEventId: 'evt_old_decline', occurredAt: new Date('2026-11-08T11:59:00Z') });
    await Promise.all([1, 2].map(() => repository.recordSessionExpiration({ orderId, paymentId: firstPaymentId,
      checkoutSessionId: 'cs_test_first', stripeEventId: 'evt_old_expired', occurredAt: new Date('2026-11-08T11:58:00Z') })));
    await repository.confirmPayment({ orderId, paymentId: secondPaymentId, checkoutSessionId: 'cs_test_second',
      paymentIntentId: secondPi, stripeEventId: 'evt_second_charge', confirmedAt: new Date('2026-11-08T12:02:00Z') });

    const result = await pool.query(`SELECT o.status AS order_status, count(*) FILTER (WHERE p.status = 'paga')::int AS paid_attempts,
      (SELECT array_agg(to_status::text ORDER BY occurred_at) FROM payment_events WHERE order_id = o.id AND payment_id = $2) AS history,
      (SELECT count(*)::int FROM payment_events WHERE order_id = o.id AND reason IN ('RECUSA_APOS_CONFIRMACAO','EXPIRACAO_APOS_CONFIRMACAO')) AS late_events
      FROM donation_orders o JOIN payments p ON p.order_id = o.id WHERE o.id = $1 GROUP BY o.id`, [orderId, firstPaymentId]);
    expect(result.rows[0]).toMatchObject({ order_status: 'pago', paid_attempts: 2,
      history: [null, null, 'recusada', 'paga'], late_events: 2 });
    expect((await pool.query(`SELECT count(*)::int AS count FROM payment_events WHERE order_id = $1
      AND stripe_event_id IN ('evt_attempt_declined', 'evt_old_expired')`, [orderId])).rows[0].count).toBe(2);
    expect((await pool.query('SELECT count(*)::int AS count FROM payment_events WHERE order_id = $1 AND reason ILIKE $2',
      [orderId, '%refund%'])).rows[0].count).toBe(0);
  });

  it('marca expiração somente quando chamado com evidência confirmada e deixa o pedido pendente', async () => {
    const orderId = randomUUID(); const paymentId = randomUUID(); orderIds.push(orderId);
    await pool.query('INSERT INTO donation_orders (id, intent_key_hash, amount) VALUES ($1, $2, $3)', [orderId, randomUUID(), '12.34']);
    await pool.query('INSERT INTO payments (id, order_id, stripe_idempotency_key, checkout_session_id) VALUES ($1, $2, $3, $4)',
      [paymentId, orderId, randomUUID(), 'cs_test_expired']);
    await repository.recordSessionExpiration({ orderId, paymentId, checkoutSessionId: 'cs_test_expired',
      stripeEventId: 'evt_session_expired', occurredAt: new Date('2026-11-08T12:00:00Z') });
    const result = await pool.query('SELECT o.status AS order_status, p.status AS payment_status FROM donation_orders o JOIN payments p ON p.order_id = o.id WHERE o.id = $1', [orderId]);
    expect(result.rows[0]).toEqual({ order_status: 'pendente', payment_status: 'expirada' });
  });

  it('deduplica divergência de webhook reentregue sem alterar o estado do pagamento', async () => {
    const orderId = randomUUID(); const paymentId = randomUUID(); orderIds.push(orderId);
    await pool.query('INSERT INTO donation_orders (id, intent_key_hash, amount) VALUES ($1, $2, $3)',
      [orderId, randomUUID(), '12.34']);
    await pool.query('INSERT INTO payments (id, order_id, stripe_idempotency_key) VALUES ($1, $2, $3)',
      [paymentId, orderId, randomUUID()]);
    const divergence = { orderId, paymentId, stripeEventId: `evt_divergence_${randomUUID()}`, reason: 'VALOR_DIVERGENTE' };
    await repository.recordWebhookDivergence(divergence);
    await expect(repository.recordWebhookDivergence(divergence)).resolves.toBeUndefined();
    const events = await pool.query('SELECT count(*)::int AS count FROM payment_events WHERE stripe_event_id = $1',
      [divergence.stripeEventId]);
    const payment = await pool.query('SELECT status, reason FROM payments WHERE id = $1', [paymentId]);
    expect(events.rows[0].count).toBe(1);
    expect(payment.rows[0]).toEqual({ status: 'pendente', reason: null });
  });

  it('consulta pedido e histórico apenas pelo hash correto da chave de intenção', async () => {
    const orderId = randomUUID(); const paymentId = randomUUID(); const intentHash = randomUUID().replaceAll('-', ''); orderIds.push(orderId);
    await pool.query('INSERT INTO donation_orders (id, intent_key_hash, amount) VALUES ($1, $2, $3)', [orderId, intentHash, '12.34']);
    await pool.query('INSERT INTO payments (id, order_id, stripe_idempotency_key) VALUES ($1, $2, $3)', [paymentId, orderId, randomUUID()]);
    const repository = new PrismaDonationCreationRepository(prisma);
    expect(await repository.getOrderIdByIntentHash(intentHash)).toBe(orderId);
    expect(await repository.getAuthorizedDonation(orderId, 'wrong-intent-hash')).toBeNull();
    expect(await repository.getAuthorizedDonation(orderId, intentHash)).toMatchObject({ orderId, status: 'pendente',
      attempts: [{ paymentId, status: 'pendente' }] });
  });

  it('serializa retry e confirmação concorrentes por pedido e nunca rebaixa o pedido pago', async () => {
    const orderId = randomUUID(); const paymentId = randomUUID(); orderIds.push(orderId);
    await pool.query('INSERT INTO donation_orders (id, intent_key_hash, amount) VALUES ($1, $2, $3)', [orderId, 'intent-race-' + randomUUID(), '12.34']);
    await pool.query(`INSERT INTO payments (id, order_id, stripe_idempotency_key, status, checkout_session_id,
      first_sent_at, checkout_parameters, reason) VALUES ($1, $2, $3, 'expirada', $4, $5, $6, 'SESSAO_EXPIRADA')`,
      [paymentId, orderId, randomUUID(), 'cs_test_race_old', new Date(), JSON.stringify({ amountInCents: '1234', currency: 'brl',
        successUrl: 'https://example.test/success', cancelUrl: 'https://example.test/cancel' })]);
    const [intentRow] = (await pool.query('SELECT intent_key_hash FROM donation_orders WHERE id = $1', [orderId])).rows;
    const retry = new PrismaDonationCreationRepository(prisma);
    const [opening] = await Promise.all([
      retry.createRetry({ orderId, intentKeyHash: intentRow.intent_key_hash, currentPaymentId: paymentId, currentStatus: 'expirada',
        operationKeyHash: randomUUID(), fingerprint: randomUUID(), stripeIdempotencyKey: randomUUID(), firstSentAt: new Date() }),
      repository.confirmPayment({ orderId, paymentId, checkoutSessionId: 'cs_test_race_old', stripeEventId: 'evt_race_confirm',
        confirmedAt: new Date() }),
    ]);
    const state = await pool.query(`SELECT o.status AS order_status, count(p.id)::int AS attempts,
      count(*) FILTER (WHERE p.status = 'paga')::int AS paid_attempts FROM donation_orders o
      JOIN payments p ON p.order_id = o.id WHERE o.id = $1 GROUP BY o.id`, [orderId]);
    expect(state.rows[0].order_status).toBe('pago');
    expect(state.rows[0].attempts).toBe(opening ? 2 : 1);
    expect(state.rows[0].paid_attempts).toBe(1);
  });

  it('não reserva novo Checkout a partir de recusa PaymentIntent sem sessão expirada comprovada', async () => {
    const orderId = randomUUID(); const paymentId = randomUUID(); orderIds.push(orderId);
    const intentHash = randomUUID().replaceAll('-', '');
    await pool.query('INSERT INTO donation_orders (id, intent_key_hash, amount) VALUES ($1, $2, $3)', [orderId, intentHash, '12.34']);
    await pool.query(`INSERT INTO payments (id, order_id, stripe_idempotency_key, status, first_sent_at,
      checkout_parameters, reason) VALUES ($1, $2, $3, 'recusada', $4, $5, 'RECUSA_CARTAO')`,
    [paymentId, orderId, randomUUID(), new Date(), JSON.stringify({ amountInCents: '1234', currency: 'brl',
      successUrl: 'https://example.test/success', cancelUrl: 'https://example.test/cancel' })]);
    const repository = new PrismaDonationCreationRepository(prisma);
    const opening = await repository.createRetry({ orderId, intentKeyHash: intentHash, currentPaymentId: paymentId,
      currentStatus: 'recusada', operationKeyHash: randomUUID(), fingerprint: randomUUID(),
      stripeIdempotencyKey: randomUUID(), firstSentAt: new Date() });
    expect(opening).toBeNull();
    expect((await pool.query('SELECT count(*)::int AS count FROM payments WHERE order_id = $1', [orderId])).rows[0].count).toBe(1);
  });

  it('reserva tentativa nova após falha conclusiva antes de criar sessão', async () => {
    const orderId = randomUUID(); const paymentId = randomUUID(); orderIds.push(orderId);
    const intentHash = randomUUID().replaceAll('-', '');
    await pool.query('INSERT INTO donation_orders (id, intent_key_hash, amount) VALUES ($1, $2, $3)', [orderId, intentHash, '12.34']);
    await pool.query(`INSERT INTO payments (id, order_id, stripe_idempotency_key, status, first_sent_at,
      checkout_parameters, reason) VALUES ($1, $2, $3, 'falha_na_criacao', $4, $5, 'REJEICAO_CONCLUSIVA')`,
    [paymentId, orderId, randomUUID(), new Date(), JSON.stringify({ amountInCents: '1234', currency: 'brl',
      successUrl: 'https://example.test/success', cancelUrl: 'https://example.test/cancel' })]);
    const repository = new PrismaDonationCreationRepository(prisma);
    const opening = await repository.createRetry({ orderId, intentKeyHash: intentHash, currentPaymentId: paymentId,
      currentStatus: 'falha_na_criacao', operationKeyHash: randomUUID(), fingerprint: randomUUID(),
      stripeIdempotencyKey: randomUUID(), firstSentAt: new Date() });
    expect(opening).toMatchObject({ isNew: true, orderId, status: 'pendente', checkoutSessionId: null });
    expect((await pool.query('SELECT count(*)::int AS count FROM payments WHERE order_id = $1', [orderId])).rows[0].count).toBe(2);
  });

  it('schema de doações não armazena dados pessoais, cartão nem corpo bruto do webhook', async () => {
    const columns = await pool.query(`SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name IN ('donation_orders', 'payments', 'donation_operations', 'payment_events')`);
    const forbidden = /email|card|cpf|cnpj|tax|billing|payer|customer|payload|body|raw_event/i;
    expect(columns.rows.filter((column: { column_name: string }) => forbidden.test(column.column_name))).toEqual([]);
  });
});
