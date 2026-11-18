import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Server } from 'node:http';
import { Pool } from 'pg';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { authorization, testToken } from '../support/auth.js';
import { createDbUser } from '../support/db-users.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('Defina DATABASE_URL para o PostgreSQL descartável antes de executar test:db.');

const base = '/donation-drafts';

describe('Rascunhos de doação via HTTP e PostgreSQL', () => {
  const pool = new Pool({ connectionString, connectionTimeoutMillis: 3000 });
  const users: string[] = [];
  let app: INestApplication<Server>;
  let owner: string;
  let other: string;

  beforeAll(async () => {
    owner = (await createDbUser(pool)).id;
    users.push(owner);
    other = (await createDbUser(pool)).id;
    users.push(other);
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    try {
      if (app) {
        await app.get(PrismaClient).$disconnect();
        await app.close();
      }
      const { rows } = await pool.query("SELECT to_regclass('public.donation_drafts') AS drafts");
      if (rows[0].drafts) {
        await pool.query('DELETE FROM donation_drafts WHERE user_id = ANY($1::uuid[])', [users]);
      }
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [users]);
    } finally {
      await pool.end();
    }
  });

  const http = () => request(app.getHttpServer());
  const ownerAuth = () => authorization(testToken({ sub: owner }));
  const otherAuth = (role: 'SUPPORTER' | 'ADMIN' = 'SUPPORTER') => authorization(testToken({ sub: other, role }));

  it('CA1–CA5: cria rascunhos relacionados e limita o CRUD ao dono', async () => {
    const first = await http().post(base).set(ownerAuth()).send({ amount: '25.00' }).expect(201);
    const second = await http().post(base).set(ownerAuth()).send({ amount: '9999999999.99' }).expect(201);
    const a = first.body.data;
    const b = second.body.data;
    expect(a).toEqual({
      id: expect.any(String), amount: '25.00', currency: 'BRL',
      createdAt: expect.any(String), updatedAt: expect.any(String),
    });
    expect(a.id).not.toBe(b.id);
    const { rows } = await pool.query('SELECT id, user_id FROM donation_drafts WHERE id = ANY($1::uuid[])', [[a.id, b.id]]);
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.user_id === owner)).toBe(true);

    const listed = await http().get(base).set(ownerAuth()).expect(200);
    const newestFirst = [a, b].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
    expect(listed.body.data).toEqual(newestFirst);
    expect((await http().get(base).set(otherAuth()).expect(200)).body).toEqual({ data: [] });
    expect((await http().get(`${base}/${b.id}`).set(ownerAuth()).expect(200)).body.data.amount).toBe('9999999999.99');

    const path = `${base}/${a.id}`;
    for (const role of ['SUPPORTER', 'ADMIN'] as const) {
      await http().get(path).set(otherAuth(role)).expect(404);
      await http().patch(path).set(otherAuth(role)).send({ amount: '40.00' }).expect(404);
      await http().delete(path).set(otherAuth(role)).expect(404);
    }

    const updated = await http().patch(path).set(ownerAuth()).send({ amount: '40.00' }).expect(200);
    expect(updated.body.data).toEqual({ ...a, amount: '40.00', updatedAt: expect.any(String) });
    expect((await http().get(path).set(ownerAuth()).expect(200)).body).toEqual(updated.body);

    const order = await pool.query(
      'INSERT INTO donation_orders (intent_key_hash, amount, user_id) VALUES ($1, $2, $3) RETURNING id',
      [randomUUID(), '5.00', owner],
    );
    const orderId = order.rows[0].id;
    try {
      const payment = await pool.query(
        'INSERT INTO payments (order_id, stripe_idempotency_key) VALUES ($1, $2) RETURNING id',
        [orderId, randomUUID()],
      );
      const removed = await http().delete(path).set(ownerAuth()).expect(204);
      expect(removed.text).toBe('');
      await http().get(path).set(ownerAuth()).expect(404);
      await http().patch(path).set(ownerAuth()).send({ amount: '25.00' }).expect(404);
      await http().delete(path).set(ownerAuth()).expect(404);
      expect((await http().get(base).set(ownerAuth()).expect(200)).body.data).toEqual([b]);
      const preserved = await pool.query(
        'SELECT p.id FROM payments p JOIN donation_orders o ON o.id = p.order_id WHERE o.id = $1',
        [orderId],
      );
      expect(preserved.rows).toEqual(payment.rows);
    } finally {
      await pool.query('DELETE FROM payments WHERE order_id = $1', [orderId]);
      await pool.query('DELETE FROM donation_orders WHERE id = $1', [orderId]);
    }
  });

  it('CA5: exige JWT nas cinco operações', async () => {
    const item = `${base}/${randomUUID()}`;
    await http().post(base).send({ amount: '25.00' }).expect(401);
    await http().get(base).expect(401);
    await http().get(item).expect(401);
    await http().patch(item).send({ amount: '25.00' }).expect(401);
    await http().delete(item).expect(401);
  });

  it('CA6: rejeita dados inválidos e extras antes de escrever', async () => {
    const before = await http().get(base).set(ownerAuth()).expect(200);
    for (const body of [
      {}, { amount: 25 }, { amount: '0.00' }, { amount: '25.000' }, { amount: '10000000000.00' },
      { amount: '25.00', userId: other }, { amount: '25.00', currency: 'BRL' },
    ]) {
      await http().post(base).set(ownerAuth()).send(body).expect(400);
    }
    const invalid = `${base}/invalido`;
    await http().get(invalid).set(ownerAuth()).expect(400);
    await http().patch(invalid).set(ownerAuth()).send({ amount: '25.00' }).expect(400);
    await http().delete(invalid).set(ownerAuth()).expect(400);
    expect((await http().get(base).set(ownerAuth()).expect(200)).body).toEqual(before.body);
  });

  it('CA7: a chave estrangeira recusa um rascunho com dono inexistente', async () => {
    await expect(pool.query(
      'INSERT INTO donation_drafts (user_id, amount) VALUES ($1, $2)',
      [randomUUID(), '1.00'],
    )).rejects.toMatchObject({ code: '23503' });
  });
});
