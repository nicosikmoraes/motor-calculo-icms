import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { AppModule } from '../../src/app.module.js';
import { USER_REPOSITORY } from '../../src/auth/ports/user-repository.js';
import { InMemoryUsers } from '../support/in-memory-users.js';

describe('POST /auth/register', () => {
  let app: INestApplication<Server>;
  let users: InMemoryUsers;

  beforeEach(async () => {
    users = new InMemoryUsers();
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(USER_REPOSITORY).useValue(users)
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => app.close());

  const register = (body: unknown) => request(app.getHttpServer()).post('/auth/register').send(body as object);

  it('CA1: responde 201 com o usuário, sem senha nem hash, e grava um hash bcrypt', async () => {
    const response = await register({ email: 'Ana@Example.test', password: 'senha-forte' }).expect(201);

    expect(response.body.data).toEqual({ id: expect.any(String), email: 'ana@example.test', role: 'SUPPORTER', createdAt: expect.any(String) });
    expect(JSON.stringify(response.body)).not.toMatch(/password|senha-forte|\$2[aby]\$/i);
    expect(users.rows[0].passwordHash).toMatch(/^\$2b\$12\$/);
  });

  it('CA2: responde 409 para um e-mail já cadastrado, mesmo com outra caixa e espaços', async () => {
    await register({ email: 'ana@example.test', password: 'senha-forte' }).expect(201);
    const response = await register({ email: '  ANA@example.TEST ', password: 'outra-senha' }).expect(409);

    expect(response.body.error.message).toBe('E-mail já cadastrado');
    expect(users.rows).toHaveLength(1);
  });

  it.each([
    ['e-mail inválido', { email: 'nao-e-email', password: 'senha-forte' }],
    ['sem e-mail', { password: 'senha-forte' }],
    ['senha com menos de 8 bytes', { email: 'ana@example.test', password: '1234567' }],
    ['senha com mais de 72 bytes', { email: 'ana@example.test', password: 'a'.repeat(73) }],
    ['senha curta em caracteres mas longa em bytes', { email: 'ana@example.test', password: 'ç'.repeat(37) }],
    ['senha que não é texto', { email: 'ana@example.test', password: 12345678 }],
    ['campo role no corpo', { email: 'ana@example.test', password: 'senha-forte', role: 'ADMIN' }],
  ])('CA3: responde 400 e não grava nada (%s)', async (_case, body) => {
    const response = await register(body).expect(400);
    expect(response.body.error.statusCode).toBe(400);
    expect(users.rows).toHaveLength(0);
  });

  it('aceita uma senha de exatamente 72 bytes', async () => {
    await register({ email: 'ana@example.test', password: 'a'.repeat(72) }).expect(201);
  });
});
