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

  it('contém somente as tabelas de doação, de usuários e o histórico de migrations', async () => {
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
      'users',
    ].map((table_name) => ({ table_name, table_type: 'BASE TABLE' })));
  });

  it('guarda usuários só com hash de senha, e-mail único e papel padrão SUPPORTER', async () => {
    const columns = await pool.query(
      `SELECT column_name, is_nullable, column_default FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'users' ORDER BY column_name COLLATE "C"`,
    );
    const names = columns.rows.map((column: { column_name: string }) => column.column_name);
    expect(names).toEqual(['created_at', 'email', 'id', 'password_hash', 'role', 'updated_at']);
    // Nenhuma coluna onde uma senha legível pudesse morar.
    expect(names.filter((name: string) => /^password$|senha|plain/i.test(name))).toEqual([]);
    const role = columns.rows.find((column: { column_name: string }) => column.column_name === 'role');
    expect(role.column_default).toMatch(/'SUPPORTER'/);

    const enumValues = await pool.query(`SELECT unnest(enum_range(NULL::"Role"))::text AS value`);
    expect(enumValues.rows.map((row: { value: string }) => row.value)).toEqual(['SUPPORTER', 'ADMIN']);

    const email = `unico-${Date.now()}@example.test`;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`INSERT INTO users (email, password_hash) VALUES ($1, 'x')`, [email]);
      await expect(client.query(`INSERT INTO users (email, password_hash) VALUES ($1, 'y')`, [email]))
        .rejects.toThrow(/unique|duplicate/i);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
