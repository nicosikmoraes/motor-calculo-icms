import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcrypt';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { PrismaUserRepository } from '../../src/auth/adapters/prisma/prisma-user-repository.js';
import { BcryptPasswordHasher } from '../../src/auth/adapters/bcrypt/bcrypt-password-hasher.js';
import { RegisterUser } from '../../src/auth/application/register-user.js';
import { EmailAlreadyRegisteredError } from '../../src/auth/ports/user-repository.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('Defina DATABASE_URL para o PostgreSQL descartável antes de executar test:db.');

const pool = new Pool({ connectionString, connectionTimeoutMillis: 3000 });
const client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
const emails: string[] = [];

afterEach(async () => {
  if (emails.length) await pool.query('DELETE FROM users WHERE email = ANY($1::text[])', [emails.splice(0)]);
});
afterAll(async () => { await client.$disconnect(); await pool.end(); });

describe('usuários no PostgreSQL', () => {
  it('grava o hash bcrypt (custo 12, com salt próprio) e nunca a senha', async () => {
    const register = new RegisterUser(new PrismaUserRepository(client), new BcryptPasswordHasher());
    const [a, b] = [`a-${Date.now()}@example.test`, `b-${Date.now()}@example.test`];
    emails.push(a, b);
    await register.execute({ email: a, password: 'mesma-senha' });
    await register.execute({ email: b, password: 'mesma-senha' });

    const rows = (await pool.query('SELECT email, password_hash, role FROM users WHERE email = ANY($1) ORDER BY email', [[a, b]])).rows;
    expect(rows.map((row) => row.role)).toEqual(['SUPPORTER', 'SUPPORTER']);
    for (const row of rows) {
      expect(row.password_hash).toMatch(/^\$2b\$12\$/);
      expect(row.password_hash).not.toContain('mesma-senha');
      expect(await bcrypt.compare('mesma-senha', row.password_hash)).toBe(true);
    }
    // Mesma senha, hashes diferentes: o salt é por usuário.
    expect(rows[0].password_hash).not.toBe(rows[1].password_hash);
  });

  it('traduz a violação de unicidade do e-mail (inclusive em corrida) para EmailAlreadyRegisteredError', async () => {
    const repository = new PrismaUserRepository(client);
    const email = `corrida-${Date.now()}@example.test`;
    emails.push(email);
    const results = await Promise.allSettled([
      repository.create({ email, passwordHash: 'x' }),
      repository.create({ email, passwordHash: 'y' }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((result) => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(EmailAlreadyRegisteredError);
  });

  it('busca por e-mail e por id devolvendo o hash só para uso interno', async () => {
    const repository = new PrismaUserRepository(client);
    const email = `busca-${Date.now()}@example.test`;
    emails.push(email);
    const created = await repository.create({ email, passwordHash: 'hash-interno' });
    expect(created).not.toHaveProperty('passwordHash');
    expect((await repository.findByEmail(email))?.passwordHash).toBe('hash-interno');
    expect(await repository.findById(created.id)).toEqual(created);
    expect(await repository.findById('00000000-0000-0000-0000-000000000000')).toBeNull();
  });
});
