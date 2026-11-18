import { EmailAlreadyRegisteredError, type NewUser, type UserRecord, type UserRepository } from '../../src/auth/ports/user-repository.js';
import type { PasswordHasher } from '../../src/auth/application/password-hasher.js';
import { RegisterUser } from '../../src/auth/application/register-user.js';

class InMemoryUsers implements UserRepository {
  readonly rows: UserRecord[] = [];
  async findByEmail(email: string) { return this.rows.find((row) => row.email === email) ?? null; }
  async findById(id: string) {
    const row = this.rows.find((candidate) => candidate.id === id);
    if (!row) return null;
    const { passwordHash: _hash, ...user } = row;
    return user;
  }
  async create(user: NewUser) {
    if (this.rows.some((row) => row.email === user.email)) throw new EmailAlreadyRegisteredError();
    const row: UserRecord = { id: `u${this.rows.length + 1}`, role: 'SUPPORTER', createdAt: new Date('2026-11-17T12:00:00Z'), ...user };
    this.rows.push(row);
    return row;
  }
}

const hasher: PasswordHasher = {
  hash: async (password) => `hash(${password})`,
  compare: async (password, hash) => hash === `hash(${password})`,
};

describe('RegisterUser', () => {
  it('normaliza o e-mail, guarda só o hash e devolve o usuário sem o hash', async () => {
    const users = new InMemoryUsers();
    const user = await new RegisterUser(users, hasher).execute({ email: '  Ana@Example.TEST ', password: 'senha-forte' });

    expect(user).toEqual({ id: 'u1', email: 'ana@example.test', role: 'SUPPORTER', createdAt: new Date('2026-11-17T12:00:00Z') });
    expect(user).not.toHaveProperty('passwordHash');
    expect(users.rows[0].passwordHash).toBe('hash(senha-forte)');
  });

  it('recusa o mesmo e-mail com outra caixa ou com espaços', async () => {
    const users = new InMemoryUsers();
    const register = new RegisterUser(users, hasher);
    await register.execute({ email: 'ana@example.test', password: 'senha-forte' });

    await expect(register.execute({ email: ' ANA@example.test', password: 'outra-senha' })).rejects.toBeInstanceOf(EmailAlreadyRegisteredError);
    expect(users.rows).toHaveLength(1);
  });

  it('nunca grava papel vindo de fora: todo cadastro nasce SUPPORTER', async () => {
    const users = new InMemoryUsers();
    const input = { email: 'ana@example.test', password: 'senha-forte', role: 'ADMIN' } as never;
    const user = await new RegisterUser(users, hasher).execute(input);
    expect(user.role).toBe('SUPPORTER');
    expect(users.rows[0]).not.toHaveProperty('role', 'ADMIN');
  });
});
