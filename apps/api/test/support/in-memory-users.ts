import { randomUUID } from 'node:crypto';
import { EmailAlreadyRegisteredError, type NewUser, type UserRecord, type UserRepository } from '../../src/auth/ports/user-repository.js';

/** Repositório em memória para os testes de ponta a ponta, sem banco. */
export class InMemoryUsers implements UserRepository {
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
    const row: UserRecord = { id: randomUUID(), role: 'SUPPORTER', createdAt: new Date(), ...user };
    this.rows.push(row);
    return row;
  }
}
