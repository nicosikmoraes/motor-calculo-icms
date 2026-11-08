import 'dotenv/config';
import { Pool } from 'pg';

if (!process.env.DATABASE_URL) {
  throw new Error('Defina DATABASE_URL e suba o PostgreSQL antes de executar test:db.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 3000,
});

afterAll(async () => pool.end());

describe('PostgreSQL da API', () => {
  it('conecta pela DATABASE_URL, incluindo a porta e a credencial externas ao container', async () => {
    const result = await pool.query('SELECT current_database() AS name, current_user AS role');
    expect(result.rows).toEqual([{ name: 'appdb', role: 'app' }]);
  });

  it('contém somente as tabelas de doação e o histórico de migrations', async () => {
    const result = await pool.query(
      `SELECT table_name, table_type FROM information_schema.tables
       WHERE table_schema = 'public' ORDER BY table_name COLLATE "C"`,
    );
    expect(result.rows).toEqual([
      '_prisma_migrations',
      'donation_opening_reservations',
      'donation_operations',
      'donation_orders',
      'payment_events',
      'payments',
    ].map((table_name) => ({ table_name, table_type: 'BASE TABLE' })));
  });
});
