import { InvalidCredentialsError, Login } from './login.js';
import type { PasswordHasher } from './password-hasher.js';
import type { AccessTokenIssuer } from './access-token-issuer.js';
import type { UserRecord, UserRepository } from '../ports/user-repository.js';

const ana: UserRecord = { id: 'u1', email: 'ana@example.test', role: 'SUPPORTER', createdAt: new Date(), passwordHash: 'hash(senha-certa)' };

function setup() {
  const users: UserRepository = {
    findByEmail: async (email) => (email === ana.email ? ana : null),
    findById: async () => null,
    create: async () => { throw new Error('não usado'); },
  };
  const compared: string[] = [];
  const hasher: PasswordHasher = {
    hash: async (password) => `hash(${password})`,
    compare: async (password, hash) => { compared.push(hash); return hash === `hash(${password})`; },
  };
  const signed: unknown[] = [];
  const tokens: AccessTokenIssuer = { sign: async (payload) => { signed.push(payload); return 'token-assinado'; } };
  const login = new Login(users, hasher, tokens, 'hash-ficticio');
  return { login, compared, signed };
}

describe('Login', () => {
  it('com a senha certa assina um token só com sub e role', async () => {
    const { login, signed } = setup();
    const result = await login.execute({ email: ' ANA@example.test ', password: 'senha-certa' });

    expect(result).toEqual({ accessToken: 'token-assinado', tokenType: 'Bearer', expiresIn: 7200 });
    expect(signed).toEqual([{ sub: 'u1', role: 'SUPPORTER' }]);
  });

  it('senha errada e e-mail inexistente dão o mesmo erro, e os dois passam por uma comparação de hash', async () => {
    const { login, compared, signed } = setup();

    const wrongPassword = await login.execute({ email: 'ana@example.test', password: 'senha-errada' }).catch((error) => error);
    const unknownEmail = await login.execute({ email: 'ninguem@example.test', password: 'senha-certa' }).catch((error) => error);

    expect(wrongPassword).toBeInstanceOf(InvalidCredentialsError);
    expect(unknownEmail).toBeInstanceOf(InvalidCredentialsError);
    expect(wrongPassword.message).toBe(unknownEmail.message);
    // O e-mail inexistente compara contra o hash fictício: o tempo não entrega a diferença.
    expect(compared).toEqual(['hash(senha-certa)', 'hash-ficticio']);
    expect(signed).toEqual([]);
  });
});
