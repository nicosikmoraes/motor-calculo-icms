import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { PrismaAdminDonationsQuery } from '../src/donations/adapters/prisma/prisma-admin-donations-query.js';
import { createDbUser } from './support/db-users.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('Defina DATABASE_URL para o PostgreSQL descartável antes de executar test:db.');
const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const orderIds: string[] = [];

afterAll(async () => {
  if (orderIds.length) await pool.query('DELETE FROM donation_orders WHERE id = ANY($1::uuid[])', [orderIds]);
  await prisma.$disconnect();
  await pool.end();
});

describe('lista de pedidos para o administrador no PostgreSQL', () => {
  it('traz os mais recentes primeiro, com o e-mail do dono (ou null) e sem dados internos', async () => {
    const owner = await createDbUser(pool);
    const [older, newer, legacy] = [randomUUID(), randomUUID(), randomUUID()];
    orderIds.push(older, newer, legacy);
    const insert = 'INSERT INTO donation_orders (id, intent_key_hash, amount, user_id, created_at) VALUES ($1, $2, $3, $4, $5)';
    await pool.query(insert, [older, randomUUID(), '10.00', owner.id, '2100-01-01T10:00:00Z']);
    await pool.query(insert, [newer, randomUUID(), '20.00', owner.id, '2100-01-01T12:00:00Z']);
    await pool.query(insert, [legacy, randomUUID(), '30.00', null, '2100-01-01T11:00:00Z']);

    const list = await new PrismaAdminDonationsQuery(prisma).listRecent(3);

    expect(list.map((row) => row.orderId)).toEqual([newer, legacy, older]);
    expect(list[0]).toEqual({ orderId: newer, amount: '20.00', currency: 'BRL', status: 'pendente',
      createdAt: new Date('2100-01-01T12:00:00Z'), ownerEmail: owner.email });
    expect(list[1].ownerEmail).toBeNull();
  });

  it('respeita o limite', async () => {
    expect((await new PrismaAdminDonationsQuery(prisma).listRecent(1)).length).toBeLessThanOrEqual(1);
  });
});
