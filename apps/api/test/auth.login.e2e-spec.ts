import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { USER_REPOSITORY } from '../src/auth/ports/user-repository.js';
import { PASSWORD_HASHER } from '../src/auth/application/password-hasher.js';
import { BcryptPasswordHasher } from '../src/auth/adapters/bcrypt/bcrypt-password-hasher.js';
import { InMemoryUsers } from './support/in-memory-users.js';

describe('POST /auth/login', () => {
  let app: INestApplication<Server>;
  let hasher: BcryptPasswordHasher;

  beforeEach(async () => {
    hasher = new BcryptPasswordHasher(4); // custo baixo só para o teste ficar rápido
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(USER_REPOSITORY).useValue(new InMemoryUsers())
      .overrideProvider(PASSWORD_HASHER).useValue(hasher)
      .compile();
    app = module.createNestApplication();
    await app.init();
    await request(app.getHttpServer()).post('/auth/register').send({ email: 'ana@example.test', password: 'senha-certa' }).expect(201);
  });

  afterEach(async () => app.close());

  const login = (body: object) => request(app.getHttpServer()).post('/auth/login').send(body);

  it('CA4: com a senha certa devolve 200 e um token que só carrega sub, role, iat e exp (2 h)', async () => {
    const response = await login({ email: 'ANA@example.test', password: 'senha-certa' }).expect(200);
    const { accessToken, tokenType, expiresIn } = response.body.data;
    expect({ tokenType, expiresIn }).toEqual({ tokenType: 'Bearer', expiresIn: 7200 });

    const payload = new JwtService({ secret: process.env.JWT_SECRET }).verify<Record<string, unknown>>(accessToken, { algorithms: ['HS256'] });
    expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'role', 'sub']);
    expect(payload.role).toBe('SUPPORTER');
    expect(payload.sub).toEqual(expect.any(String));
    expect(Number(payload.exp) - Number(payload.iat)).toBe(7200);
  });

  it('CA5: senha errada e e-mail inexistente recebem a mesma resposta 401, e os dois comparam um hash bcrypt', async () => {
    const compare = vi.spyOn(hasher, 'compare');

    const wrongPassword = await login({ email: 'ana@example.test', password: 'senha-errada' }).expect(401);
    const unknownEmail = await login({ email: 'ninguem@example.test', password: 'senha-certa' }).expect(401);

    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body).toEqual({ error: { statusCode: 401, message: 'E-mail ou senha inválidos' } });
    expect(compare).toHaveBeenCalledTimes(2);
    for (const [, hash] of compare.mock.calls) expect(hash).toMatch(/^\$2b\$/);
  });

  it('senha com mais de 72 bytes não entra, mesmo começando pela senha cadastrada (o bcrypt ignoraria o resto)', async () => {
    const longPassword = 'a'.repeat(72);
    await request(app.getHttpServer()).post('/auth/register').send({ email: 'longa@example.test', password: longPassword }).expect(201);
    await login({ email: 'longa@example.test', password: longPassword }).expect(200);
    const response = await login({ email: 'longa@example.test', password: `${longPassword}QUALQUER` }).expect(401);
    expect(response.body.error.message).toBe('E-mail ou senha inválidos');
  });

  it.each([
    ['sem senha', { email: 'ana@example.test' }],
    ['e-mail que não é e-mail', { email: 'ana', password: 'senha-certa' }],
    ['campo extra', { email: 'ana@example.test', password: 'senha-certa', role: 'ADMIN' }],
  ])('responde 400 para um corpo inválido (%s)', async (_case, body) => {
    await login(body).expect(400);
  });
});
