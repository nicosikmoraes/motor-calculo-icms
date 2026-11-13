import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('Defina DATABASE_URL para o PostgreSQL descartável antes de executar test:db.');
}

const pool = new Pool({ connectionString, connectionTimeoutMillis: 3000 });
const orderIds: string[] = [];

async function addOrder(intentKeyHash = randomUUID()): Promise<string> {
  const id = randomUUID();
  await pool.query(
    'INSERT INTO donation_orders (id, intent_key_hash, amount) VALUES ($1, $2, $3)',
    [id, intentKeyHash, '10.37'],
  );
  orderIds.push(id);
  return id;
}

async function addPayment(orderId: string, checkoutSessionId: string | null = null): Promise<string> {
  const id = randomUUID();
  await pool.query(
    `INSERT INTO payments (id, order_id, stripe_idempotency_key, checkout_session_id)
     VALUES ($1, $2, $3, $4)`,
    [id, orderId, randomUUID(), checkoutSessionId],
  );
  return id;
}

async function repository() {
  const { PrismaClient } = await import('../src/generated/prisma/client.js');
  const { PrismaDonationRepository } = await import(
    '../src/donations/adapters/prisma/prisma-donation-repository.js'
  );
  const client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  return { client, donations: new PrismaDonationRepository(client) };
}

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

