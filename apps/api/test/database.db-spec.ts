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

describe('PostgreSQL de desenvolvimento da API', () => {
  it('conecta pela DATABASE_URL, incluindo a porta e a credencial externas ao container', async () => {
    const result = await pool.query('SELECT current_database() AS name, current_user AS role');
    expect(result.rows).toEqual([{ name: 'appdb', role: 'app' }]);
  });

  it('continua sem tabelas ou views no schema public', async () => {
    const result = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
    expect(result.rows).toEqual([]);
  });
});