describe('Persistência de doações em PostgreSQL', () => {
  it('preserva o valor exato em BRL e rejeita a repetição do hash de intenção', async () => {
    const intentKeyHash = randomUUID();
    const orderId = await addOrder(intentKeyHash);
    await expect(addOrder(intentKeyHash)).rejects.toMatchObject({ code: '23505' });

    const result = await pool.query(
      'SELECT amount::text, currency, status FROM donation_orders WHERE id = $1',
      [orderId],
    );
    expect(result.rows).toEqual([{ amount: '10.37', currency: 'BRL', status: 'pendente' }]);
    await expect(pool.query('UPDATE donation_orders SET amount = 11.37 WHERE id = $1', [orderId]))
      .rejects.toMatchObject({ code: '23514' });
    const persisted = await pool.query('SELECT amount::text FROM donation_orders WHERE id = $1', [orderId]);
    expect(persisted.rows).toEqual([{ amount: '10.37' }]);
  });

  it('aplica unicidade de operação por pedido e de sessão entre tentativas', async () => {
    const orderId = await addOrder();
    const anotherOrderId = await addOrder();
    const checkoutSessionId = `cs_test_${randomUUID()}`;
    const paymentId = await addPayment(orderId, checkoutSessionId);
    const anotherPaymentId = await addPayment(anotherOrderId);
    const operationKey = randomUUID();
    const insertOperation = `INSERT INTO donation_operations
      (order_id, operation_key, fingerprint, payment_id) VALUES ($1, $2, $3, $4)`;

    await pool.query(insertOperation, [orderId, operationKey, 'fingerprint-a', paymentId]);
    await expect(pool.query(insertOperation, [orderId, operationKey, 'fingerprint-b', paymentId]))
      .rejects.toMatchObject({ code: '23505' });
    await expect(pool.query(insertOperation, [anotherOrderId, operationKey, 'fingerprint-b', anotherPaymentId]))
      .resolves.toMatchObject({ rowCount: 1 });
    await expect(addPayment(anotherOrderId, checkoutSessionId))
      .rejects.toMatchObject({ code: '23505' });
  });

  it('rejeita operação, evento e reserva associados a outro pedido', async () => {
    const orderId = await addOrder();
    const otherOrderId = await addOrder();
    const paymentId = await addPayment(otherOrderId);
    const operationKey = randomUUID();
    const eventId = `evt_${randomUUID()}`;
    const insertOperation = `INSERT INTO donation_operations
      (order_id, operation_key, fingerprint, payment_id) VALUES ($1, $2, $3, $4)`;

    await expect(pool.query(insertOperation, [orderId, operationKey, 'fingerprint-a', paymentId]))
      .rejects.toMatchObject({ code: '23503' });
    await expect(pool.query(
      `INSERT INTO payment_events (order_id, payment_id, stripe_event_id, origin, to_status)
       VALUES ($1, $2, $3, 'webhook', 'recusada')`,
      [orderId, paymentId, eventId],
    )).rejects.toMatchObject({ code: '23503' });

    await pool.query(insertOperation, [otherOrderId, operationKey, 'fingerprint-b', paymentId]);
    await expect(pool.query(
      'INSERT INTO donation_opening_reservations (order_id, operation_key) VALUES ($1, $2)',
      [orderId, operationKey],
    )).rejects.toMatchObject({ code: '23503' });
    const records = await pool.query(
      `SELECT (SELECT count(*)::int FROM donation_operations WHERE order_id = $1) AS operations,
              (SELECT count(*)::int FROM payment_events WHERE stripe_event_id = $2) AS events,
              (SELECT count(*)::int FROM donation_opening_reservations WHERE order_id = $1) AS reservations`,
      [orderId, eventId],
    );
    expect(records.rows).toEqual([{ operations: 0, events: 0, reservations: 0 }]);
  });

  it('reserva a abertura para uma única operação concorrente do pedido', async () => {
    const orderId = await addOrder();
    const { client, donations } = await repository();
    try {
      const openings = [randomUUID(), randomUUID()].map((operationKey) => ({
        orderId,
        operationKey,
        fingerprint: 'fingerprint-a',
        stripeIdempotencyKey: randomUUID(),
      }));
      const results = await Promise.all(openings.map((opening) => donations.reserveOpening(opening)));
      const winners = results.filter((result) => result !== null);
      expect(winners).toHaveLength(1);
      const [winner] = winners;
      expect(winner.orderId).toBe(orderId);

      const reserved = await pool.query(
        `SELECT r.operation_key, o.payment_id FROM donation_opening_reservations r
         JOIN donation_operations o USING (order_id, operation_key) WHERE r.order_id = $1`,
        [orderId],
      );
      expect(reserved.rows).toEqual([{ operation_key: winner.operationKey, payment_id: winner.paymentId }]);
      const payments = await pool.query('SELECT id FROM payments WHERE order_id = $1', [orderId]);
      expect(payments.rows).toEqual([{ id: winner.paymentId }]);
      const operations = await pool.query('SELECT operation_key FROM donation_operations WHERE order_id = $1', [orderId]);
      expect(operations.rows).toEqual([{ operation_key: winner.operationKey }]);

      const [loser] = openings.filter((opening) => opening.operationKey !== winner.operationKey);
      await expect(donations.releaseOpening(loser)).resolves.toBe(false);
      await expect(donations.releaseOpening(winner)).resolves.toBe(true);
    } finally {
      await client.$disconnect();
    }
  });

  it('desfaz a confirmação se o evento falhar e mantém a recusa após o sucesso', async () => {
    const orderId = await addOrder();
    const checkoutSessionId = `cs_test_${randomUUID()}`;
    const paymentId = await addPayment(orderId, checkoutSessionId);
    const declinedEventId = `evt_${randomUUID()}`;
    const confirmedEventId = `evt_${randomUUID()}`;
    const confirmedAt = new Date('2026-11-08T17:30:00.000Z');
    const { client, donations } = await repository();
    try {
      await pool.query("UPDATE payments SET status = 'recusada' WHERE id = $1", [paymentId]);
      await pool.query(
        `INSERT INTO payment_events (order_id, payment_id, stripe_event_id, origin, to_status, reason)
         VALUES ($1, $2, $3, 'webhook', 'recusada', 'CARTAO_RECUSADO')`,
        [orderId, paymentId, declinedEventId],
      );

      const confirmation = { orderId, paymentId, checkoutSessionId, confirmedAt };
      await expect(donations.confirmPayment({ ...confirmation, stripeEventId: declinedEventId }))
        .rejects.toMatchObject({ code: 'P2002' });

      const readStates = () => pool.query(
        `SELECT o.status AS order_status, p.status AS payment_status,
                o.confirmed_at AT TIME ZONE 'UTC' AS order_confirmed_at,
                p.confirmed_at AT TIME ZONE 'UTC' AS payment_confirmed_at
         FROM donation_orders o JOIN payments p ON p.order_id = o.id WHERE p.id = $1`,
        [paymentId],
      );
      expect((await readStates()).rows).toEqual([{
        order_status: 'pendente', payment_status: 'recusada',
        order_confirmed_at: null, payment_confirmed_at: null,
      }]);

      await expect(donations.confirmPayment({ ...confirmation, stripeEventId: confirmedEventId }))
        .resolves.toBe(true);
      expect((await readStates()).rows).toEqual([{
        order_status: 'pago', payment_status: 'paga',
        order_confirmed_at: confirmedAt, payment_confirmed_at: confirmedAt,
      }]);
      const events = await pool.query(
        'SELECT stripe_event_id, to_status, reason FROM payment_events WHERE payment_id = $1',
        [paymentId],
      );
      expect(events.rows).toHaveLength(2);
      expect(events.rows).toEqual(expect.arrayContaining([
        { stripe_event_id: declinedEventId, to_status: 'recusada', reason: 'CARTAO_RECUSADO' },
        { stripe_event_id: confirmedEventId, to_status: 'paga', reason: null },
      ]));
    } finally {
      await client.$disconnect();
    }
  });

  it('conserva a confirmação de outra tentativa sem alterar a confirmação do pedido', async () => {
    const orderId = await addOrder();
    const attempts = [];
    for (const time of ['2026-11-08T17:30:00.000Z', '2026-11-08T17:31:00.000Z']) {
      const checkoutSessionId = `cs_test_${randomUUID()}`;
      const paymentId = await addPayment(orderId, checkoutSessionId);
      attempts.push({
        orderId,
        paymentId,
        checkoutSessionId,
        stripeEventId: `evt_${randomUUID()}`,
        confirmedAt: new Date(time),
      });
    }
    const [first, second] = attempts;
    const { client, donations } = await repository();
    try {
      await expect(donations.confirmPayment(first)).resolves.toBe(true);
      await expect(donations.confirmPayment({ ...first, stripeEventId: `evt_${randomUUID()}` }))
        .resolves.toBe(false);
      await expect(donations.confirmPayment(second)).resolves.toBe(true);

      const order = await pool.query(
        "SELECT status, confirmed_at AT TIME ZONE 'UTC' AS confirmed_at FROM donation_orders WHERE id = $1",
        [orderId],
      );
      expect(order.rows).toEqual([{ status: 'pago', confirmed_at: first.confirmedAt }]);
      const confirmations = await pool.query(
        `SELECT p.id, p.status, p.confirmed_at AT TIME ZONE 'UTC' AS confirmed_at, e.stripe_event_id
         FROM payments p JOIN payment_events e ON e.order_id = p.order_id AND e.payment_id = p.id
         WHERE p.order_id = $1 ORDER BY p.confirmed_at`,
        [orderId],
      );
      expect(confirmations.rows).toEqual(attempts.map(({ paymentId, confirmedAt, stripeEventId }) => ({
        id: paymentId, status: 'paga', confirmed_at: confirmedAt, stripe_event_id: stripeEventId,
      })));
    } finally {
      await client.$disconnect();
    }
  });
});
